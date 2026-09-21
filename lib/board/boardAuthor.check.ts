import {
  activityForumPath,
  applyForumDropNavigation,
  authorFromProfileRow,
  forumDropPath,
  hydrateActivityAuthor,
  isPlaceholderBoardName,
  pickBoardDisplayName,
  presenceFromApiRow,
  replacePlaceholderActor,
} from "./boardAuthor";
import { activityFromRoomShare } from "./rooms/feed";
import type { BoardActivity } from "./activity";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isPlaceholderBoardName("Board User") === true, "Board User is a placeholder");
assert(isPlaceholderBoardName("You") === true, "You is a placeholder");
assert(isPlaceholderBoardName("Those Ryderz") === false, "Those Ryderz stays a real name");
assert(isPlaceholderBoardName("John Andy") === false, "profile names are real");

assert(
  pickBoardDisplayName("Board User", "John Andy", "johnandy") === "John Andy",
  "author display name from profile is used instead of Board User when a name exists"
);
assert(
  pickBoardDisplayName("Board User", "", "johnandy") === "johnandy",
  "username wins when the display name is the Board User fallback"
);
assert(
  pickBoardDisplayName("Those Ryderz") === "Those Ryderz",
  "Those Ryderz display name stays Those Ryderz"
);

assert(
  replacePlaceholderActor("Board User added a Drop to Music.", "John Andy") ===
    "John Andy added a Drop to Music.",
  "baked Board User copy is rewritten to the profile name"
);

assert(forumDropPath({ roomId: "music" }) === "/board/forums/music", "room Drop points at the room");
assert(
  forumDropPath({ roomId: "jab-comics", conversationId: "com1" }) ===
    "/board/forums/jab-comics?conversation=com1",
  "conversation Drop activity path points at the forum room and conversation"
);

const roomActivity: BoardActivity = {
  id: "act_room",
  created_at: new Date().toISOString(),
  user_id: "user-1",
  kind: "board_drop",
  title: "Added a Drop to Music",
  body: "Board User added a Drop to Music.",
  href: "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=abc",
  image_url: null,
  meta: {
    source: "forum_room_studio",
    destinationType: "room",
    roomId: "music",
    authorName: "Board User",
  },
};

const hydrated = hydrateActivityAuthor(
  roomActivity,
  authorFromProfileRow({
    id: "user-1",
    username: "johnandy",
    display_name: "John Andy",
    avatar_url: "https://signed.example/avatar.jpg",
  })
);
assert(hydrated.meta?.authorName === "John Andy", "hydrated activity uses the profile name");
assert(hydrated.body === "John Andy added a Drop to Music.", "hydrated copy drops Board User");
assert(
  activityForumPath(hydrated) === "/board/forums/music",
  "room Drop activity path points at the Forum Room, not the media href"
);
assert(
  hydrated.href?.includes("board-media") === true,
  "media href stays on the Drop so the existing renderer can play it"
);

const conversationActivity = applyForumDropNavigation({
  ...roomActivity,
  title: "Added a Drop to JAB Comics",
  body: "John replied with a Drop in Comic Character Design in JAB Comics.",
  meta: {
    source: "forum_room_studio",
    destinationType: "room_conversation",
    roomId: "jab-comics",
    conversationId: "com1",
    conversationTitle: "Comic Character Design",
    authorName: "John",
  },
});
assert(
  activityForumPath(conversationActivity) === "/board/forums/jab-comics?conversation=com1",
  "conversation Drop activity href/path points at forum room+conversation"
);
assert(
  conversationActivity.meta?.forumHref === "/board/forums/jab-comics?conversation=com1",
  "conversation navigation is stored on the activity meta"
);

const shareActivity = activityFromRoomShare({
  id: "share_convo",
  roomId: "jab-comics",
  dropId: "drop_scene",
  sharedBy: "user-1",
  sharedByName: "John",
  snapshot: {
    title: "Night Tape",
    type: "Music",
    conversationTitle: "Comic Character Design",
    authorAvatar: "https://signed.example/john.jpg",
  },
  createdAt: new Date().toISOString(),
  origin: "conversation",
  conversationId: "com1",
});
assert(
  activityForumPath(shareActivity!) === "/board/forums/jab-comics?conversation=com1",
  "conversation share renderer points at the originating conversation"
);
assert(
  shareActivity?.meta?.authorAvatar === "https://signed.example/john.jpg",
  "avatar URL is passed through the existing Drop renderer"
);

const presence = presenceFromApiRow(
  {
    user_id: "user-2",
    username: "maya",
    display_name: "Maya",
    avatar_url: "https://signed.example/maya.jpg",
    last_seen_at: "2026-09-21T12:00:00.000Z",
  },
  "music"
);
assert(presence?.displayName === "Maya", "presence uses the Board profile name");
assert(
  presence?.avatarUrl === "https://signed.example/maya.jpg",
  "avatar URL is passed to Forums presence UI"
);
assert(
  presenceFromApiRow({ user_id: "user-3", display_name: "Board User", username: "rina" }, "lobby")
    ?.displayName === "rina",
  "presence does not keep Board User when a username exists"
);

console.log("boardAuthor.check.ts: ok");
