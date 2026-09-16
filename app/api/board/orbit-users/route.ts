import { createClient } from "@supabase/supabase-js";
import type { FriendZoneOrbUser } from "@/lib/board/friendZoneSignals";
import {
  cleanFriendZoneUsername,
  deriveFriendZoneState,
  formatFriendZoneLastActive,
  orbsFromActivityRows,
  parseFriendZoneBoardStyle,
  publicOrbAvatarUrl,
  scoreFriendZoneUser,
  type FriendZoneActivityRow,
} from "@/lib/board/friendZoneOrbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  board_style?: unknown;
};

const SOURCE_TIMEOUT_MS = 8000;

function supabaseReadable() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !(service || anon)) return null;

  return createClient(url, service || anon!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanName(row: ProfileRow, username: string) {
  const boardStyle = parseFriendZoneBoardStyle(row.board_style);
  const boardName = boardStyle?.displayName;
  const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
  return String(boardName || displayName || username || "Board User").trim();
}

async function selectRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ data: T[]; error: Error }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ data: [], error: new Error("orbit-users source timed out") }),
      SOURCE_TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([query, timeout]);
    return {
      data: Array.isArray(result.data) ? result.data : [],
      error: result.error,
    };
  } catch (error) {
    return { data: [], error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function GET(req: Request) {
  const supabase = supabaseReadable();
  if (!supabase) {
    return Response.json({ ok: false, items: [] });
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(36, Number(url.searchParams.get("limit") || 18)));

  const [{ data: profiles }, { data: activityRows }] = await Promise.all([
    selectRows<ProfileRow>(
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, updated_at, board_style")
        .order("updated_at", { ascending: false })
        .limit(Math.max(limit * 2, 24))
    ),
    selectRows<FriendZoneActivityRow>(
      supabase
        .from("board_activity")
        .select("user_id, kind, created_at, meta")
        .order("created_at", { ascending: false })
        .limit(300)
    ),
  ]);

  const activityByUser = new Map<string, FriendZoneActivityRow[]>();
  for (const activity of (Array.isArray(activityRows) ? activityRows : []) as FriendZoneActivityRow[]) {
    if (!activity?.user_id) continue;
    const list = activityByUser.get(activity.user_id) ?? [];
    list.push(activity);
    activityByUser.set(activity.user_id, list);
  }

  const seen = new Set<string>();
  const profileItems = (Array.isArray(profiles) ? profiles : [])
    .filter((row) => {
      const boardStyle = parseFriendZoneBoardStyle(row.board_style);
      return !!row?.id && boardStyle?.visibility !== "private";
    })
    .map((row): FriendZoneOrbUser | null => {
      const username = cleanFriendZoneUsername(
        row.username,
        `boarduser${String(row.id).slice(0, 6)}`
      );
      if (seen.has(username)) return null;
      seen.add(username);

      const boardStyle = parseFriendZoneBoardStyle(row.board_style);
      const activity = activityByUser.get(row.id) ?? [];

      return {
        id: row.id,
        name: cleanName(row, username),
        username,
        avatarUrl: publicOrbAvatarUrl(row.avatar_url, boardStyle?.avatarDataUrl),
        lastActiveLabel: formatFriendZoneLastActive(activity[0]?.created_at ?? row.updated_at),
        relationshipState: deriveFriendZoneState(activity, row.updated_at),
      };
    })
    .filter((item): item is FriendZoneOrbUser => !!item)
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a));

  const excludeIds = new Set(profileItems.map((item) => item.id).filter(Boolean) as string[]);
  const activityItems = orbsFromActivityRows(activityRows, {
    excludeIds,
    excludeUsernames: seen,
    limit,
  });

  const items = [...profileItems, ...activityItems]
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
    .slice(0, limit);

  return Response.json({ ok: true, items });
}
