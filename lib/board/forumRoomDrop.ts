import type { DropItem } from "@/lib/board/dropItem";
import type { DropDestination, ForumRoomDestination } from "@/lib/board/dropDestination";
import { isForumRoomDestination } from "@/lib/board/dropDestination";
import type {
  RoomConversation,
  RoomConversationReply,
  RoomDropShare,
  RoomFeedItem,
  RoomPermissions,
} from "@/lib/board/rooms/types";

export type RoomShareOrigin = "create" | "share";

export type ForumRoomDropPlacement =
  | { kind: "room"; roomId: string; origin: RoomShareOrigin }
  | {
      kind: "conversation";
      roomId: string;
      conversationId: string;
      conversationTitle?: string;
    };

export function placementFromDestination(
  destination: DropDestination | null | undefined
): ForumRoomDropPlacement | null {
  if (!isForumRoomDestination(destination)) return null;
  if (destination.type === "room_conversation") {
    return {
      kind: "conversation",
      roomId: destination.roomId,
      conversationId: destination.conversationId,
      conversationTitle: destination.conversationTitle,
    };
  }
  return { kind: "room", roomId: destination.roomId, origin: "create" };
}

export function canCreateRoomDrop(
  permissions: Pick<RoomPermissions, "post" | "shareDrop"> | null | undefined,
  room?: { comingSoon?: boolean } | null
): boolean {
  if (room?.comingSoon) return false;
  return Boolean(permissions?.post || permissions?.shareDrop);
}

export function canCreateConversationDrop(
  permissions: Pick<RoomPermissions, "reply"> | null | undefined,
  conversation?: Pick<RoomConversation, "mood"> | null,
  room?: { comingSoon?: boolean } | null
): boolean {
  if (room?.comingSoon) return false;
  if (conversation?.mood === "locked") return false;
  return Boolean(permissions?.reply);
}

export function canRemoveFromRoom(input: {
  share: Pick<RoomDropShare, "sharedBy">;
  userId?: string | null;
  moderate?: boolean;
}): boolean {
  if (input.moderate) return true;
  const owner = String(input.share.sharedBy || "");
  const userId = String(input.userId || "");
  return Boolean(owner && userId && owner === userId);
}

/** Moderators/hosts unshare. The global Drop is never deleted from this path. */
export function removeShareFromRoom(
  shares: RoomDropShare[],
  input: { roomId: string; dropId: string; shareId?: string }
): RoomDropShare[] {
  const roomId = String(input.roomId || "");
  const dropId = String(input.dropId || "");
  const shareId = String(input.shareId || "");
  return shares.filter((share) => {
    if (shareId && share.id === shareId) return false;
    return !(share.roomId === roomId && share.dropId === dropId && !shareId);
  });
}

export function dropSnapshotFromItem(drop: DropItem): Record<string, unknown> {
  return {
    id: drop.id,
    title: drop.title,
    type: drop.type,
    createdAt: drop.createdAt,
    url: drop.url,
    embedUrl: drop.embedUrl ?? null,
    hostLabel: drop.hostLabel,
    headline: drop.headline,
    previewTitle: drop.previewTitle,
    previewDescription: drop.previewDescription,
    previewImage: drop.previewImage,
    previewImages: drop.previewImages,
    mediaUrl: drop.mediaUrl,
    bucket: drop.bucket,
    storagePath: drop.storagePath,
    fileName: drop.fileName,
    mime: drop.mime,
    mediaKind: drop.mediaKind,
    description: drop.description,
    thoughtText: drop.thoughtText,
    thoughtFormat: drop.thoughtFormat,
    linkUrl: drop.linkUrl,
    fromDescript: drop.fromDescript === true,
    fromDropbook: drop.fromDropbook === true,
    visibility: drop.visibility === "private" ? "private" : "public",
    customizations: drop.customizations,
    authorName: undefined,
  };
}

export function shareFromCreatedDrop(input: {
  id: string;
  roomId: string;
  drop: DropItem;
  sharedBy: string;
  sharedByName?: string;
  origin?: RoomShareOrigin;
  conversationId?: string | null;
  activityId?: string | null;
}): RoomDropShare {
  return {
    id: input.id,
    roomId: input.roomId,
    dropId: input.drop.id,
    sharedBy: input.sharedBy,
    sharedByName: input.sharedByName,
    activityId: input.activityId ?? null,
    snapshot: dropSnapshotFromItem(input.drop),
    createdAt: new Date().toISOString(),
    origin: input.origin || "create",
    conversationId: input.conversationId || null,
  };
}

export function conversationReplyFromDrop(input: {
  id: string;
  threadId: string;
  drop: DropItem;
  authorName: string;
  authorAvatar?: string;
}): RoomConversationReply {
  const title = String(input.drop.title || "").trim();
  return {
    id: input.id,
    threadId: input.threadId,
    authorName: input.authorName,
    authorAvatar: input.authorAvatar,
    body: title ? `Replied with ${title}` : "Replied with a Drop",
    createdAt: new Date().toISOString(),
    dropId: input.drop.id,
    dropSnapshot: dropSnapshotFromItem(input.drop),
  };
}

/**
 * Room-feed pointer for a Conversation Drop.
 * Names the conversation without duplicating the media card.
 */
export function conversationDropPointerItem(input: {
  reply: RoomConversationReply;
  conversation: RoomConversation;
}): RoomFeedItem | null {
  const dropId = String(input.reply.dropId || "").trim();
  if (!dropId) return null;
  const createdAt = Date.parse(input.reply.createdAt) || Date.now();
  return {
    id: `conversation_drop:${input.reply.id}`,
    roomId: input.conversation.roomId,
    kind: "reply",
    createdAt,
    title: input.conversation.title,
    body: `${input.reply.authorName} shared a Drop in ${input.conversation.title}`,
    authorName: input.reply.authorName,
    conversation: input.conversation,
  };
}

export function conversationDropPointers(conversations: RoomConversation[]): RoomFeedItem[] {
  const items: RoomFeedItem[] = [];
  for (const conversation of conversations) {
    for (const reply of conversation.replies || []) {
      const item = conversationDropPointerItem({ reply, conversation });
      if (item) items.push(item);
    }
  }
  return items;
}

/** Room-level shares render as full Drops. Conversation-origin shares stay pointers only. */
export function roomFeedShares(shares: RoomDropShare[]): RoomDropShare[] {
  return shares.filter((share) => share.origin !== "conversation");
}

export function destinationDoesNotWriteWorkBoard(
  destination: ForumRoomDestination | DropDestination | null | undefined
): boolean {
  if (!destination) return true;
  return destination.type !== "project_room";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}
