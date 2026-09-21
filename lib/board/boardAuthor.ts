import type { BoardActivity } from "@/lib/board/activity";
import { roomHref } from "@/lib/board/rooms/catalog";
import type { RoomPresence } from "@/lib/board/rooms/types";

const PLACEHOLDER_NAMES = new Set([
  "board user",
  "board-user",
  "boarduser",
  "someone",
  "you",
  "local",
  "demo",
]);

export function isPlaceholderBoardName(value: unknown): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  return PLACEHOLDER_NAMES.has(name);
}

export function pickBoardDisplayName(...values: unknown[]): string {
  for (const value of values) {
    const name = typeof value === "string" ? value.trim() : "";
    if (name && !isPlaceholderBoardName(name)) return name;
  }
  return "";
}

export function replacePlaceholderActor(text: string, realName: string): string {
  const name = pickBoardDisplayName(realName);
  if (!name) return text;
  return String(text || "").replace(/\bBoard User\b/g, name);
}

export function forumDropPath(input: {
  roomId?: string | null;
  conversationId?: string | null;
}): string | null {
  const roomId = String(input.roomId || "").trim();
  if (!roomId) return null;
  const conversation = String(input.conversationId || "").trim();
  return conversation ? roomHref(roomId, { conversation }) : roomHref(roomId);
}

export const BOARD_OPEN_FORUM_ROOM_EVENT = "board:forums:open";

export type ForumOpenDetail = {
  href: string;
  roomId: string;
  conversationId: string | null;
};

export function parseForumHref(href: string | null | undefined): ForumOpenDetail | null {
  const trimmed = String(href || "").trim();
  if (!trimmed) return null;
  try {
    const url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, "https://jabvisions.com");
    const match = url.pathname.match(/^\/board\/forums\/([^/]+)\/?$/i);
    if (!match) return null;
    const roomId = decodeURIComponent(match[1] || "").trim();
    if (!roomId) return null;
    const conversationId =
      url.searchParams.get("conversation") || url.searchParams.get("thread") || "";
    const path = `/board/forums/${encodeURIComponent(roomId)}`;
    const nextHref = conversationId
      ? `${path}?conversation=${encodeURIComponent(conversationId)}`
      : path;
    return { href: nextHref, roomId, conversationId: conversationId || null };
  } catch {
    return null;
  }
}

export function openForumRoom(
  href: string,
  router?: { push: (url: string) => void } | null
): ForumOpenDetail | null {
  const parsed = parseForumHref(href);
  if (!parsed) return null;
  if (typeof window === "undefined") return parsed;
  window.dispatchEvent(new CustomEvent(BOARD_OPEN_FORUM_ROOM_EVENT, { detail: parsed }));
  const currentPath = window.location.pathname.replace(/\/+$/, "");
  const targetPath = `/board/forums/${encodeURIComponent(parsed.roomId)}`;
  const alreadyInRoom =
    currentPath === targetPath || currentPath === `/board/forums/${parsed.roomId}`;
  if (alreadyInRoom) {
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== parsed.href) {
      window.history.replaceState(null, "", parsed.href);
    }
    return parsed;
  }
  if (router?.push) router.push(parsed.href);
  else window.location.assign(parsed.href);
  return parsed;
}

export function forumDropPathFromMeta(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const destinationType = String(meta.destinationType || "");
  const source = String(meta.source || "");
  const origin = String(meta.origin || "");
  const isForum =
    destinationType === "room" ||
    destinationType === "room_conversation" ||
    source === "forum_room_studio" ||
    source === "forum_room_share";
  if (!isForum && origin !== "create" && origin !== "share" && origin !== "conversation") {
    return null;
  }
  const roomId = typeof meta.roomId === "string" ? meta.roomId.trim() : "";
  if (!roomId) return null;
  const conversationId =
    typeof meta.conversationId === "string" && meta.conversationId.trim()
      ? meta.conversationId.trim()
      : "";
  return forumDropPath({ roomId, conversationId });
}

export function activityForumPath(
  item: Pick<BoardActivity, "meta"> & { href?: string | null }
): string | null {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  const fromMeta =
    (typeof meta?.forumHref === "string" && meta.forumHref.trim()) ||
    forumDropPathFromMeta(meta);
  if (fromMeta) return fromMeta;
  const href = String(item.href || "").trim();
  if (/^\/board\/forums\//i.test(href)) return href;
  return null;
}

export type ProfileAuthorRow = {
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  board_style?: unknown;
};

export type BoardProfileAuthor = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  avatarPath: string;
};

function boardStyleRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function authorFromProfileRow(
  row: ProfileAuthorRow | null | undefined
): BoardProfileAuthor | null {
  const id = String(row?.id || "").trim();
  if (!id) return null;
  const style = boardStyleRecord(row?.board_style);
  const username = String(row?.username || style.username || "")
    .trim()
    .replace(/^@+/, "");
  const displayName =
    pickBoardDisplayName(style.displayName, row?.display_name, username) || "";
  const avatarUrl = String(style.avatarUrl || row?.avatar_url || "").trim();
  const avatarPath = String(style.avatarPath || style.avatar_path || row?.avatar_path || "").trim();
  return {
    id,
    displayName,
    username,
    avatarUrl,
    avatarPath,
  };
}

export function hydrateActivityAuthor(
  item: BoardActivity,
  profile: BoardProfileAuthor | null | undefined
): BoardActivity {
  if (!profile) return item;
  const meta = item.meta && typeof item.meta === "object" ? { ...item.meta } : {};
  const displayName = pickBoardDisplayName(
    profile.displayName,
    meta.authorName,
    meta.actorName,
    meta.displayName,
    profile.username
  );
  const username = String(meta.authorUsername || profile.username || "")
    .trim()
    .replace(/^@+/, "");
  const avatarUrl = String(meta.authorAvatar || profile.avatarUrl || "").trim();
  const nextMeta: Record<string, unknown> = {
    ...meta,
    authorName: displayName || meta.authorName || null,
    authorUsername: username || meta.authorUsername || null,
    authorAvatar: avatarUrl || meta.authorAvatar || null,
    authorId: meta.authorId || profile.id,
  };
  nextMeta.forumHref = activityForumPath({ ...item, meta: nextMeta }) || nextMeta.forumHref || null;
  return {
    ...item,
    title: replacePlaceholderActor(String(item.title || ""), displayName),
    body: replacePlaceholderActor(item.body, displayName),
    meta: nextMeta,
  };
}

export function applyForumDropNavigation(item: BoardActivity): BoardActivity {
  const meta = item.meta && typeof item.meta === "object" ? { ...item.meta } : {};
  const forumHref = activityForumPath({ ...item, meta });
  if (!forumHref) return item;
  return {
    ...item,
    meta: {
      ...meta,
      forumHref,
    },
  };
}

export function presenceFromApiRow(
  row: Record<string, unknown> | null | undefined,
  roomId: string
): RoomPresence | null {
  if (!row || typeof row !== "object") return null;
  const userId = String(row.user_id || row.userId || "").trim();
  if (!userId) return null;
  const displayName =
    pickBoardDisplayName(row.display_name, row.displayName, row.username) || "Board";
  const avatarUrl = String(row.avatar_url || row.avatarUrl || "").trim();
  return {
    userId,
    roomId,
    displayName,
    username: String(row.username || "").trim() || undefined,
    avatarUrl: avatarUrl || undefined,
    lastSeenAt: String(row.last_seen_at || row.lastSeenAt || new Date().toISOString()),
  };
}
