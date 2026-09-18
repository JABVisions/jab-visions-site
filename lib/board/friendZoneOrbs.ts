import type { FriendZoneOrbUser, FriendZoneState } from "@/lib/board/friendZoneSignals";

export const DEFAULT_ORB_AVATAR = "/assets/board-welcome-mark.jpg";

export const FRIEND_ZONE_ONLINE_MS = 10 * 60 * 1000;

export type FriendZoneBoardStyle = {
  displayName?: string;
  avatarDataUrl?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  visibility?: "public" | "private";
  lastSeenAt?: string | null;
  presenceOnline?: boolean;
  presenceScope?: string;
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

const AVATAR_BUCKET = "board-avatars";

function supabasePublicObjectUrl(bucket: string, path: string) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const clean = path.replace(/^\/+/, "").split("?")[0].split("#")[0];
  if (!base || !clean) return "";
  return `${base}/storage/v1/object/public/${bucket}/${clean}`;
}

function rewriteBoardStorageUrl(url: string) {
  if (!url.includes("/storage/v1/")) return "";
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(
      /\/storage\/v1\/(?:object|render\/image)\/(?:sign|authenticated)\//,
      (match) => match.replace(/\/(sign|authenticated)\//, "/public/")
    );
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0] || "";
  }
}

export function publicUrlForAvatarPath(path: unknown) {
  const raw = typeof path === "string" ? path.trim() : "";
  if (!raw || raw.startsWith("data:")) return "";
  const rewritten = rewriteBoardStorageUrl(raw);
  if (rewritten) return rewritten;
  if (/^(https?:\/\/|\/)/i.test(raw)) return raw;
  const storagePath = raw.startsWith(`${AVATAR_BUCKET}/`)
    ? raw.slice(AVATAR_BUCKET.length + 1)
    : raw.replace(/^\/+/, "");
  return supabasePublicObjectUrl(AVATAR_BUCKET, storagePath);
}

/** Hosted http(s) avatars only — iPhone Safari OOMs on giant data: URLs in the dock. */
export function publicOrbAvatarUrl(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (!clean) continue;
    if (clean.startsWith("data:")) continue;
    if (clean.length > 4096) continue;
    const hosted = publicUrlForAvatarPath(clean);
    if (hosted) return hosted;
  }
  return DEFAULT_ORB_AVATAR;
}

export function isFriendZonePresenceMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const value = meta as Record<string, unknown>;
  return value.presence === true || value.hidden === "presence" || value.source === "board_presence";
}

export function activityTimestamp(row: FriendZoneActivityRow | null | undefined): string | null {
  if (!row) return null;
  const meta = row.meta && typeof row.meta === "object" ? row.meta : null;
  const lastSeen =
    meta && typeof meta.lastSeenAt === "string" && meta.lastSeenAt.trim()
      ? meta.lastSeenAt.trim()
      : null;
  return latestTimestamp(lastSeen, row.created_at);
}

export function latestTimestamp(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    const time = date.getTime();
    if (Number.isNaN(time) || time <= latestMs) continue;
    latest = date.toISOString();
    latestMs = time;
  }
  return latest;
}

export function formatFriendZoneLastActive(iso?: string | null) {
  if (!iso) return "No drops yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No drops yet";

  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff <= FRIEND_ZONE_ONLINE_MS) return "Active now";
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

export function deriveFriendZoneState(
  activity: FriendZoneActivityRow[],
  updatedAt?: string | null,
  lastSeenAt?: string | null
): FriendZoneState {
  const day = 24 * 60 * 60 * 1000;
  const visibleActivity = activity.filter((item) => !isFriendZonePresenceMeta(item.meta));
  const recent = visibleActivity.filter((item) => isWithin(item.created_at, day * 7));
  const today = visibleActivity.filter((item) => isWithin(item.created_at, day));
  const boardDrops = recent.filter((item) => item.kind === "board_drop");
  const highSignalDrop = recent.some((item) => {
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    const dropType = String(meta?.dropType || meta?.cardStyle || "").toLowerCase();
    return dropType.includes("pay") || dropType.includes("project") || dropType.includes("music");
  });

  const latest = latestTimestamp(
    lastSeenAt,
    updatedAt,
    ...activity.map((item) => activityTimestamp(item))
  );
  if (isWithin(latest, FRIEND_ZONE_ONLINE_MS)) return "active";
  if (!visibleActivity.length) return isWithin(updatedAt, day * 5) ? "fresh" : "phantom";
  if (boardDrops.length >= 2 || recent.length >= 5 || highSignalDrop) return "magnetic";
  if (today.length >= 1) return "active";
  if (isWithin(visibleActivity[0]?.created_at, day * 3)) return "fresh";
  if (isWithin(visibleActivity[0]?.created_at, day * 10)) return "echo";
  if (isWithin(visibleActivity[0]?.created_at, day * 30)) return "fractured";
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
  const onlineBonus = user.lastActiveLabel === "Active now" ? 4 : 0;
  return (stateScore[user.relationshipState || "fresh"] ?? 0) + onlineBonus;
}

function preferOrbLabel(a: string, b: string) {
  if (a === "Active now") return a;
  if (b === "Active now") return b;
  if (a && a !== "No drops yet" && a !== "Board signal") return a;
  return b || a;
}

function pickRicherOrb(current: FriendZoneOrbUser, incoming: FriendZoneOrbUser): FriendZoneOrbUser {
  const incomingWins = scoreFriendZoneUser(incoming) > scoreFriendZoneUser(current);
  const winner = incomingWins ? incoming : current;
  const other = incomingWins ? current : incoming;
  const name =
    winner.name && winner.name.toLowerCase() !== "board user" ? winner.name : other.name || winner.name;
  const username =
    winner.username && !winner.username.startsWith("boarduser")
      ? winner.username
      : other.username || winner.username;
  const lastActiveLabel = preferOrbLabel(winner.lastActiveLabel, other.lastActiveLabel);
  return {
    ...winner,
    id: winner.id || other.id,
    name,
    username,
    avatarUrl:
      winner.avatarUrl && winner.avatarUrl !== DEFAULT_ORB_AVATAR ? winner.avatarUrl : other.avatarUrl,
    lastActiveLabel,
    relationshipState:
      lastActiveLabel === "Active now"
        ? "active"
        : winner.relationshipState || other.relationshipState,
  };
}

export function mergeFriendZoneOrbs(
  groups: Array<FriendZoneOrbUser[] | null | undefined>,
  opts: { currentUserId?: string | null; limit: number }
): FriendZoneOrbUser[] {
  const byKey = new Map<string, FriendZoneOrbUser>();

  for (const group of groups) {
    for (const orb of Array.isArray(group) ? group : []) {
      if (!orb?.username && !orb?.id) continue;
      if (opts.currentUserId && orb.id && orb.id === opts.currentUserId) continue;
      const key = cleanFriendZoneUsername(orb.username, String(orb.id || ""));
      if (!key) continue;
      const existing = byKey.get(key);
      byKey.set(key, existing ? pickRicherOrb(existing, orb) : orb);
    }
  }

  return [...byKey.values()]
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
    .slice(0, opts.limit);
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

    const lastSeenAt = latestTimestamp(...activity.map((item) => activityTimestamp(item)));
    orbs.push({
      id: userId,
      name,
      username,
      avatarUrl: publicOrbAvatarUrl(
        ...metas.flatMap((meta) => [meta.authorAvatar, meta.avatarUrl, meta.recipientAvatar])
      ),
      lastActiveLabel: formatFriendZoneLastActive(lastSeenAt),
      relationshipState: deriveFriendZoneState(activity, lastSeenAt, lastSeenAt),
    });
  }

  return orbs
    .sort((a, b) => scoreFriendZoneUser(b) - scoreFriendZoneUser(a))
    .slice(0, opts.limit);
}

export function orbFromProfileLike(input: {
  id: string;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  updatedAt?: string | null;
  lastSeenAt?: string | null;
  boardStyle?: FriendZoneBoardStyle | string | null;
  activity?: FriendZoneActivityRow[];
}): FriendZoneOrbUser | null {
  if (!input.id) return null;
  const boardStyle = parseFriendZoneBoardStyle(input.boardStyle);
  if (boardStyle?.visibility === "private") return null;
  const username = cleanFriendZoneUsername(
    input.username,
    `boarduser${String(input.id).slice(0, 6)}`
  );
  if (!username) return null;
  const activity = Array.isArray(input.activity) ? input.activity : [];
  const lastSeenAt = latestTimestamp(
    input.lastSeenAt,
    boardStyle?.lastSeenAt,
    input.updatedAt,
    ...activity.map((item) => activityTimestamp(item))
  );
  const name =
    String(
      input.name || input.displayName || boardStyle?.displayName || username || "Board User"
    ).trim() || username;

  return {
    id: input.id,
    name,
    username,
    avatarUrl: publicOrbAvatarUrl(
      input.avatarUrl,
      boardStyle?.avatarUrl,
      boardStyle?.avatarDataUrl,
      boardStyle?.avatarPath
    ),
    lastActiveLabel: formatFriendZoneLastActive(lastSeenAt),
    relationshipState: deriveFriendZoneState(activity, input.updatedAt, lastSeenAt),
  };
}

export function isFriendZoneState(value: unknown): value is FriendZoneState {
  return typeof value === "string" && VALID_STATES.includes(value as FriendZoneState);
}
