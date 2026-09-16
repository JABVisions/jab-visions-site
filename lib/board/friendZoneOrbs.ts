import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";

export const DEFAULT_ORB_AVATAR = "/assets/board-welcome-mark.jpg";

export type FriendZoneBoardStyle = {
  displayName?: string;
  avatarDataUrl?: string | null;
  visibility?: "public" | "private";
};

export type FriendZoneActivityRow = {
  user_id: string | null;
  kind: string | null;
  created_at: string | null;
  meta?: Record<string, any> | null;
};

const VALID_STATES: FriendZoneState[] = [
  "fresh",
  "active",
  "magnetic",
  "echo",
  "fractured",
  "phantom",
];

export function cleanFriendZoneUsername(value: unknown, fallback = "") {
  const raw = typeof value === "string" ? value : "";
  const clean = raw.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "");
  return clean || fallback;
}

export function parseFriendZoneBoardStyle(value: unknown): FriendZoneBoardStyle | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as FriendZoneBoardStyle) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value as FriendZoneBoardStyle;
  return null;
}

/** Hosted http(s) avatars only — iPhone Safari OOMs on giant data: URLs in the dock. */
export function publicOrbAvatarUrl(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (!clean) continue;
    if (clean.startsWith("data:")) continue;
    if (clean.length > 2048) continue;
    if (/^(https?:\/\/|\/)/i.test(clean)) return clean;
  }
  return DEFAULT_ORB_AVATAR;
}

export function formatFriendZoneLastActive(iso?: string | null) {
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

export function deriveFriendZoneState(activity: FriendZoneActivityRow[], updatedAt?: string | null): FriendZoneState {
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
  if (!latest) return isWithin(updatedAt, day * 5) ? "fresh" : "phantom";
  if (boardDrops.length >= 2 || recent.length >= 5 || highSignalDrop) return "magnetic";
  if (today.length >= 1) return "active";
  if (isWithin(latest, day * 3)) return "fresh";
  if (isWithin(latest, day * 10)) return "echo";
  if (isWithin(latest, day * 30)) return "fractured";
  return "phantom";
}

export function scoreFriendZoneUser(user: FriendZoneOrbUser) {
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

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Build orbs from public board_activity when the profiles table is empty or
 * blocked by RLS. Live production currently returns profiles=[], but activity
 * still has authors like johnandy / mshantayah.
 */
export function orbsFromActivityRows(
  rows: FriendZoneActivityRow[] | null | undefined,
  opts: {
    currentUserId?: string | null;
    excludeIds?: Set<string>;
    excludeUsernames?: Set<string>;
    limit: number;
  }
): FriendZoneOrbUser[] {
  const grouped = new Map<string, FriendZoneActivityRow[]>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.user_id) continue;
    if (opts.currentUserId && row.user_id === opts.currentUserId) continue;
    if (opts.excludeIds?.has(row.user_id)) continue;
    const list = grouped.get(row.user_id) ?? [];
    list.push(row);
    grouped.set(row.user_id, list);
  }

  const seen = new Set<string>(opts.excludeUsernames ?? []);
  const orbs: FriendZoneOrbUser[] = [];

  for (const [userId, activity] of grouped) {
    const metas = activity
      .map((row) => (row.meta && typeof row.meta === "object" ? row.meta : null))
      .filter(Boolean) as Record<string, any>[];

    let username = "";
    for (const meta of metas) {
      const candidate = cleanFriendZoneUsername(
        metaString(meta.authorUsername, meta.ownerUsername, meta.username),
        ""
      );
      if (candidate && !candidate.startsWith("boarduser")) {
        username = candidate;
        break;
      }
    }
    if (!username) {
      for (const meta of metas) {
        const candidate = cleanFriendZoneUsername(meta.recipientUsername, "");
        if (candidate && !candidate.startsWith("boarduser")) {
          username = candidate;
          break;
        }
      }
    }
    if (!username) username = `boarduser${userId.slice(0, 6)}`;
    if (seen.has(username)) continue;
    seen.add(username);

    let name = "";
    for (const meta of metas) {
      const candidate = metaString(meta.authorName, meta.displayName, meta.recipientDisplayName);
      if (candidate && candidate.toLowerCase() !== "board user") {
        name = candidate;
        break;
      }
    }
    if (!name) name = username || "Board User";

    orbs.push({
      id: userId,
      name,
      username,
      avatarUrl: publicOrbAvatarUrl(
        ...metas.flatMap((meta) => [meta.authorAvatar, meta.avatarUrl, meta.recipientAvatar])
      ),
      lastActiveLabel: formatFriendZoneLastActive(activity[0]?.created_at),
      relationshipState: deriveFriendZoneState(activity),
    });
  }

  return orbs
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
    .slice(0, opts.limit);
}

export function isFriendZoneState(value: unknown): value is FriendZoneState {
  return typeof value === "string" && VALID_STATES.includes(value as FriendZoneState);
}
