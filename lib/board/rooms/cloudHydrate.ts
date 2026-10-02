import { persistableMediaUrl } from "@/lib/board/activity";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { getRoomById, resolveRoomId, roomHref, roomIdCandidates } from "./catalog";
import { seedConversations } from "./conversations";
import type { RoomConversation, RoomDropShare } from "./types";

export type RoomActivityLike = {
  id?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  user_id?: unknown;
  userId?: unknown;
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  href?: unknown;
  image_url?: unknown;
  imageUrl?: unknown;
  meta?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metaOf(row: RoomActivityLike): Record<string, unknown> {
  return asRecord(row.meta);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function activityDropId(row: RoomActivityLike): string {
  const meta = metaOf(row);
  return text(meta.dropId || meta.originalDropId || meta.id);
}

export function activityMatchesRoom(row: RoomActivityLike, roomId: string): boolean {
  const resolved = resolveRoomId(roomId) || String(roomId || "").trim();
  if (!resolved) return false;
  const meta = metaOf(row);
  if (text(meta.destinationType) === "project_room") return false;
  if (text(meta.cardStyle).toLowerCase() === "project_room_drop") return false;
  const candidates = new Set(roomIdCandidates(resolved).map((id) => id.toLowerCase()));
  const metaRoom = text(meta.roomId || meta.forumRoomId);
  const metaResolved = resolveRoomId(metaRoom) || metaRoom;
  if (metaResolved && (candidates.has(metaResolved.toLowerCase()) || candidates.has(metaRoom.toLowerCase()))) {
    return true;
  }
  const href = text(row.href);
  if (href && candidates.has((resolveRoomId(href) || "").toLowerCase())) return true;
  for (const id of candidates) {
    if (href.includes(`/board/forums/${id}`)) return true;
  }
  return false;
}

export function activityIsPrivateToOthers(row: RoomActivityLike, viewerId?: string | null): boolean {
  const visibility = text(metaOf(row).visibility).toLowerCase();
  if (visibility !== "private") return false;
  const owner = text(row.user_id || row.userId);
  return !viewerId || !owner || owner !== viewerId;
}

function originFromActivity(row: RoomActivityLike): "create" | "share" | "conversation" {
  const meta = metaOf(row);
  const origin = text(meta.origin).toLowerCase();
  if (origin === "create" || origin === "share" || origin === "conversation") return origin;
  const destination = text(meta.destinationType);
  if (destination === "room_conversation") return "conversation";
  if (text(meta.source) === "forum_room_share") return "share";
  return "create";
}

export function activityIsConversationPlacement(row: RoomActivityLike): boolean {
  const meta = metaOf(row);
  const kind = text(row.kind);
  if (kind === "forum_post") return true;
  if (originFromActivity(row) === "conversation") return true;
  return text(meta.destinationType) === "room_conversation";
}

function snapshotFromActivity(row: RoomActivityLike): Record<string, unknown> {
  const meta = metaOf(row);
  const preview = asRecord(meta.preview);
  const href = persistableMediaUrl(row.href) || persistableMediaUrl(meta.url) || persistableMediaUrl(meta.linkUrl);
  const mediaUrl =
    persistableMediaUrl(meta.mediaUrl) ||
    persistableMediaUrl(preview.mediaUrl) ||
    persistableMediaUrl(row.image_url) ||
    persistableMediaUrl(row.imageUrl);
  const embedUrl = persistableMediaUrl(meta.embedUrl) || persistableMediaUrl(preview.embedUrl);
  const dropType = text(meta.dropType) || text(meta.type) || "Media";
  return {
    id: activityDropId(row),
    title: text(row.title) || text(meta.title) || "Shared Drop",
    type: dropType,
    createdAt: text(row.created_at || row.createdAt) || new Date().toISOString(),
    url: href || mediaUrl || embedUrl || undefined,
    embedUrl: embedUrl || null,
    hostLabel: text(meta.hostLabel) || undefined,
    headline: text(meta.headline) || undefined,
    previewTitle: text(meta.previewTitle || preview.title) || undefined,
    previewDescription: text(meta.previewDescription || preview.description) || undefined,
    previewImage: persistableMediaUrl(meta.previewImage) || persistableMediaUrl(preview.image) || undefined,
    previewImages: Array.isArray(meta.previewImages)
      ? meta.previewImages.filter((item): item is string => typeof item === "string")
      : undefined,
    mediaUrl: mediaUrl || href || undefined,
    bucket: text(meta.bucket || preview.bucket) || undefined,
    storagePath: text(meta.storagePath || preview.storagePath) || undefined,
    fileName: text(meta.fileName || preview.fileName) || undefined,
    mime: text(meta.mime || preview.mime) || undefined,
    mediaKind: text(meta.mediaKind || preview.mediaKind) || undefined,
    description: text(row.body) || text(meta.description) || undefined,
    thoughtText: text(meta.thoughtText) || undefined,
    thoughtFormat: text(meta.thoughtFormat) || undefined,
    linkUrl: persistableMediaUrl(meta.linkUrl) || href || undefined,
    fromDescript: meta.fromDescript === true,
    fromDropbook: meta.fromDropbook === true,
    visibility: text(meta.visibility) === "private" ? "private" : "public",
    customizations: meta.customizations,
    authorName: pickBoardDisplayName(meta.authorName, meta.displayName, meta.authorUsername),
    authorUsername: text(meta.authorUsername) || undefined,
    authorAvatar: text(meta.authorAvatar) || persistableMediaUrl(row.image_url) || undefined,
    roomId: resolveRoomId(meta.roomId) || text(meta.roomId) || undefined,
    roomName: text(meta.roomName) || getRoomById(meta.roomId)?.name || undefined,
    roomIcon: text(meta.roomIcon) || getRoomById(meta.roomId)?.icon || undefined,
    conversationTitle: text(meta.conversationTitle) || undefined,
    conversationId: text(meta.conversationId) || undefined,
  };
}

export function shareFromActivityRow(roomId: string, row: RoomActivityLike): RoomDropShare | null {
  const resolved = resolveRoomId(roomId) || String(roomId || "").trim();
  if (!resolved || !activityMatchesRoom(row, resolved)) return null;
  if (activityIsConversationPlacement(row)) return null;
  const dropId = activityDropId(row);
  if (!dropId) return null;
  const snapshot = snapshotFromActivity(row);
  const sharedBy = text(row.user_id || row.userId);
  return {
    id: text(row.id) || `activity_share_${dropId}`,
    roomId: resolved,
    dropId,
    sharedBy,
    sharedByName: pickBoardDisplayName(snapshot.authorName, metaOf(row).authorName) || undefined,
    activityId: text(row.id) || null,
    snapshot,
    createdAt: text(row.created_at || row.createdAt) || new Date().toISOString(),
    origin: originFromActivity(row) === "share" ? "share" : "create",
    conversationId: text(metaOf(row).conversationId) || null,
  };
}

export function sharesFromActivityRows(
  roomId: string,
  rows: RoomActivityLike[] | null | undefined,
  viewerId?: string | null
): RoomDropShare[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const out: RoomDropShare[] = [];
  for (const row of rows) {
    if (activityIsPrivateToOthers(row, viewerId)) continue;
    const share = shareFromActivityRow(roomId, row);
    if (share) out.push(share);
  }
  return out;
}

export function shareRowsFromActivity(
  roomId: string,
  rows: RoomActivityLike[] | null | undefined,
  viewerId?: string | null
): Array<Record<string, unknown>> {
  return sharesFromActivityRows(roomId, rows, viewerId).map((share) => ({
    id: share.id,
    room_id: share.roomId,
    drop_id: share.dropId,
    shared_by: share.sharedBy,
    shared_by_name: share.sharedByName,
    activity_id: share.activityId,
    snapshot: share.snapshot,
    created_at: share.createdAt,
    origin: share.origin,
    conversation_id: share.conversationId,
    source: "board_activity",
  }));
}

function conversationIdFromActivity(row: RoomActivityLike): string {
  const meta = metaOf(row);
  return text(meta.conversationId) || (activityIsConversationPlacement(row) ? text(row.id) : "");
}

export function conversationsFromActivityRows(
  roomId: string,
  rows: RoomActivityLike[] | null | undefined,
  viewerId?: string | null
): RoomConversation[] {
  const resolved = resolveRoomId(roomId) || String(roomId || "").trim();
  if (!resolved || !Array.isArray(rows) || !rows.length) return [];
  const seeds = seedConversations([]).filter((item) => item.roomId === resolved);
  const byId = new Map<string, RoomConversation>();

  for (const row of rows) {
    if (!activityMatchesRoom(row, resolved)) continue;
    if (activityIsPrivateToOthers(row, viewerId)) continue;
    if (!activityIsConversationPlacement(row) && text(row.kind) !== "forum_post") continue;

    const createdAt = text(row.created_at || row.createdAt) || new Date().toISOString();
    const authorName =
      pickBoardDisplayName(metaOf(row).authorName, metaOf(row).displayName, metaOf(row).authorUsername) ||
      "Board";
    const authorAvatar = text(metaOf(row).authorAvatar) || undefined;
    const conversationId = conversationIdFromActivity(row) || `activity_${text(row.id) || createdAt}`;
    const seed = seeds.find((item) => item.id === conversationId);
    const dropId = activityDropId(row);
    const current: RoomConversation =
      byId.get(conversationId) ||
      (seed
        ? { ...seed, replies: [...(seed.replies || [])] }
        : {
            id: conversationId,
            roomId: resolved,
            title:
              text(metaOf(row).conversationTitle) ||
              (text(row.kind) === "forum_post" ? text(row.title) : "") ||
              "Conversation",
            body: text(row.kind) === "forum_post" ? text(row.body) : "",
            authorName,
            authorAvatar,
            createdAt,
            replies: [],
          });

    if (dropId) {
      const replyId = text(row.id) || `activity_reply_${dropId}`;
      const already = current.replies.some((reply) => reply.id === replyId || reply.dropId === dropId);
      if (!already) {
        current.replies = [
          {
            id: replyId,
            threadId: conversationId,
            authorName,
            authorAvatar,
            body: text(row.body) || "Replied with a Drop",
            createdAt,
            dropId,
            dropSnapshot: snapshotFromActivity(row),
          },
          ...current.replies,
        ];
      }
    } else if (text(row.kind) === "forum_post") {
      current.title = text(row.title) || current.title;
      current.body = text(row.body) || current.body;
      current.authorName = authorName || current.authorName;
      current.authorAvatar = authorAvatar || current.authorAvatar;
      current.createdAt = createdAt || current.createdAt;
    }

    byId.set(conversationId, { ...current, roomId: resolved });
  }

  return [...byId.values()];
}

export function postRowsFromActivity(
  roomId: string,
  rows: RoomActivityLike[] | null | undefined,
  viewerId?: string | null
): Array<Record<string, unknown>> {
  const conversations = conversationsFromActivityRows(roomId, rows, viewerId);
  const posts: Array<Record<string, unknown>> = [];
  for (const conversation of conversations) {
    posts.push({
      id: conversation.id,
      room_id: conversation.roomId,
      kind: "conversation",
      title: conversation.title,
      body: conversation.body,
      author_name: conversation.authorName,
      avatar_url: conversation.authorAvatar,
      created_at: conversation.createdAt,
      pinned: conversation.isPinned === true,
      source: "board_activity",
    });
    for (const reply of conversation.replies || []) {
      posts.push({
        id: reply.id,
        room_id: conversation.roomId,
        kind: "reply",
        parent_id: conversation.id,
        body: reply.body,
        author_name: reply.authorName,
        avatar_url: reply.authorAvatar,
        created_at: reply.createdAt,
        drop_id: reply.dropId || null,
        metadata: reply.dropSnapshot ? { dropSnapshot: reply.dropSnapshot } : {},
        source: "board_activity",
      });
    }
  }
  return posts;
}

export function roomActivityOrFilter(roomId: string): string {
  const candidates = roomIdCandidates(roomId);
  const parts = candidates.flatMap((id) => [
    `meta->>roomId.eq.${id}`,
    `meta->>forumRoomId.eq.${id}`,
    `href.ilike.%/board/forums/${id}%`,
  ]);
  return parts.join(",");
}

export function forumRoomActivityHref(roomId: string, conversationId?: string | null): string {
  return roomHref(roomId, conversationId ? { conversation: conversationId } : undefined);
}
