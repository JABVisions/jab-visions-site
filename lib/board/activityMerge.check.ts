import type { BoardActivity } from "./activity";
import { activityForumPath } from "./boardAuthor";
import { dedupeActivity } from "./activityMerge";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const joanProfile: BoardActivity = {
  id: "profile_board_drop_user_1790703225962_a400d502a5552",
  created_at: "2026-09-29T17:33:55.311Z",
  user_id: "user-john",
  kind: "board_drop",
  title: "Drop in JAB Comics",
  body: "New media drop from Johnandy.",
  href: "https://example.com/IMG_0511.jpeg",
  image_url: "https://example.com/IMG_0511.jpeg",
  meta: {
    source: "profiles.board_style.boardDrops",
    dropId: "1790703225962_a400d502a5552",
    dropType: "Media",
    mediaKind: "image",
    roomId: null,
    roomName: null,
    destinationType: null,
    authorName: "Johnandy",
  },
};

const joanLocal: BoardActivity = {
  id: "local_joan",
  created_at: "2026-09-29T17:33:55.000Z",
  user_id: "user-john",
  kind: "board_drop",
  title: "Added a Drop to JAB Comics",
  body: "Johnandy added a Drop to 💥 JAB Comics.",
  href: "https://example.com/IMG_0511.jpeg",
  image_url: "https://example.com/IMG_0511.jpeg",
  meta: {
    source: "forum_room_studio",
    origin: "create",
    destinationType: "room",
    roomId: "jab-comics",
    roomName: "JAB Comics",
    roomIcon: "💥",
    dropId: "1790703225962_a400d502a5552",
    dropType: "Media",
    mediaKind: "image",
    authorName: "Johnandy",
  },
};

const merged = dedupeActivity([joanProfile, joanLocal]);
assert(merged.length === 1, "forum profile copy and local forum copy are one Drop");
assert(
  activityForumPath(merged[0]!) === "/board/forums/jab-comics",
  "merged forum Drop still opens JAB Comics"
);
assert(merged[0]?.title === "Added a Drop to JAB Comics", "merged title keeps the Forum sentence");
assert(
  merged[0]?.body === "Johnandy added a Drop to 💥 JAB Comics.",
  "merged description keeps who added the Drop"
);
assert(merged[0]?.meta?.source === "forum_room_studio", "profile source does not wipe the Forum source");
assert(merged[0]?.meta?.roomId === "jab-comics", "null roomId does not wipe the Forum room");

const profileOnly = dedupeActivity([joanProfile]);
assert(profileOnly.length === 1, "a profile-only Forum Drop stays one card");
assert(
  activityForumPath(profileOnly[0]!) === "/board/forums/jab-comics",
  "Drop in JAB Comics still opens the Forum after refresh"
);
assert(
  profileOnly[0]?.title === "Added a Drop to JAB Comics",
  "profile-only title is the Forum sentence"
);
assert(
  profileOnly[0]?.body === "Johnandy added a Drop to 💥 JAB Comics.",
  "profile-only description names the Forum"
);

const feedNamed: BoardActivity = {
  ...joanProfile,
  id: "feed_music_title",
  title: "Drop in Music",
  body: "A demo, not a room post.",
  meta: {
    source: "drop_studio",
    destinationType: "feed",
    dropId: "feed_music_title",
  },
};
assert(
  activityForumPath(dedupeActivity([feedNamed])[0]!) === null,
  "a Feed Drop titled Drop in Music does not become a Forum button"
);

const projectRoom: BoardActivity = {
  ...joanProfile,
  id: "project_room_zoe",
  title: "THOSE RYDERZ — Audition tape",
  body: "Zoe posted an audition tape in Those Ryderz.",
  meta: {
    destinationType: "project_room",
    cardStyle: "project_room_drop",
    origin: "project_room",
    roomId: "those-ryderz",
    dropId: "project_room_zoe",
  },
};
assert(
  activityForumPath(dedupeActivity([projectRoom])[0]!) === null,
  "project room tapes do not grow a Forum button"
);

console.log("activityMerge.check.ts: ok");
