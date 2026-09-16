"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";
import {
  cleanFriendZoneUsername,
  deriveFriendZoneState,
  formatFriendZoneLastActive,
  isFriendZoneState,
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

    if (!profileError && Array.isArray(profiles) && profiles.length) {
      const publicProfiles = (profiles as ProfileRow[]).filter((row) => {
        if (!row?.id || row.id === currentUserId) return false;
        const boardStyle = parseFriendZoneBoardStyle(row.board_style);
        return boardStyle?.visibility !== "private";
      });

      if (publicProfiles.length) {
        const { data: activityRows } = await withTimeout(
          supabase
            .from("board_activity")
            .select("user_id, kind, created_at, meta")
            .order("created_at", { ascending: false })
            .limit(300),
          { data: [], error: null } as any
        );

        const activityByUser = new Map<string, FriendZoneActivityRow[]>();
        for (const activity of (Array.isArray(activityRows) ? activityRows : []) as FriendZoneActivityRow[]) {
          if (!activity?.user_id) continue;
          const list = activityByUser.get(activity.user_id) ?? [];
          list.push(activity);
          activityByUser.set(activity.user_id, list);
        }

        const seen = new Set<string>();
        const profileOrbs = publicProfiles
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
          .filter((user): user is FriendZoneOrbUser => !!user)
          .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
          .slice(0, limit);

        if (profileOrbs.length) return profileOrbs;
      }
    }

    const activityOrbs = await loadOrbsFromActivityApi(limit, currentUserId);
    if (activityOrbs.length) return activityOrbs;

    return FALLBACK_FRIEND_ZONE_ORBS.slice(0, limit);
  } catch {
    return FALLBACK_FRIEND_ZONE_ORBS.slice(0, limit);
  }
}
