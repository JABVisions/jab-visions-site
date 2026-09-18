import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FriendZoneOrbUser } from "@/lib/board/friendZoneSignals";
import {
  mergeFriendZoneOrbs,
  orbFromProfileLike,
  orbsFromActivityRows,
  parseFriendZoneBoardStyle,
  type FriendZoneActivityRow,
} from "@/lib/board/friendZoneOrbs";
import { applySignedBoardAvatars, supabaseAvatarSigner } from "@/lib/board/signBoardAvatars";

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

type PresenceRow = {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  last_seen_at?: string | null;
  visible?: boolean | null;
};

const SOURCE_TIMEOUT_MS = 8000;

function supabaseSession() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const cookieStore = cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => {
        try {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // GET handlers may not persist refreshed auth cookies.
        }
      },
    },
  });
}

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
    return { data: [] as T[], error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function loadProfiles(client: { from: SupabaseClient["from"] } | null, limit: number) {
  if (!client) return [] as ProfileRow[];
  const { data } = await selectRows<ProfileRow>(
    client
      .from("profiles")
      .select("id, username, display_name, avatar_url, updated_at, board_style")
      .order("updated_at", { ascending: false })
      .limit(Math.max(limit * 2, 80))
  );
  return data;
}

async function loadDirectoryRpc(client: { rpc?: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> } | null) {
  if (!client?.rpc) return [] as ProfileRow[];
  try {
    const { data, error } = await selectRows<ProfileRow & { last_seen_at?: string | null }>(
      client.rpc("list_friend_zone_profiles") as PromiseLike<{
        data: Array<ProfileRow & { last_seen_at?: string | null }> | null;
        error: unknown;
      }>
    );
    if (error) return [];
    return data;
  } catch {
    return [];
  }
}

async function loadPresence(client: { from: SupabaseClient["from"] } | null) {
  if (!client) return [] as PresenceRow[];
  const { data } = await selectRows<PresenceRow>(
    client
      .from("board_orbit")
      .select("user_id, username, display_name, avatar_url, last_seen_at, visible")
      .limit(80)
  );
  const { data: legacy } = await selectRows<PresenceRow>(
    client
      .from("board_presence")
      .select("user_id, username, display_name, avatar_url, last_seen_at, visible")
      .limit(80)
  );
  return [...data, ...legacy].filter((row) => row.visible !== false);
}

export async function GET(req: Request) {
  const sessionClient = supabaseSession();
  const readable = supabaseReadable();
  const db = readable || sessionClient;
  if (!db) {
    return Response.json({ ok: false, items: [] });
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit") || 36)));

  let currentUserId: string | null = null;
  if (sessionClient) {
    try {
      const {
        data: { user },
      } = await sessionClient.auth.getUser();
      currentUserId = user?.id ?? null;
    } catch {
      currentUserId = null;
    }
  }

  const [
    { data: activityRows },
    sessionProfiles,
    readableProfiles,
    rpcProfiles,
    presenceRows,
  ] = await Promise.all([
      selectRows<FriendZoneActivityRow>(
        db
          .from("board_activity")
          .select("user_id, kind, created_at, meta")
          .order("created_at", { ascending: false })
          .limit(500)
      ),
      loadProfiles(sessionClient, limit),
      loadProfiles(readable && readable !== sessionClient ? readable : null, limit),
      loadDirectoryRpc(db),
      loadPresence(db),
    ]);

  const profilesById = new Map<string, ProfileRow>();
  for (const row of [...readableProfiles, ...sessionProfiles, ...rpcProfiles]) {
    if (row?.id) profilesById.set(row.id, row);
  }

  const activityByUser = new Map<string, FriendZoneActivityRow[]>();
  for (const activity of (Array.isArray(activityRows) ? activityRows : []) as FriendZoneActivityRow[]) {
    if (!activity?.user_id) continue;
    const list = activityByUser.get(activity.user_id) ?? [];
    list.push(activity);
    activityByUser.set(activity.user_id, list);
  }

  const presenceByUser = new Map<string, PresenceRow>();
  for (const row of presenceRows) {
    if (!row?.user_id) continue;
    presenceByUser.set(row.user_id, row);
  }

  const profileItems = [...profilesById.values()]
    .map((row) => {
      const presence = presenceByUser.get(row.id);
      const boardStyle = parseFriendZoneBoardStyle(row.board_style);
      return orbFromProfileLike({
        id: row.id,
        username: row.username || presence?.username,
        displayName: row.display_name || presence?.display_name,
        avatarUrl: row.avatar_url || presence?.avatar_url,
        updatedAt: row.updated_at,
        lastSeenAt:
          presence?.last_seen_at ||
          (row as ProfileRow & { last_seen_at?: string }).last_seen_at ||
          boardStyle?.lastSeenAt,
        boardStyle,
        activity: activityByUser.get(row.id) ?? [],
      });
    })
    .filter((item): item is FriendZoneOrbUser => !!item);

  const presenceItems = presenceRows
    .filter((row) => row.user_id && !profilesById.has(row.user_id))
    .map((row) =>
      orbFromProfileLike({
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        lastSeenAt: row.last_seen_at,
        activity: activityByUser.get(row.user_id) ?? [],
      })
    )
    .filter((item): item is FriendZoneOrbUser => !!item);

  const excludeIds = new Set(
    [...profileItems, ...presenceItems]
      .map((item) => item.id)
      .filter(Boolean) as string[]
  );
  if (currentUserId) excludeIds.add(currentUserId);

  const activityItems = orbsFromActivityRows(activityRows, {
    currentUserId,
    excludeIds,
    limit: Math.max(limit * 2, 80),
  });

  const items = mergeFriendZoneOrbs([presenceItems, profileItems, activityItems], {
    currentUserId,
    limit,
  });

  return Response.json({
    ok: true,
    items: await applySignedBoardAvatars(supabaseAvatarSigner() || (db as SupabaseClient), items),
  });
}
