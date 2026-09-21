import type { RoomConversation, RoomDropShare, RoomMember, RoomPresence, RoomSession } from "./types";

export const ROOM_MEMBERSHIP_KEY = "jab_rooms_membership_v1";
export const ROOM_PRESENCE_KEY = "jab_rooms_presence_v1";
export const ROOM_SHARES_KEY = "jab_rooms_shares_v1";
export const ROOM_SESSIONS_KEY = "jab_rooms_sessions_v1";
export const ROOM_CONVERSATIONS_KEY = "jab_forums_threads_v1";
export const ROOM_RECENT_KEY = "jab_rooms_recent_v1";
export const ROOM_JOINED_ACTIVITY_KEY = "jab_rooms_joined_activity_v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari private mode / quota
  }
}

export function readMemberships(): RoomMember[] {
  const rows = readJson<RoomMember[]>(ROOM_MEMBERSHIP_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.roomId && row.userId) : [];
}

export function writeMemberships(rows: RoomMember[]) {
  writeJson(ROOM_MEMBERSHIP_KEY, rows);
}

export function upsertMembership(next: RoomMember) {
  const rows = readMemberships().filter(
    (row) => !(row.roomId === next.roomId && row.userId === next.userId)
  );
  writeMemberships([next, ...rows]);
  return next;
}

export function membershipFor(roomId: string, userId: string | null) {
  if (!userId) return null;
  return readMemberships().find((row) => row.roomId === roomId && row.userId === userId) ?? null;
}

export function readPresence(): RoomPresence[] {
  const rows = readJson<RoomPresence[]>(ROOM_PRESENCE_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.roomId && row.userId) : [];
}

export function writePresence(rows: RoomPresence[]) {
  writeJson(ROOM_PRESENCE_KEY, rows);
}

export function readShares(): RoomDropShare[] {
  const rows = readJson<RoomDropShare[]>(ROOM_SHARES_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.roomId && row.dropId) : [];
}

export function writeShares(rows: RoomDropShare[]) {
  writeJson(ROOM_SHARES_KEY, rows);
}

export function upsertShare(next: RoomDropShare) {
  const rows = readShares().filter(
    (row) => !(row.roomId === next.roomId && row.dropId === next.dropId && row.sharedBy === next.sharedBy)
  );
  writeShares([next, ...rows]);
  return next;
}

export function readSessions(): RoomSession[] {
  const rows = readJson<RoomSession[]>(ROOM_SESSIONS_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.roomId && row.id) : [];
}

export function writeSessions(rows: RoomSession[]) {
  writeJson(ROOM_SESSIONS_KEY, rows);
}

export function activeSessionsFor(roomId: string) {
  return readSessions().filter(
    (row) => row.roomId === roomId && (row.status === "starting" || row.status === "live")
  );
}

export function liveRoomsFromSessions(sessions = readSessions()) {
  const live = new Set<string>();
  for (const session of sessions) {
    if (session.kind === "live" && (session.status === "starting" || session.status === "live")) {
      live.add(session.roomId);
    }
  }
  return live;
}

export function readConversations(): RoomConversation[] {
  const rows = readJson<unknown[]>(ROOM_CONVERSATIONS_KEY, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item: any): RoomConversation | null => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title ?? "").trim();
      if (!title) return null;
      const id = String(item.id ?? "");
      const createdAt =
        typeof item.createdAt === "string"
          ? item.createdAt
          : new Date(Number(item.createdAt) || Date.now()).toISOString();
      return {
        id,
        roomId: String(item.roomId ?? "lobby"),
        title,
        body: String(item.body ?? item.description ?? "").trim() || "Conversation opened.",
        authorName: String(item.authorName ?? item.author?.name ?? item.author ?? "Board"),
        authorAvatar: typeof item.authorAvatar === "string" ? item.authorAvatar : undefined,
        createdAt,
        isPinned: Boolean(item.isPinned),
        privacy:
          item.privacy === "private" ||
          item.privacy === "work" ||
          item.privacy === "invite-only" ||
          item.privacy === "public"
            ? item.privacy
            : "public",
        mood:
          item.mood === "quiet" ||
          item.mood === "active" ||
          item.mood === "urgent" ||
          item.mood === "dreaming" ||
          item.mood === "locked"
            ? item.mood
            : "active",
        replies: Array.isArray(item.replies)
          ? item.replies.map((reply: any) => ({
              id: String(reply.id ?? `${id}_r`),
              threadId: String(reply.threadId ?? id),
              authorName: String(reply.authorName ?? reply.author ?? "Board"),
              authorAvatar: typeof reply.authorAvatar === "string" ? reply.authorAvatar : undefined,
              body: String(reply.body ?? reply.text ?? ""),
              createdAt:
                typeof reply.createdAt === "string"
                  ? reply.createdAt
                  : new Date(Number(reply.createdAt) || Date.now()).toISOString(),
              dropId: typeof reply.dropId === "string" && reply.dropId.trim() ? reply.dropId : undefined,
              dropSnapshot:
                reply.dropSnapshot && typeof reply.dropSnapshot === "object"
                  ? (reply.dropSnapshot as Record<string, unknown>)
                  : undefined,
            }))
          : [],
      };
    })
    .filter((item): item is RoomConversation => Boolean(item?.id));
}

export function writeConversations(rows: RoomConversation[]) {
  writeJson(ROOM_CONVERSATIONS_KEY, rows);
}

export function upsertConversation(next: RoomConversation) {
  const rows = readConversations().filter((row) => row.id !== next.id);
  writeConversations([next, ...rows]);
  return next;
}

export function readRecentRoomIds(): string[] {
  const rows = readJson<string[]>(ROOM_RECENT_KEY, []);
  return Array.isArray(rows) ? rows.map(String).filter(Boolean) : [];
}

export function rememberRecentRoom(roomId: string) {
  const next = [roomId, ...readRecentRoomIds().filter((id) => id !== roomId)].slice(0, 12);
  writeJson(ROOM_RECENT_KEY, next);
  return next;
}

export function hasEmittedJoinActivity(roomId: string, userId: string) {
  const rows = readJson<string[]>(ROOM_JOINED_ACTIVITY_KEY, []);
  return rows.includes(`${roomId}:${userId}`);
}

export function markJoinActivity(roomId: string, userId: string) {
  const key = `${roomId}:${userId}`;
  const rows = readJson<string[]>(ROOM_JOINED_ACTIVITY_KEY, []);
  if (rows.includes(key)) return;
  writeJson(ROOM_JOINED_ACTIVITY_KEY, [key, ...rows].slice(0, 200));
}
