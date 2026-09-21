import {
  ALL_FORUM_STUDIO_MODES,
  dropDestinationBadge,
  dropDestinationKey,
  dropPublishLabel,
  isForumRoomDestination,
  isProjectRoomDestination,
  suggestedStudioModeForRoom,
  type DropDestination,
} from "./dropDestination";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const feed: DropDestination = { type: "feed" };
const profile: DropDestination = { type: "profile" };
const room: DropDestination = { type: "room", roomId: "music", roomName: "Music", roomIcon: "🎧" };
const conversation: DropDestination = {
  type: "room_conversation",
  roomId: "jab-comics",
  conversationId: "com1",
  conversationTitle: "Comic Character Design",
};
const project: DropDestination = { type: "project_room", projectId: "proj_1", projectTitle: "Those Ryderz" };

assert(dropPublishLabel(feed) === "Publish", "feed publish label stays Publish");
assert(dropPublishLabel(profile) === "Publish", "profile publish label stays Publish");
assert(dropPublishLabel(room) === "Post to Room", "room publish label is Post to Room");
assert(dropPublishLabel(conversation) === "Reply with Drop", "conversation publish label is Reply with Drop");
assert(dropDestinationBadge(room)?.prefix === "Creating for", "room badge prefix");
assert(dropDestinationBadge(room)?.label.includes("Music") === true, "room badge names Music");
assert(dropDestinationBadge(conversation)?.prefix === "Replying in", "conversation badge prefix");
assert(
  dropDestinationBadge(conversation)?.label === "Comic Character Design",
  "conversation badge uses the thread title"
);
assert(dropDestinationBadge(feed) === null, "feed has no destination badge");
assert(isForumRoomDestination(room) === true, "room is a forum destination");
assert(isForumRoomDestination(conversation) === true, "conversation is a forum destination");
assert(isForumRoomDestination(feed) === false, "feed is not a forum destination");
assert(isForumRoomDestination(project) === false, "project room is not a forum destination");
assert(isProjectRoomDestination(project) === true, "project room stays a Work Board destination");
assert(dropDestinationKey(room) !== dropDestinationKey(project), "forum room and project room keys do not collide");
assert(dropDestinationKey(room) !== dropDestinationKey(conversation), "room vs conversation keys stay distinct");
assert(suggestedStudioModeForRoom("music") === "audio", "Music suggests Voice");
assert(suggestedStudioModeForRoom("jab-comics") === "art", "Comics suggests Art");
assert(suggestedStudioModeForRoom("jab-lit") === "descript", "LIT suggests Descript");
assert(suggestedStudioModeForRoom("lobby") === "photo", "other rooms default to Vision");
assert(ALL_FORUM_STUDIO_MODES.includes("audio"), "Voice stays available");
assert(ALL_FORUM_STUDIO_MODES.includes("descript"), "Descript stays available");
assert(ALL_FORUM_STUDIO_MODES.includes("art"), "Art stays available");
assert(ALL_FORUM_STUDIO_MODES.includes("video"), "Video stays available");

console.log("dropDestination.check.ts: ok");
