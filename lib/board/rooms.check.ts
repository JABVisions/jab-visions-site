import {
  BOARD_ROOM_CATALOG,
  canGoLive,
  canStartCall,
  conversationsForRoom,
  describeRoomActivity,
  forumPickerRooms,
  getRoomById,
  isPresenceEvent,
  isRoomActivityType,
  liveOfficialRooms,
  livePresence,
  mergeRoomFeed,
  officialRooms,
  permissionsForRole,
  presenceLabel,
  resolveRoomId,
  roomActivityGroupKey,
  roomHref,
  seedConversations,
  shouldEmitRoomActivity,
  upsertPresence,
} from "./rooms";
import { mapRoomRow } from "./rooms/server";
import type { RoomConversation, RoomDropShare, RoomPresence } from "./rooms/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(resolveRoomId("music-drops") === "music", "music-drops aliases to official Music room");
assert(resolveRoomId("auditions") === "casting", "auditions aliases to Casting Corner");
assert(resolveRoomId("jab-news") === "announcements", "jab-news aliases to Announcements");
assert(resolveRoomId("general") === "lobby", "general aliases to Lobby");
assert(getRoomById("jab-lit")?.name === "JAB LIT", "JAB LIT is in the catalog");
assert(getRoomById("jab-comics")?.isOfficial === true, "JAB Comics is official");
assert(getRoomById("music")?.chips.includes("Beats") === true, "Music room keeps Voice Studio chips");
assert(getRoomById("those-ryderz")?.comingSoon === false, "Those Ryderz is enterable");
assert(getRoomById("those-ryderz")?.kind === "official", "Those Ryderz is a first-class official room");
assert(getRoomById("those-ryderz")?.isOfficial === true, "Those Ryderz keeps JAB Official treatment");
assert(getRoomById("jab-visions")?.comingSoon === false, "JAB Visions is enterable");
assert(getRoomById("jab-visions")?.kind === "official", "JAB Visions is a first-class official room");
assert(getRoomById("jab-visions")?.isOfficial === true, "JAB Visions keeps JAB Official treatment");
assert(officialRooms().length >= 5, "official architecture can grow beyond the first three rooms");
assert(liveOfficialRooms().every((room) => !room.comingSoon), "live official rooms are enterable");
assert(
  liveOfficialRooms().some((room) => room.id === "those-ryderz") &&
    liveOfficialRooms().some((room) => room.id === "jab-visions"),
  "Those Ryderz and JAB Visions are live official rooms"
);
assert(roomHref("those-ryderz") === "/board/forums/those-ryderz", "Those Ryderz interior path resolves");
assert(roomHref("ryderz-lore") === "/board/forums/those-ryderz", "ryderz-lore aliases into Those Ryderz");
assert(roomHref("jab-visions") === "/board/forums/jab-visions", "JAB Visions interior path resolves");
assert(forumPickerRooms().some((room) => room.id === "those-ryderz"), "Drop Console picker includes Those Ryderz");
assert(forumPickerRooms().some((room) => room.id === "jab-visions"), "Drop Console picker includes JAB Visions");
assert(
  BOARD_ROOM_CATALOG.some((room) => room.id === "lobby") &&
    BOARD_ROOM_CATALOG.some((room) => room.id === "casting"),
  "existing Board rooms still exist"
);
assert(forumPickerRooms().some((room) => room.id === "jab-lit"), "Drop Console picker includes official rooms");
assert(roomHref("music-drops") === "/board/forums/music", "forum thread hrefs resolve to room routes");

const viewer = permissionsForRole("viewer", getRoomById("music"));
assert(viewer.post === false && viewer.follow === true, "viewers follow but do not post");
assert(canStartCall("member", getRoomById("music")) === true, "members can start a Room Call placeholder");
assert(canGoLive("member", getRoomById("music")) === false, "Go Live stays host/owner until media is wired");
assert(canGoLive("host", getRoomById("music")) === true, "hosts can Go Live");
assert(permissionsForRole("member", getRoomById("those-ryderz")).join === true, "Those Ryderz members can join");
assert(permissionsForRole("member", getRoomById("those-ryderz")).shareDrop === true, "Those Ryderz members can share Drops");
assert(canStartCall("member", getRoomById("those-ryderz")) === true, "Those Ryderz members can start a Room Call placeholder");
assert(canGoLive("host", getRoomById("jab-visions")) === true, "JAB Visions hosts can Go Live");
assert(permissionsForRole("member", getRoomById("jab-visions")).post === true, "JAB Visions members can post");

assert(isPresenceEvent("entered") === true, "enter is a presence event");
assert(shouldEmitRoomActivity("entered") === false, "presence enter is not an Activity Channel event");
assert(shouldEmitRoomActivity("left") === false, "presence leave is not an Activity Channel event");
assert(shouldEmitRoomActivity("room_joined") === true, "first join can notify");
assert(shouldEmitRoomActivity("room_drop_shared") === true, "drop shares notify");
assert(isRoomActivityType("room_live_started") === true, "live start is a meaningful activity");
assert(
  roomActivityGroupKey("room_joined", "music", "user-1") === "room_joined:music:user-1",
  "join activity is once per user per room"
);
assert(
  describeRoomActivity("room_drop_shared", "Maya", "Music", { dropTitle: "Night Tape" }) ===
    "Maya shared Night Tape in Music.",
  "drop-share copy names the room"
);

const presence: RoomPresence[] = [
  {
    userId: "a",
    roomId: "music",
    displayName: "A",
    lastSeenAt: new Date().toISOString(),
  },
  {
    userId: "b",
    roomId: "music",
    displayName: "B",
    lastSeenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
];
assert(livePresence(presence).length === 1, "stale presence is not counted as inside");
assert(presenceLabel(8) === "8 inside", "presence copy uses inside language");
const upserted = upsertPresence(presence, {
  userId: "a",
  roomId: "music",
  displayName: "A+",
  lastSeenAt: new Date().toISOString(),
});
assert(upserted.filter((row) => row.userId === "a").length === 1, "presence upsert replaces the same person");

const conversations: RoomConversation[] = seedConversations([]);
assert(conversationsForRoom(conversations, "lobby").length >= 2, "legacy lobby threads still seed");
assert(conversationsForRoom(conversations, "jab-lit").length >= 1, "JAB LIT has a conversation seed");
assert(conversationsForRoom(conversations, "music").length >= 1, "Music keeps discussion as a room component");
assert(conversationsForRoom(conversations, "those-ryderz").length >= 1, "Those Ryderz has a conversation seed");
assert(conversationsForRoom(conversations, "jab-visions").length >= 1, "JAB Visions has a conversation seed");

const share: RoomDropShare = {
  id: "share_1",
  roomId: "jab-comics",
  dropId: "drop_art",
  sharedBy: "user-1",
  sharedByName: "Rina",
  snapshot: { title: "Panel 03", type: "Media", mediaKind: "image" },
  createdAt: new Date().toISOString(),
};
const feed = mergeRoomFeed({
  conversations: conversationsForRoom(conversations, "jab-comics"),
  shares: [share],
  sessions: [
    {
      id: "live_1",
      roomId: "jab-comics",
      kind: "live",
      provider: "none",
      status: "live",
      mode: "LIVE",
      startedBy: "user-1",
      startedAt: new Date().toISOString(),
      endedAt: null,
      speakerIds: ["user-1"],
      viewerCount: 12,
    },
  ],
});
assert(feed.some((item) => item.kind === "drop_share"), "shared drops appear in the room feed");
assert(feed.some((item) => item.kind === "live"), "live placeholder sessions appear in the room feed");
assert(feed.some((item) => item.kind === "conversation"), "existing discussions remain a room component");

const staleSql = mapRoomRow({
  id: "those-ryderz",
  slug: "those-ryderz",
  kind: "reserved",
  is_official: true,
  coming_soon: true,
  name: "Those Ryderz",
});
assert(staleSql?.comingSoon === false, "catalog opens Those Ryderz even if SQL still says coming_soon");
assert(staleSql?.kind === "official", "catalog kind wins so Those Ryderz is official, not reserved");
const staleVisions = mapRoomRow({
  id: "jab-visions",
  slug: "jab-visions",
  kind: "reserved",
  is_official: true,
  coming_soon: true,
});
assert(staleVisions?.comingSoon === false, "catalog opens JAB Visions even if SQL still says coming_soon");
assert(
  getRoomById("jab-lit")?.comingSoon === false &&
    getRoomById("jab-comics")?.comingSoon === false &&
    getRoomById("music")?.comingSoon === false &&
    getRoomById("lobby")?.comingSoon === false,
  "existing Forums rooms stay enterable"
);

console.log("forums rooms architecture checks passed");
