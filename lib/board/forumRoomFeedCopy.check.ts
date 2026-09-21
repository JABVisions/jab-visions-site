import {
  applyForumRoomFeedCopy,
  copyFromDropDestination,
  forumRoomDisplayName,
  forumRoomDropItemTitle,
  forumRoomFeedCopy,
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

const untouched = applyForumRoomFeedCopy({
  title: "Night Tape",
  body: "A cut from this week.",
  meta: { source: "drop_studio", destinationType: "feed" },
});
assert(untouched === null, "normal Feed Publish is unchanged");

console.log("forumRoomFeedCopy.check.ts: ok");
