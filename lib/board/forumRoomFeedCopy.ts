import { BOARD_ROOM_CATALOG, getRoomById } from "@/lib/board/rooms/catalog";
import type { DropDestination } from "@/lib/board/dropDestination";
import { isForumRoomDestination } from "@/lib/board/dropDestination";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";

/** Raw camera/upload names that must never headline a Forum Room feed card. */
export function looksLikeMediaFileName(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (/\s/.test(raw) && raw.length > 24 && !/\.[a-z0-9]{2,5}$/i.test(raw)) return false;
  const base = raw.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (
    /\.(mov|mp4|m4v|webm|avi|mkv|m4a|mp3|wav|aac|ogg|flac|jpg|jpeg|png|heic|heif|webp|gif|pdf|html?)$/i.test(
      raw
    )
  ) {
    return true;
  }
  if (
    /^(img|dsc|dscn|pxl|vid|mov|mp4|audio|video|photo|image|capture|recording|fullsizeoutput|screenshot|screenrecording)[-_\s.]?\d/i.test(
      base
    )
  ) {
    return true;
  }
  if (/^(audio|video|image|photo|movie|clip|untitled)$/i.test(base)) return true;
  if (/^IMG[-_]?\d+$/i.test(base) || /^VID[-_]?\d+$/i.test(base)) return true;
  return false;
}

export function forumRoomDisplayName(input: {
  roomId?: string | null;
  roomName?: string | null;
  roomIcon?: string | null;
}): { name: string; icon: string } {
  const catalog = input.roomId ? getRoomById(input.roomId) : null;
  let name = String(catalog?.name || input.roomName || "").trim() || "a Room";
  if (/THAT RYDERZ/i.test(name)) name = "Those Ryderz";
  const icon = String(catalog?.icon || input.roomIcon || "").trim();
  return { name, icon };
}

export type ForumRoomFeedCopy = {
  title: string;
  body: string;
};

export function forumRoomFeedCopy(input: {
  kind?: "room" | "room_conversation";
  roomId?: string | null;
  roomName?: string | null;
  roomIcon?: string | null;
  conversationTitle?: string | null;
  actorName?: string | null;
}): ForumRoomFeedCopy {
  const room = forumRoomDisplayName(input);
  const conversation = String(input.conversationTitle || "").trim();
  const actor = pickBoardDisplayName(input.actorName);
  const labeled = room.icon ? `${room.icon} ${room.name}` : room.name;

  if (input.kind === "room_conversation") {
    const title = `Added a Drop to ${room.name}`;
    const where = conversation
      ? `in ${conversation} in ${room.name}`
      : `in ${room.name}`;
    const body = actor
      ? `${actor} replied with a Drop ${where}.`
      : `Replied with a Drop ${where}.`;
    return { title, body };
  }

  return {
    title: `Added a Drop to ${room.name}`,
    body: actor
      ? `${actor} added a Drop to ${labeled}.`
      : `Shared a Drop in ${labeled}.`,
  };
}

export function forumRoomDropItemTitle(input: {
  roomId?: string | null;
  roomName?: string | null;
  fallback?: string;
}): string {
  const room = forumRoomDisplayName(input);
  if (room.name && room.name !== "a Room") return `Drop in ${room.name}`;
  return input.fallback || "Room Drop";
}

export function copyFromDropDestination(
  destination: DropDestination | null | undefined,
  extras?: { actorName?: string | null }
): ForumRoomFeedCopy | null {
  if (!isForumRoomDestination(destination)) return null;
  return forumRoomFeedCopy({
    kind: destination.type,
    roomId: destination.roomId,
    roomName: destination.roomName,
    roomIcon: destination.roomIcon,
    conversationTitle:
      destination.type === "room_conversation" ? destination.conversationTitle : undefined,
    actorName: extras?.actorName,
  });
}

function cleanMetaText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return "";
  return trimmed;
}

function catalogRoomByName(name: string) {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  return (
    BOARD_ROOM_CATALOG.find((room) => {
      const display = forumRoomDisplayName({ roomId: room.id, roomName: room.name }).name;
      return display.toLowerCase() === target || room.name.toLowerCase() === target;
    }) ?? null
  );
}

/** "Drop in JAB Comics" / "Johnandy added a Drop to JAB Comics." names a real Forum Room. */
export function forumRoomReferencedByCopy(title: unknown, body: unknown) {
  const titleText = String(title || "").trim();
  const bodyText = String(body || "").trim();
  const titleName =
    /^drop in\s+(.+)$/i.exec(titleText)?.[1]?.trim() ||
    /^added a drop to\s+(.+)$/i.exec(titleText)?.[1]?.trim() ||
    "";
  const fromTitle = titleName ? catalogRoomByName(titleName) : null;
  if (fromTitle) return fromTitle;
  if (!/\b(?:added a drop to|shared a drop in|replied with a drop in)\b/i.test(bodyText)) {
    return null;
  }
  const rooms = [...BOARD_ROOM_CATALOG].sort((a, b) => b.name.length - a.name.length);
  return (
    rooms.find((room) => {
      const escaped = room.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `\\b(?:added a drop to|shared a drop in|replied with a drop in)\\b[^\\n]*\\b${escaped}\\b`,
        "i"
      ).test(bodyText);
    }) ?? null
  );
}

/**
 * Profile-board copies of a Forum Drop often arrive without roomId. The title
 * and sentence still name the room, and that is enough to keep the Open button.
 */
export function recoverForumNavigationMeta(
  meta: Record<string, unknown> | null | undefined,
  title?: unknown,
  body?: unknown
): Record<string, unknown> {
  const base = meta && typeof meta === "object" ? { ...meta } : {};
  const destinationType = cleanMetaText(base.destinationType);
  const source = cleanMetaText(base.source);
  const origin = cleanMetaText(base.origin);
  const cardStyle = cleanMetaText(base.cardStyle);
  if (
    destinationType === "project_room" ||
    destinationType === "feed" ||
    cardStyle === "project_room_drop" ||
    origin === "project_room" ||
    source === "drop_studio"
  ) {
    return base;
  }

  const existingRoom = cleanMetaText(base.roomId) || cleanMetaText(base.forumRoomId);
  const alreadyForum =
    destinationType === "room" ||
    destinationType === "room_conversation" ||
    source === "forum_room_studio" ||
    source === "forum_room_share";
  if (existingRoom && alreadyForum) return base;

  const room = existingRoom ? getRoomById(existingRoom) : forumRoomReferencedByCopy(title, body);
  if (!existingRoom && !room) return base;

  const roomId = existingRoom || room?.id || "";
  if (!roomId) return base;
  const nextDestination =
    destinationType === "room" || destinationType === "room_conversation" ? destinationType : "room";
  const nextSource =
    source === "forum_room_studio" || source === "forum_room_share" ? source : "forum_room_studio";
  const nextOrigin =
    origin === "create" || origin === "share" || origin === "conversation" ? origin : origin || "create";

  return {
    ...base,
    roomId,
    forumRoomId: cleanMetaText(base.forumRoomId) || roomId,
    roomName: cleanMetaText(base.roomName) || room?.name || null,
    roomIcon: cleanMetaText(base.roomIcon) || room?.icon || null,
    destinationType: nextDestination,
    source: nextSource,
    origin: nextOrigin,
  };
}

export function isGeneratedProfileDropBody(value: unknown): boolean {
  return /^new .+ drop (added to board|from .+)\.?$/i.test(String(value || "").trim());
}

export function isForumRoomActivityMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false;
  const destinationType = String(meta.destinationType || "");
  const source = String(meta.source || "");
  if (destinationType === "room" || destinationType === "room_conversation") return true;
  return source === "forum_room_studio" || source === "forum_room_share";
}

/** Those Ryderz stays title case. Other Forum Room tags read as MUSIC / JAB LIT. */
export function forumRoomTagName(name: string | null | undefined): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  if (/th(?:ose|at)\s+ryderz/i.test(trimmed)) return "Those Ryderz";
  return trimmed.toUpperCase();
}

/**
 * Primary Activity / tile badge for Forum destinations.
 * Room Drops show the Room name (not Vision Drop). Conversation Drops show
 * CONVERSATION or the conversation title.
 */
export function forumDropPrimaryTag(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!isForumRoomActivityMeta(meta)) return null;
  const destinationType = String(meta?.destinationType || "");
  const conversation = String(meta?.conversationTitle || "").trim();
  const room = forumRoomDisplayName({
    roomId: typeof meta?.roomId === "string" ? meta.roomId : null,
    roomName: typeof meta?.roomName === "string" ? meta.roomName : null,
    roomIcon: typeof meta?.roomIcon === "string" ? meta.roomIcon : null,
  });
  const roomTag = forumRoomTagName(room.name !== "a Room" ? room.name : "");

  if (destinationType === "room_conversation" || String(meta?.origin || "") === "conversation") {
    if (conversation) return conversation;
    if (roomTag) return `CONVERSATION · ${roomTag}`;
    return "CONVERSATION";
  }

  if (roomTag) return roomTag;
  return "ROOM DROP";
}

/** Short media chip once the primary badge is the Room / conversation. */
export function forumDropMediaChip(rawType: string | null | undefined): string | null {
  const t = String(rawType || "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower.includes("vision") || lower.includes("media") || lower.includes("photo") || lower.includes("image") || lower.includes("video")) {
    return "Vision";
  }
  if (lower.includes("music") || lower.includes("spotify") || lower.includes("soundcloud") || lower.includes("audio")) {
    return "Music";
  }
  if (lower.includes("youtube") || lower.includes("youtu.be")) return "YouTube";
  if (lower.includes("thought") || lower.includes("voice")) return "Thought";
  if (lower.includes("doc") || lower.includes("descript")) return "Doc";
  if (lower.includes("dropbook") || lower.includes("slide")) return "Dropbook";
  if (lower.includes("news")) return "News";
  if (lower.includes("pay")) return "Pay";
  if (lower.includes("link")) return "Link";
  if (/\bdrop\b/i.test(t)) return t.replace(/\s+drop$/i, "").trim() || null;
  return t;
}

function metaFlag(meta: Record<string, unknown> | null | undefined, key: string): boolean {
  return Boolean(meta && meta[key] === true);
}

function isPlaceholderForumTitle(value: unknown): boolean {
  const title = String(value || "").trim();
  if (!title) return true;
  if (looksLikeMediaFileName(title)) return true;
  if (/^added a drop to /i.test(title)) return true;
  if (/^drop in /i.test(title)) return true;
  if (/^(shared )?drop$/i.test(title)) return true;
  if (/^(vision|media|music|doc|descript|dropbook) drop$/i.test(title)) return true;
  return false;
}

/**
 * “Added a Drop to [Room]” is only for Drops created from Drop Studio into a
 * Room or conversation. Sharing an existing Drop (Descript, Dropbook, titled
 * media) must keep the original title and subtitle.
 */
export function isStudioCreatedForumDrop(
  meta: Record<string, unknown> | null | undefined
): boolean {
  if (!isForumRoomActivityMeta(meta)) return false;
  const origin = String(meta?.origin || "").trim();
  if (origin === "share") return false;
  const destinationType = String(meta?.destinationType || "");
  const destIsForum = destinationType === "room" || destinationType === "room_conversation";
  if (origin === "create" && destIsForum) return true;
  if (origin === "conversation" && destinationType === "room_conversation") return true;
  const source = String(meta?.source || "");
  return source === "forum_room_studio" && destIsForum && origin !== "share";
}

export function keepOriginalForumFeedTitle(item: {
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown> | null;
}): boolean {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  if (metaFlag(meta, "fromDescript") || metaFlag(meta, "fromDropbook")) return true;
  if (!isStudioCreatedForumDrop(meta)) return true;
  return !isPlaceholderForumTitle(item.title);
}

export function applyForumRoomFeedCopy(item: {
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown> | null;
}): { title: string; body: string } | null {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  if (!isForumRoomActivityMeta(meta)) return null;
  if (keepOriginalForumFeedTitle(item)) return null;
  const actor = pickBoardDisplayName(meta?.authorName, meta?.actorName);
  const copy = forumRoomFeedCopy({
    kind: String(meta?.destinationType || "") === "room_conversation" ? "room_conversation" : "room",
    roomId: typeof meta?.roomId === "string" ? meta.roomId : null,
    roomName: typeof meta?.roomName === "string" ? meta.roomName : null,
    roomIcon: typeof meta?.roomIcon === "string" ? meta.roomIcon : null,
    conversationTitle:
      typeof meta?.conversationTitle === "string" ? meta.conversationTitle : null,
    actorName: actor,
  });
  const rawBody = String(item.body || "").trim();
  const keepBody =
    rawBody &&
    !looksLikeMediaFileName(rawBody) &&
    !isGeneratedProfileDropBody(rawBody) &&
    !/^shared drop$/i.test(rawBody) &&
    !/\bBoard User\b/.test(rawBody);
  return {
    title: copy.title,
    body: keepBody ? rawBody : copy.body,
  };
}
