import {
  applyForumRoomFeedCopy,
  copyFromDropDestination,
  forumRoomDisplayName,
  forumRoomDropItemTitle,
  forumRoomFeedCopy,
  isStudioCreatedForumDrop,
  keepOriginalForumFeedTitle,
  looksLikeMediaFileName,
} from "./forumRoomFeedCopy";
import type { DropDestination } from "./dropDestination";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(looksLikeMediaFileName("IMG_1234.MOV") === true, "iPhone movie name is a filename");
assert(looksLikeMediaFileName("IMG_1234") === true, "iPhone stem without extension is a filename");
assert(looksLikeMediaFileName("audio.m4a") === true, "audio.m4a is a filename");
assert(looksLikeMediaFileName("audio") === true, "bare audio is a filename");
assert(looksLikeMediaFileName("Night Tape") === false, "human titles are not filenames");
assert(looksLikeMediaFileName("Screenplay excerpt") === false, "writing titles are not filenames");

const musicRoom: DropDestination = {
  type: "room",
  roomId: "music",
  roomName: "Music",
  roomIcon: "🎧",
};
const comicsConversation: DropDestination = {
  type: "room_conversation",
  roomId: "jab-comics",
  conversationId: "com1",
  roomName: "JAB Comics",
  conversationTitle: "Comic Character Design",
};
const feed: DropDestination = { type: "feed" };

const roomCopy = copyFromDropDestination(musicRoom);
assert(roomCopy?.title === "Added a Drop to Music", "room feed headline names Music");
assert(roomCopy?.title.includes("IMG_") === false, "room feed headline does not use a filename");
assert(roomCopy?.body === "Shared a Drop in 🎧 Music.", "room feed body names the Forum Room");
assert(
  copyFromDropDestination(musicRoom, { actorName: "John Andy" })?.body ===
    "John Andy added a Drop to 🎧 Music.",
  "room activity voice includes the author"
);

const conversationCopy = copyFromDropDestination(comicsConversation);
assert(conversationCopy?.title === "Added a Drop to JAB Comics", "conversation headline names the Forum Room");
assert(
  conversationCopy?.body === "Replied with a Drop in Comic Character Design in JAB Comics.",
  "conversation copy names the thread and the Forum Room"
);
assert(copyFromDropDestination(feed) === null, "feed-only publish does not rewrite to a Room");

assert(forumRoomDropItemTitle({ roomId: "music" }) === "Drop in Music", "stored drop title names the room");
assert(forumRoomDropItemTitle({ roomId: "music" }) !== "IMG_1234", "stored drop title is not the file stem");

assert(
  forumRoomDisplayName({ roomId: "those-ryderz", roomName: "THAT RYDERZ" }).name === "Those Ryderz",
  "Those Ryderz catalog name wins over THAT RYDERZ"
);
assert(
  forumRoomFeedCopy({ kind: "room", roomId: "those-ryderz" }).title === "Added a Drop to Those Ryderz",
  "Those Ryderz feed copy uses title case"
);

const rewritten = applyForumRoomFeedCopy({
  title: "IMG_1234.MOV",
  body: "New Vision Drop added to Board.",
  meta: { source: "forum_room_studio", destinationType: "room", roomId: "jab-lit", authorName: "John Andy" },
});
assert(rewritten?.title === "Added a Drop to JAB LIT", "display rewrite replaces filename with JAB LIT");
assert(rewritten?.body === "John Andy added a Drop to 📚 JAB LIT.", "display rewrite body names the author and JAB LIT");
assert(rewritten?.title.includes("IMG_") === false, "display rewrite does not keep the filename");

const placeholder = applyForumRoomFeedCopy({
  title: "Added a Drop to Music",
  body: "Board User added a Drop to Music.",
  meta: {
    source: "forum_room_studio",
    destinationType: "room",
    roomId: "music",
    authorName: "John Andy",
  },
});
assert(
  placeholder?.body === "John Andy added a Drop to 🎧 Music.",
  "Board User feed copy is replaced with the profile name"
);

const untouched = applyForumRoomFeedCopy({
  title: "Night Tape",
  body: "A cut from this week.",
  meta: { source: "drop_studio", destinationType: "feed" },
});
assert(untouched === null, "normal Feed Publish is unchanged");

const thoseRyderzFeed = applyForumRoomFeedCopy({
  title: "Those Ryderz",
  body: "Feature Film Casting",
  meta: { source: "drop_studio", destinationType: "feed" },
});
assert(thoseRyderzFeed === null, "Those Ryderz feed publish keeps its original title");

assert(
  isStudioCreatedForumDrop({
    source: "forum_room_studio",
    destinationType: "room",
    origin: "create",
    roomId: "music",
  }) === true,
  "studio create into a Room uses forum attribution"
);
assert(
  isStudioCreatedForumDrop({
    source: "forum_room_studio",
    destinationType: "room_conversation",
    origin: "conversation",
    roomId: "jab-comics",
  }) === true,
  "studio create into a conversation uses forum attribution"
);
assert(
  isStudioCreatedForumDrop({
    source: "forum_room_share",
    destinationType: "room",
    origin: "share",
    roomId: "music",
    fromDescript: true,
  }) === false,
  "sharing an existing Drop is not a studio Room create"
);

const descriptShare = applyForumRoomFeedCopy({
  title: "Audition sides — Ryder",
  body: "Cold read for the diner scene.",
  meta: {
    source: "forum_room_share",
    destinationType: "room",
    origin: "share",
    roomId: "those-ryderz",
    fromDescript: true,
  },
});
assert(descriptShare === null, "Descript Drops shared into Forums keep title and subtitle");
assert(
  keepOriginalForumFeedTitle({
    title: "Audition sides — Ryder",
    body: "Cold read for the diner scene.",
    meta: { origin: "share", destinationType: "room", fromDescript: true },
  }) === true,
  "Descript share keeps original title"
);

const dropbookShare = applyForumRoomFeedCopy({
  title: "Those Ryderz lookbook",
  body: "Cover + interior slides.",
  meta: {
    source: "forum_room_share",
    destinationType: "room",
    origin: "share",
    roomId: "jab-lit",
    fromDropbook: true,
  },
});
assert(dropbookShare === null, "Dropbook Drops shared into Forums keep title and subtitle");

const titledStudio = applyForumRoomFeedCopy({
  title: "Night Tape",
  body: "A cut from this week.",
  meta: {
    source: "forum_room_studio",
    destinationType: "room",
    origin: "create",
    roomId: "music",
  },
});
assert(titledStudio === null, "studio Room Drops that already had a title keep it");

const studioUntitled = applyForumRoomFeedCopy({
  title: "IMG_1234.MOV",
  body: "New Vision Drop added to Board.",
  meta: {
    source: "forum_room_studio",
    destinationType: "room",
    origin: "create",
    roomId: "music",
    authorName: "John Andy",
  },
});
assert(
  studioUntitled?.title === "Added a Drop to Music",
  "untitled studio Room creates still use Added a Drop to [Room]"
);

const studioConversation = applyForumRoomFeedCopy({
  title: "audio.m4a",
  body: "New Music Drop added to Board.",
  meta: {
    source: "forum_room_studio",
    destinationType: "room_conversation",
    origin: "conversation",
    roomId: "jab-comics",
    conversationTitle: "Comic Character Design",
    authorName: "John",
  },
});
assert(
  studioConversation?.title === "Added a Drop to JAB Comics",
  "untitled studio conversation creates use forum attribution"
);
assert(
  studioConversation?.body === "John replied with a Drop in Comic Character Design in JAB Comics.",
  "untitled studio conversation body names the thread"
);

console.log("forumRoomFeedCopy.check.ts: ok");
