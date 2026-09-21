import { getRoomById } from "@/lib/board/rooms/catalog";
import type { DropDestination } from "@/lib/board/dropDestination";
import { isForumRoomDestination } from "@/lib/board/dropDestination";

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
  const actor = String(input.actorName || "").trim();
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

export function isForumRoomActivityMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false;
  const destinationType = String(meta.destinationType || "");
  const source = String(meta.source || "");
  if (destinationType === "room" || destinationType === "room_conversation") return true;
  return source === "forum_room_studio";
}

export function applyForumRoomFeedCopy(item: {
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown> | null;
}): { title: string; body: string } | null {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  if (!isForumRoomActivityMeta(meta)) return null;
  const copy = forumRoomFeedCopy({
    kind: String(meta?.destinationType || "") === "room_conversation" ? "room_conversation" : "room",
    roomId: typeof meta?.roomId === "string" ? meta.roomId : null,
    roomName: typeof meta?.roomName === "string" ? meta.roomName : null,
    roomIcon: typeof meta?.roomIcon === "string" ? meta.roomIcon : null,
    conversationTitle:
      typeof meta?.conversationTitle === "string" ? meta.conversationTitle : null,
    actorName:
      typeof meta?.authorName === "string"
        ? meta.authorName
        : typeof meta?.actorName === "string"
          ? meta.actorName
          : null,
  });
  const rawBody = String(item.body || "").trim();
  const keepBody =
    rawBody &&
    !looksLikeMediaFileName(rawBody) &&
    !/^new .+ drop added to board\.?$/i.test(rawBody) &&
    !/^shared drop$/i.test(rawBody);
  return {
    title: copy.title,
    body: keepBody ? rawBody : copy.body,
  };
}
