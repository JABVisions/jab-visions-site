"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { loadBoardOptionsSettings } from "@/lib/board/optionsSettings";
import {
  cleanFriendZoneUsername,
  isFriendZoneState,
  mergeFriendZoneOrbs,
  orbFromProfileLike,
  orbsFromActivityRows,
  parseFriendZoneBoardStyle,
  publicOrbAvatarUrl,
  scoreFriendZoneUser,
  type FriendZoneActivityRow,
  type FriendZoneBoardStyle,
} from "@/lib/board/friendZoneOrbs";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  board_style?: FriendZoneBoardStyle | string | null;
};

const FRIEND_ZONE_TIMEOUT_MS = 8000;

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

function cleanName(row: ProfileRow, username: string) {
  const boardStyle = parseFriendZoneBoardStyle(row.board_style);
  const boardName = boardStyle?.displayName;
  const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
  return String(boardName || displayName || username || "Board User").trim();
}

function normalizeApiOrbs(input: unknown, currentUserId: string | null, limit: number) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();

  return input
    .map((item: any): FriendZoneOrbUser | null => {
      if (!item || typeof item !== "object") return null;
      const id = String(item.id || "");
      if (currentUserId && id === currentUserId) return null;
      const username = cleanFriendZoneUsername(item.username, id ? `boarduser${id.slice(0, 6)}` : "");
      const name = String(item.name || username || "Board User").trim();
      const state: FriendZoneState = isFriendZoneState(item.relationshipState)
        ? item.relationshipState
        : isFriendZoneState(item.state)
          ? item.state
          : "fresh";
      if (!username || seen.has(username)) return null;
      seen.add(username);
      return {
        id: id || username,
        name,
        username,
        avatarUrl: publicOrbAvatarUrl(item.avatarUrl),
        lastActiveLabel:
          typeof item.lastActiveLabel === "string" && item.lastActiveLabel.trim()
            ? item.lastActiveLabel.trim()
            : "Board signal",
        relationshipState: state,
      };
    })
    .filter((item): item is FriendZoneOrbUser => !!item)
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
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

async function loadOrbsFromActivityApi(
  limit: number,
  currentUserId: string | null
): Promise<FriendZoneOrbUser[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FRIEND_ZONE_TIMEOUT_MS);
    const response = await fetch(`/api/board/activity?limit=40&offset=0`, {
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return [];
    const payload = await response.json();
    return orbsFromActivityRows(payload?.items as FriendZoneActivityRow[], {
      currentUserId,
      limit,
    });
  } catch {
    return [];
  }
}

export async function beatFriendZonePresence() {
  try {
    const settings = loadBoardOptionsSettings();
    if (!settings.presenceOnline || settings.presenceScope === "hidden") return;
    const identity = readCurrentBoardIdentity();
    await fetch("/api/board/presence", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visible: true,
        username: identity.username || undefined,
        displayName: identity.displayName || settings.displayName || undefined,
        avatarUrl: identity.avatar || undefined,
      }),
    });
  } catch {
    // Presence is best-effort; Friend Zone still loads from activity/profiles.
  }
}

export async function loadBoardUserFriendZoneOrbs(limit = 18): Promise<FriendZoneOrbUser[]> {
  try {
    const supabase = supabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id ?? null;
    const sourceLimit = Math.max(limit * 2, 24);

    const [apiOrbs, profileResult, activityResult, activityOrbs] = await Promise.all([
      loadBoardUserOrbsFromApi(sourceLimit, currentUserId),
      withTimeout(
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, updated_at, board_style")
          .order("updated_at", { ascending: false })
          .limit(sourceLimit),
        { data: null, error: new Error("profiles timeout") } as any
      ),
      withTimeout(
        supabase
          .from("board_activity")
          .select("user_id, kind, created_at, meta")
          .order("created_at", { ascending: false })
          .limit(300),
        { data: [], error: null } as any
      ),
      loadOrbsFromActivityApi(sourceLimit, currentUserId),
    ]);

    const activityByUser = new Map<string, FriendZoneActivityRow[]>();
    for (const activity of (Array.isArray(activityResult?.data)
      ? activityResult.data
      : []) as FriendZoneActivityRow[]) {
      if (!activity?.user_id) continue;
      const list = activityByUser.get(activity.user_id) ?? [];
      list.push(activity);
      activityByUser.set(activity.user_id, list);
    }

    const profileOrbs = Array.isArray(profileResult?.data)
      ? (profileResult.data as ProfileRow[])
          .map((row) =>
            orbFromProfileLike({
              id: row.id,
              username: row.username,
              name: cleanName(row, cleanFriendZoneUsername(row.username, "")),
              displayName: row.display_name,
              avatarUrl: row.avatar_url,
              updatedAt: row.updated_at,
              boardStyle: row.board_style,
              activity: activityByUser.get(row.id) ?? [],
            })
          )
          .filter((user): user is FriendZoneOrbUser => !!user)
      : [];

    const merged = mergeFriendZoneOrbs([apiOrbs, profileOrbs, activityOrbs], {
      currentUserId,
      limit,
    });
    if (merged.length) return merged;

    return FALLBACK_FRIEND_ZONE_ORBS.slice(0, limit);
  } catch {
    return FALLBACK_FRIEND_ZONE_ORBS.slice(0, limit);
  }
}
