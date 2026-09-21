import {
  canCreateConversationDrop,
  canCreateRoomDrop,
  canRemoveFromRoom,
  conversationDropPointerItem,
  conversationReplyFromDrop,
  destinationDoesNotWriteWorkBoard,
  isUuid,
  placementFromDestination,
  removeShareFromRoom,
  roomFeedShares,
  shareFromCreatedDrop,
} from "./forumRoomDrop";
import { mergeRoomFeed } from "./rooms/feed";
import { permissionsForRole } from "./rooms/permissions";
import { getRoomById } from "./rooms/catalog";
import type { DropItem } from "./dropItem";
import type { RoomConversation, RoomDropShare } from "./rooms/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const music = getRoomById("music");
const member = permissionsForRole("member", music);
const viewer = permissionsForRole("viewer", music);

assert(canCreateRoomDrop(member, music) === true, "members can create a Room Drop");
assert(canCreateRoomDrop(viewer, music) === false, "viewers cannot create a Room Drop");
assert(canCreateRoomDrop(member, { comingSoon: true }) === false, "coming soon rooms cannot create");

const openThread: RoomConversation = {
  id: "com1",
  roomId: "jab-comics",
  title: "Comic Character Design",
  body: "Sheets",
  authorName: "Rina",
  createdAt: new Date().toISOString(),
  replies: [],
  mood: "active",
};
const lockedThread: RoomConversation = { ...openThread, mood: "locked" };

assert(canCreateConversationDrop(member, openThread, music) === true, "members can reply with a Drop");
assert(canCreateConversationDrop(member, lockedThread, music) === false, "locked conversations disable Add Drop");
assert(canCreateConversationDrop(viewer, openThread, music) === false, "viewers cannot reply with a Drop");

const drop: DropItem = {
  id: "drop_scene",
  title: "Rewritten scene",
  type: "Doc",
  createdAt: Date.now(),
  fromDescript: true,
};

const roomShare = shareFromCreatedDrop({
  id: "share_1",
  roomId: "jab-lit",
  drop: { ...drop, id: "drop_excerpt", title: "Screenplay excerpt" },
  sharedBy: "user-1",
  sharedByName: "John",
  origin: "create",
});
assert(roomShare.origin === "create", "studio publish records create origin");
assert(roomShare.dropId === "drop_excerpt", "share references the Drop id");
assert(roomShare.snapshot.title === "Screenplay excerpt", "share stores a snapshot, not a media blob");

const conversationShare = shareFromCreatedDrop({
  id: "share_2",
  roomId: "jab-comics",
  drop,
  sharedBy: "user-1",
  origin: "conversation",
  conversationId: "com1",
});
assert(roomFeedShares([roomShare, conversationShare]).length === 1, "conversation shares do not duplicate media in the room feed");
assert(roomFeedShares([roomShare, conversationShare])[0].id === "share_1", "only room-level shares render as Drop cards");

const reply = conversationReplyFromDrop({
  id: "sig_1",
  threadId: "com1",
  drop,
  authorName: "John",
});
assert(reply.dropId === "drop_scene", "conversation reply attaches drop_id");
assert(/Replied with/.test(reply.body), "conversation reply keeps a text pointer");

const pointer = conversationDropPointerItem({
  reply,
  conversation: { ...openThread, replies: [reply] },
});
assert(pointer?.kind === "reply", "conversation drop appears as a reply pointer");
assert(pointer?.share === undefined, "pointer does not duplicate the Drop card");
assert(
  pointer?.body === "John replied with a Drop in Comic Character Design in JAB Comics.",
  "pointer names the conversation and the Forum Room instead of cloning media"
);
assert(
  pointer?.title === "Drop in Comic Character Design",
  "conversation pointer title is the thread, not a filename"
);

const filenameReply = conversationReplyFromDrop({
  id: "sig_file",
  threadId: "com1",
  drop: { ...drop, id: "drop_clip", title: "IMG_1234.MOV" },
  authorName: "John",
});
assert(
  filenameReply.body === "Replied with a Drop",
  "conversation reply body does not interpolate a filename"
);

const feed = mergeRoomFeed({
  conversations: [{ ...openThread, replies: [reply] }],
  shares: [roomShare, conversationShare],
});
assert(feed.some((item) => item.kind === "drop_share" && item.share?.dropId === "drop_excerpt"), "room drop renders with existing Drop card");
assert(!feed.some((item) => item.kind === "drop_share" && item.share?.dropId === "drop_scene"), "conversation drop is not a second media card");
assert(feed.some((item) => item.id === "conversation_drop:sig_1"), "conversation drop still appears in room activity");

const remaining = removeShareFromRoom([roomShare], { roomId: "jab-lit", dropId: "drop_excerpt" });
assert(remaining.length === 0, "remove-from-room unshares");
assert(drop.id === "drop_scene", "remove-from-room does not delete the global Drop object");

assert(
  canRemoveFromRoom({ share: roomShare, userId: "user-1" }) === true,
  "owner can remove their share from the room"
);
assert(
  canRemoveFromRoom({ share: roomShare, userId: "user-2" }) === false,
  "other members cannot remove someone else's share"
);
assert(
  canRemoveFromRoom({ share: roomShare, userId: "mod", moderate: true }) === true,
  "moderators can remove from room without deleting the Drop"
);

assert(
  placementFromDestination({ type: "feed" }) === null,
  "feed destination does not create a room placement"
);
assert(placementFromDestination({ type: "room", roomId: "music" })?.kind === "room", "room destination places on the room feed");
assert(
  placementFromDestination({
    type: "room_conversation",
    roomId: "jab-comics",
    conversationId: "com1",
  })?.kind === "conversation",
  "conversation destination places as a reply"
);
assert(
  destinationDoesNotWriteWorkBoard({ type: "room", roomId: "music" }) === true,
  "forum room publish does not write Work Board"
);
assert(isUuid("not-a-uuid") === false, "local seed conversation ids are not UUIDs");
assert(isUuid("11111111-1111-4111-8111-111111111111") === true, "db conversation ids are UUIDs");

console.log("forumRoomDrop.check.ts: ok");
