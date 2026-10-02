import {
  formatForumRoomContext,
  forumContextDocument,
  forumContextHasUsefulFacts,
  forumRoomContextFromCatalog,
  mentionRoomIdFromQuery,
} from "./forumContext";
import { buildVisionarySystemPrompt } from "./server/systemPrompt";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(mentionRoomIdFromQuery("what's happening in Music?") === "music", "mentions resolve Music");
assert(mentionRoomIdFromQuery("Ask about Those Ryderz auditions") === "those-ryderz", "mentions resolve Those Ryderz");
assert(mentionRoomIdFromQuery("what is a sandwich") === null, "unrelated questions do not attach a Room");

const music = forumRoomContextFromCatalog("music", {
  conversations: [
    { title: "Beat drop night", body: "Bring instrumentals.", replies: [{ body: "I'll post a loop." }] },
  ],
  shares: [
    { title: "Night Tape", body: "Demo verse", type: "Music", visibility: "public" },
    { title: "Secret sides", body: "private sides", type: "Doc", visibility: "private" },
  ],
});
assert(music?.roomName === "Music", "catalog context names Music");
assert(music?.shares.length === 1, "private shared Drops are stripped from Visionary context");
assert(music?.shares[0].title === "Night Tape", "public share titles stay");
assert(forumContextHasUsefulFacts(music) === true, "Music context is usable");

const formatted = formatForumRoomContext(music!);
assert(/FORUM ROOM: Music/.test(formatted), "formatted context names the Room");
assert(/Night Tape/.test(formatted), "formatted context includes public Drop titles");
assert(!/Secret sides/.test(formatted), "formatted context omits private Drop titles");
assert(/Beat drop night/.test(formatted), "formatted context includes conversations");

const prompt = buildVisionarySystemPrompt(
  {
    documents: [forumContextDocument(music!)],
    confidence: "partial",
    latestQuery: "what's in the Music room?",
    contextQuery: "",
  },
  music
);
assert(/FORUM ROOM CONTEXT/.test(prompt), "Visionary prompt includes room context when roomId is present");
assert(/Music/.test(prompt), "Visionary prompt names the Forum Room");
assert(/Night Tape/.test(prompt), "Visionary prompt can cite public shared Drop titles");

console.log("forumContext.check.ts: ok");
