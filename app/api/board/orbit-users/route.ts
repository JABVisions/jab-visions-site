import { createClient } from "@supabase/supabase-js";
import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardStyle = {
  displayName?: string;
  avatarDataUrl?: string | null;
  visibility?: "public" | "private";
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  board_style?: BoardStyle | null;
};

type ActivityRow = {
  user_id: string | null;
  kind: string | null;
  created_at: string | null;
  meta?: Record<string, any> | null;
};

const SOURCE_TIMEOUT_MS = 3500;

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

function cleanUsername(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value : "";
  const clean = raw.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "");
  return clean || fallback;
}

function cleanName(row: ProfileRow, username: string) {
  const boardName =
    row.board_style && typeof row.board_style === "object"
      ? row.board_style.displayName
      : "";
  const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
  return String(boardName || displayName || username || "Board User").trim();
}

function formatLastActive(iso?: string | null) {
  if (!iso) return "No drops yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No drops yet";

  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Active now";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  if (diff < day * 7) return `${Math.max(1, Math.floor(diff / day))}d ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function isWithin(value: string | null | undefined, ms: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= ms;
}

function deriveState(row: ProfileRow, activity: ActivityRow[]): FriendZoneState {
  const day = 24 * 60 * 60 * 1000;
  const recent = activity.filter((item) => isWithin(item.created_at, day * 7));
  const today = activity.filter((item) => isWithin(item.created_at, day));
  const boardDrops = recent.filter((item) => item.kind === "board_drop");
  const highSignalDrop = recent.some((item) => {
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    const dropType = String(meta?.dropType || meta?.cardStyle || "").toLowerCase();
    return dropType.includes("pay") || dropType.includes("project") || dropType.includes("music");
  });

  const latest = activity[0]?.created_at ?? null;
  if (!latest) return isWithin(row.updated_at, day * 5) ? "fresh" : "phantom";
  if (boardDrops.length >= 2 || recent.length >= 5 || highSignalDrop) return "magnetic";
  if (today.length >= 1) return "active";
  if (isWithin(latest, day * 3)) return "fresh";
  if (isWithin(latest, day * 10)) return "echo";
  if (isWithin(latest, day * 30)) return "fractured";
  return "phantom";
}

function scoreUser(user: FriendZoneOrbUser) {
  const stateScore: Record<FriendZoneState, number> = {
    active: 6,
    magnetic: 5,
    fresh: 4,
    echo: 3,
    fractured: 2,
    phantom: 1,
  };
  return stateScore[user.relationshipState || "fresh"] ?? 0;
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

  const [{ data: profiles, error: profileError }, { data: activityRows }] = await Promise.all([
    selectRows<ProfileRow>(
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, updated_at, board_style")
        .order("updated_at", { ascending: false })
        .limit(Math.max(limit * 2, 24))
    ),
    selectRows<ActivityRow>(
      supabase
        .from("board_activity")
        .select("user_id, kind, created_at, meta")
        .order("created_at", { ascending: false })
        .limit(300)
    ),
  ]);

  if (profileError || !Array.isArray(profiles)) {
    return Response.json({ ok: false, items: [] });
  }

  const activityByUser = new Map<string, ActivityRow[]>();
  for (const activity of (Array.isArray(activityRows) ? activityRows : []) as ActivityRow[]) {
    if (!activity?.user_id) continue;
    const list = activityByUser.get(activity.user_id) ?? [];
    list.push(activity);
    activityByUser.set(activity.user_id, list);
  }

  const seen = new Set<string>();
  const items = (profiles as ProfileRow[])
    .filter((row) => {
      const boardStyle =
        row.board_style && typeof row.board_style === "object" ? row.board_style : null;
      return !!row?.id && boardStyle?.visibility !== "private";
    })
    .map((row): FriendZoneOrbUser | null => {
      const username = cleanUsername(row.username, `boarduser${String(row.id).slice(0, 6)}`);
      if (seen.has(username)) return null;
      seen.add(username);

      const boardStyle =
        row.board_style && typeof row.board_style === "object" ? row.board_style : null;
      const activity = activityByUser.get(row.id) ?? [];
      const name = cleanName(row, username);
      const avatarUrl =
        (typeof boardStyle?.avatarDataUrl === "string" && boardStyle.avatarDataUrl.trim()) ||
        (typeof row.avatar_url === "string" && row.avatar_url.trim()) ||
        "/assets/board-welcome-mark.jpg";

      return {
        id: row.id,
        name,
        username,
        avatarUrl,
        lastActiveLabel: formatLastActive(activity[0]?.created_at ?? row.updated_at),
        relationshipState: deriveState(row, activity),
      };
    })
    .filter((item): item is FriendZoneOrbUser => !!item)
    .sort((a, b) => scoreUser(b) - scoreUser(a))
    .slice(0, limit);

  return Response.json({ ok: true, items });
}
