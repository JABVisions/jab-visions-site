import { activityDropFamily, activityFamiliesCompatible, dedupeActivity } from "@/lib/board/activityMerge";
import { toSoundCloudEmbed } from "@/lib/board/soundCloudEmbed";
import { conversationsForRoom, seedConversations } from "./conversations";
import {
  conversationsFromActivityRows,
  shareFromActivityRow,
  sharesFromActivityRows,
} from "./cloudHydrate";
import { mergeConversationSources, mergeShareSources, roomFeedFromSources } from "./roomPostsSource";
import type { RoomActivityLike } from "./cloudHydrate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const LANA = "https://soundcloud.com/lanadelrey/video-games";
const LANA_EMBED = toSoundCloudEmbed(LANA);

const phoneDrop: RoomActivityLike = {
  id: "uuid-phone-comics",
  created_at: "2026-10-02T17:00:00.000Z",
  user_id: "user-phone",
  kind: "board_drop",
  title: "Added a Drop to JAB Comics",
  body: "Maya added a Drop to 💥 JAB Comics.",
  href: "https://example.com/panel.png",
  image_url: "https://example.com/panel.png",
  meta: {
    source: "forum_room_studio",
    origin: "create",
    destinationType: "room",
    roomId: "jab-comics",
    roomName: "JAB Comics",
    dropId: "drop_phone_panel",
    dropType: "Media",
    mediaKind: "image",
    mediaUrl: "https://example.com/panel.png",
    visibility: "public",
    authorName: "Maya",
  },
};

const emptyDesktop = roomFeedFromSources({
  roomId: "jab-comics",
  localConversations: [],
  remoteConversations: conversationsFromActivityRows("jab-comics", [phoneDrop]),
  localShares: [],
  remoteShares: sharesFromActivityRows("jab-comics", [phoneDrop]),
});

assert(
  emptyDesktop.some((item) => item.kind === "drop_share" && item.share?.dropId === "drop_phone_panel"),
  "phone Room Drop hydrates on desktop with empty localStorage"
);
assert(
  emptyDesktop.some(
    (item) => item.kind === "conversation" && item.title === "Character sheets and panel WIPs"
  ),
  "JAB Comics seed conversation remains with empty localStorage"
);
assert(
  conversationsForRoom(seedConversations([]), "jab-comics").some((item) => item.id === "com1"),
  "Character sheets seed is catalog-backed"
);

const wiped = mergeShareSources({
  roomId: "jab-comics",
  local: [],
  remote: sharesFromActivityRows("jab-comics", [phoneDrop]),
});
assert(wiped.length === 1, "empty localStorage does not replace cloud Room Drops");

const afterEmptyFetch = mergeShareSources({
  roomId: "jab-comics",
  local: wiped,
  remote: [],
});
assert(afterEmptyFetch.length === 1, "a later empty shares fetch does not wipe activity rows");

const conversationDrop: RoomActivityLike = {
  id: "uuid-phone-reply",
  created_at: "2026-10-02T17:05:00.000Z",
  user_id: "user-phone",
  kind: "board_drop",
  title: "Added a Drop to JAB Comics",
  body: "Maya replied with a Drop in Character sheets and panel WIPs in JAB Comics.",
  href: "https://example.com/turnaround.png",
  meta: {
    source: "forum_room_studio",
    origin: "conversation",
    destinationType: "room_conversation",
    roomId: "jab-comics",
    conversationId: "com1",
    conversationTitle: "Character sheets and panel WIPs",
    dropId: "drop_phone_turnaround",
    dropType: "Media",
    mediaKind: "image",
    visibility: "public",
    authorName: "Maya",
  },
};

assert(
  shareFromActivityRow("jab-comics", conversationDrop) === null,
  "conversation Drops are not a second Room Drop card"
);
const threads = mergeConversationSources({
  roomId: "jab-comics",
  local: [],
  remote: conversationsFromActivityRows("jab-comics", [conversationDrop]),
});
const seed = threads.find((item) => item.id === "com1");
assert(seed?.title === "Character sheets and panel WIPs", "conversation Drop attaches to the seed thread");
assert(
  seed?.replies.some((reply) => reply.dropId === "drop_phone_turnaround"),
  "phone Conversation Drop is a reply on the seed thread"
);

const musicWrongRoom = sharesFromActivityRows("jab-comics", [
  {
    ...phoneDrop,
    meta: { ...(phoneDrop.meta as object), roomId: "music", dropId: "drop_music" },
  },
]);
assert(musicWrongRoom.length === 0, "Music activity does not leak into JAB Comics");

const lanaActivity = {
  id: "lana_soundcloud_1",
  created_at: "2026-09-20T12:00:00.000Z",
  user_id: "user-lana",
  kind: "board_drop" as const,
  title: "Lana Del Rey",
  body: "Video Games",
  href: LANA,
  image_url: "https://i1.sndcdn.com/artworks-lana.jpg",
  meta: {
    dropId: "lana_soundcloud_1",
    dropType: "Music",
    embedUrl: LANA_EMBED,
    roomId: "jab-comics",
    destinationType: "room",
    origin: "create",
    visibility: "public",
  },
};
const zoeActivity = {
  id: "project_room_zoe_audition",
  created_at: "2026-09-21T12:00:00.000Z",
  user_id: "user-zoe",
  kind: "board_drop" as const,
  title: "THOSE RYDERZ Audition | Zoe Folie",
  body: "Zoe posted an audition tape in Those Ryderz.",
  href: "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/those-ryderz/zoe-folie-audition.MOV?token=tape",
  image_url: null,
  meta: {
    dropId: "project_room_zoe_audition",
    dropType: "Media",
    mediaKind: "video",
    cardStyle: "project_room_drop",
    destinationType: "project_room",
    roomId: "those-ryderz",
    visibility: "public",
  },
};

assert(activityDropFamily(lanaActivity) === "streaming_music", "Lana is streaming music");
assert(activityDropFamily(zoeActivity) === "stored_video", "Zoe audition is stored video");
assert(
  activityFamiliesCompatible(lanaActivity, zoeActivity) === false,
  "Lana SoundCloud and Zoe audition families never collapse"
);

const mixed = dedupeActivity([lanaActivity, zoeActivity]);
assert(
  mixed.some((item) => item.id === "lana_soundcloud_1" && item.href === LANA),
  "Lana SoundCloud survives hydrate with Zoe"
);
assert(
  mixed.some((item) => item.id === "project_room_zoe_audition"),
  "Zoe audition survives hydrate with Lana"
);

const roomLana = sharesFromActivityRows("jab-comics", [lanaActivity, zoeActivity]);
assert(roomLana.some((share) => share.dropId === "lana_soundcloud_1"), "Lana can appear as a Room Drop");
assert(
  !roomLana.some((share) => share.dropId === "project_room_zoe_audition"),
  "project-room Zoe tape does not become a Forum Room Drop"
);

const privatePhone: RoomActivityLike = {
  ...phoneDrop,
  id: "uuid-private",
  meta: { ...(phoneDrop.meta as object), dropId: "drop_private", visibility: "private" },
};
assert(
  sharesFromActivityRows("jab-comics", [privatePhone], "someone-else").length === 0,
  "private phone Drops stay hidden on another desktop login"
);
assert(
  sharesFromActivityRows("jab-comics", [privatePhone], "user-phone").length === 1,
  "owner still sees their private Room Drop after login"
);

console.log("forums room cloud hydrate checks passed");
