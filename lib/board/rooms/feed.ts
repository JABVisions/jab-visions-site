import { boardDropToActivity } from "@/lib/board/boardDropActivity";
import type { BoardActivity } from "@/lib/board/activity";
import { conversationDropPointers, roomFeedShares } from "@/lib/board/forumRoomDrop";
import type { RoomConversation, RoomDropShare, RoomFeedItem, RoomSession } from "./types";

function parseTime(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function conversationToFeedItem(conversation: RoomConversation): RoomFeedItem {
  const latestReply = conversation.replies[0]?.createdAt;
  return {
    id: `conversation:${conversation.id}`,
    roomId: conversation.roomId,
    kind: "conversation",
    createdAt: parseTime(latestReply || conversation.createdAt),
    pinned: conversation.isPinned,
    title: conversation.title,
    body: conversation.body,
    authorName: conversation.authorName,
    conversation,
  };
}

export function shareToFeedItem(share: RoomDropShare): RoomFeedItem {
  const snapshot = share.snapshot || {};
  return {
    id: `share:${share.id}`,
    roomId: share.roomId,
    kind: "drop_share",
    createdAt: parseTime(share.createdAt),
    title: String(snapshot.title || snapshot.dropTitle || "Shared Drop"),
    body: String(snapshot.description || snapshot.body || ""),
    authorName: share.sharedByName || String(snapshot.authorName || "Board"),
    share,
  };
}

export function sessionToFeedItem(session: RoomSession): RoomFeedItem {
  return {
    id: `session:${session.id}`,
    roomId: session.roomId,
    kind: session.kind,
    createdAt: parseTime(session.startedAt || Date.now()),
    title: session.kind === "live" ? "Live Room" : "Room Call",
    body:
      session.kind === "live"
        ? "A Live Room is broadcasting. Discussion stays open beside the stream."
        : "A Room Call is open. Everyone in the room can speak when media is wired.",
    session,
  };
}

export function mergeRoomFeed(input: {
  conversations?: RoomConversation[];
  shares?: RoomDropShare[];
  sessions?: RoomSession[];
}): RoomFeedItem[] {
  const items: RoomFeedItem[] = [
    ...(input.conversations ?? []).map(conversationToFeedItem),
    ...roomFeedShares(input.shares ?? []).map(shareToFeedItem),
    ...conversationDropPointers(input.conversations ?? []),
    ...(input.sessions ?? []).map(sessionToFeedItem),
  ];
  return items.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export function activityFromRoomShare(share: RoomDropShare): BoardActivity | null {
  const snapshot = share.snapshot || {};
  const dropId = share.dropId || String(snapshot.id || snapshot.dropId || "");
  if (!dropId) return null;
  return boardDropToActivity(
    {
      id: dropId,
      title: String(snapshot.title || "Shared Drop"),
      type: String(snapshot.type || snapshot.dropType || "Media"),
      createdAt: share.createdAt,
      url: typeof snapshot.url === "string" ? snapshot.url : undefined,
      embedUrl: typeof snapshot.embedUrl === "string" ? snapshot.embedUrl : null,
      hostLabel: typeof snapshot.hostLabel === "string" ? snapshot.hostLabel : undefined,
      previewTitle: typeof snapshot.previewTitle === "string" ? snapshot.previewTitle : undefined,
      previewDescription:
        typeof snapshot.previewDescription === "string" ? snapshot.previewDescription : undefined,
      previewImage: typeof snapshot.previewImage === "string" ? snapshot.previewImage : undefined,
      previewImages: Array.isArray(snapshot.previewImages)
        ? snapshot.previewImages.filter((item): item is string => typeof item === "string")
        : undefined,
      mediaUrl: typeof snapshot.mediaUrl === "string" ? snapshot.mediaUrl : undefined,
      bucket: typeof snapshot.bucket === "string" ? snapshot.bucket : undefined,
      storagePath: typeof snapshot.storagePath === "string" ? snapshot.storagePath : undefined,
      fileName: typeof snapshot.fileName === "string" ? snapshot.fileName : undefined,
      mime: typeof snapshot.mime === "string" ? snapshot.mime : undefined,
      mediaKind: typeof snapshot.mediaKind === "string" ? snapshot.mediaKind : undefined,
      description: typeof snapshot.description === "string" ? snapshot.description : undefined,
      thoughtText: typeof snapshot.thoughtText === "string" ? snapshot.thoughtText : undefined,
      thoughtFormat: typeof snapshot.thoughtFormat === "string" ? snapshot.thoughtFormat : undefined,
      linkUrl: typeof snapshot.linkUrl === "string" ? snapshot.linkUrl : undefined,
      fromDescript: snapshot.fromDescript === true,
      fromDropbook: snapshot.fromDropbook === true,
      visibility: snapshot.visibility === "private" ? "private" : "public",
      customizations: snapshot.customizations,
    },
    {
      activityId: share.activityId || `room_share_${share.id}`,
      userId: share.sharedBy,
      author: {
        displayName: share.sharedByName || String(snapshot.authorName || ""),
        username: typeof snapshot.authorUsername === "string" ? snapshot.authorUsername : null,
        avatarSrc: typeof snapshot.authorAvatar === "string" ? snapshot.authorAvatar : null,
      },
    }
  );
}
