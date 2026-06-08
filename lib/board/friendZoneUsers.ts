"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";

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

const FRIEND_ZONE_TIMEOUT_MS = 3500;

export const FALLBACK_FRIEND_ZONE_ORBS: FriendZoneOrbUser[] = [
  {
    id: "demo-chaeyeon",
    name: "Chaeyeon",
    username: "chaeyeon",
    avatarUrl: "/assets/chaeyeon-kim-headshot.jpeg",
    lastActiveLabel: "Fresh board signal",
    relationshipState: "fresh",
  },
  {
    id: "demo-simran",
    name: "Simran",
    username: "simran",
    avatarUrl: "/assets/simran-k-headshot3.jpg",
    lastActiveLabel: "Active today",
    relationshipState: "active",
  },
  {
    id: "demo-hadi",
    name: "Hadi",
    username: "hadi",
    avatarUrl: "/assets/hadi-taloustan-headshot.jpg",
    lastActiveLabel: "Board drops pulling heat",
    relationshipState: "magnetic",
  },
  {
    id: "demo-aria",
    name: "Aria",
    username: "aria",
    avatarUrl: "/assets/aria-patterson-headshot.jpg",
    lastActiveLabel: "Echo from this week",
    relationshipState: "echo",
  },
  {
    id: "demo-haylee",
    name: "Haylee",
    username: "haylee",
    avatarUrl: "/assets/haylee-brown-headshot.jpeg",
    lastActiveLabel: "Signal needs attention",
    relationshipState: "fractured",
  },
  {
    id: "demo-mercy",
    name: "Mercy",
    username: "mercy",
    avatarUrl: "/assets/mercy_jonas.jpg",
    lastActiveLabel: "Quiet orbit",
    relationshipState: "phantom",
  },
];

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
  if (!latest) {
    return isWithin(row.updated_at, day * 5) ? "fresh" : "phantom";
  }

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

function normalizeApiOrbs(input: unknown, currentUserId: string | null, limit: number) {
  if (!Array.isArray(input)) return [];
  const validStates: FriendZoneState[] = [
    "fresh",
    "active",
    "magnetic",
    "echo",
    "fractured",
    "phantom",
  ];
  const seen = new Set<string>();

  return input
    .map((item: any): FriendZoneOrbUser | null => {
      if (!item || typeof item !== "object") return null;
      const id = String(item.id || "");
      if (currentUserId && id === currentUserId) return null;
      const username = cleanUsername(item.username, id ? `boarduser${id.slice(0, 6)}` : "");
      const name = String(item.name || username || "Board User").trim();
      const avatarUrl =
        typeof item.avatarUrl === "string" && item.avatarUrl.trim()
          ? item.avatarUrl.trim()
          : "/assets/board-welcome-mark.jpg";
      const state = validStates.includes(item.relationshipState)
        ? item.relationshipState
        : "fresh";
      if (!username || seen.has(username)) return null;
      seen.add(username);
      return {
        id: id || username,
        name,
        username,
        avatarUrl,
        lastActiveLabel:
          typeof item.lastActiveLabel === "string" && item.lastActiveLabel.trim()
            ? item.lastActiveLabel.trim()
            : "Board signal",
        relationshipState: state,
      };
    })
    .filter((item): item is FriendZoneOrbUser => !!item)
    .sort((a, b) => scoreUser(b) - scoreUser(a))
    .slice(0, limit);
}

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), FRIEND_ZONE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function loadBoardUserOrbsFromApi(limit: number, currentUserId: string | null) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FRIEND_ZONE_TIMEOUT_MS);
    const response = await fetch(`/api/board/orbit-users?limit=${limit}`, {
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return [];
    const payload = await response.json();
    return normalizeApiOrbs(payload?.items, currentUserId, limit);
  } catch {
    return [];
  }
}

export async function loadBoardUserFriendZoneOrbs(limit = 18): Promise<FriendZoneOrbUser[]> {
  try {
    const supabase = supabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id ?? null;

    const apiOrbs = await loadBoardUserOrbsFromApi(limit, currentUserId);
    if (apiOrbs.length) return apiOrbs;

    const profileResult = await withTimeout(
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, updated_at, board_style")
        .order("updated_at", { ascending: false })
        .limit(Math.max(limit * 2, 24)),
      { data: null, error: new Error("profiles timeout") } as any
    );
    const { data: profiles, error: profileError } = profileResult;

    if (profileError || !Array.isArray(profiles)) return [];

    const publicProfiles = (profiles as ProfileRow[]).filter((row) => {
      if (!row?.id || row.id === currentUserId) return false;
      const boardStyle =
        row.board_style && typeof row.board_style === "object" ? row.board_style : null;
      return boardStyle?.visibility !== "private";
    });
    if (!publicProfiles.length) return [];

    const { data: activityRows } = await withTimeout(
      supabase
        .from("board_activity")
        .select("user_id, kind, created_at, meta")
        .order("created_at", { ascending: false })
        .limit(300),
      { data: [], error: null } as any
    );

    const activityByUser = new Map<string, ActivityRow[]>();
    for (const activity of (Array.isArray(activityRows) ? activityRows : []) as ActivityRow[]) {
      if (!activity?.user_id) continue;
      const list = activityByUser.get(activity.user_id) ?? [];
      list.push(activity);
      activityByUser.set(activity.user_id, list);
    }

    const seen = new Set<string>();
    return publicProfiles
      .map((row): FriendZoneOrbUser | null => {
        const username = cleanUsername(row.username, `boarduser${String(row.id).slice(0, 6)}`);
        if (seen.has(username)) return null;
        seen.add(username);

        const boardStyle =
          row.board_style && typeof row.board_style === "object" ? row.board_style : null;
        const activity = activityByUser.get(row.id) ?? [];
        const relationshipState = deriveState(row, activity);
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
          relationshipState,
        };
      })
      .filter((user): user is FriendZoneOrbUser => !!user)
      .sort((a, b) => scoreUser(b) - scoreUser(a))
      .slice(0, limit);
  } catch {
    return [];
  }
}
