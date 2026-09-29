import assert from "node:assert/strict";
import { retrieveVisionaryKnowledge } from "./knowledge";
import type { VisionaryKnowledgeDocument, VisionaryMessage } from "./types";

const forumDocument: VisionaryKnowledgeDocument = {
  id: "forum_thread_test",
  title: "💥 JAB Comics: Persephone",
  category: "forums",
  visibility: "public",
  summary: "Persephone is a character introduced in JAB Comics lore.",
  facts: ["Persephone is a character introduced in JAB Comics lore."],
  keywords: ["JAB Comics", "Persephone"],
  sources: [{ title: "JAB Comics Forum", path: "/board/forums/jab-comics" }],
};

function ask(content: string): VisionaryMessage[] {
  return [{ role: "user", content }];
}

// A query naming a forum-only character should surface the dynamic document.
const persephoneRetrieval = retrieveVisionaryKnowledge(ask("who is Persephone in JAB Comics?"), {
  extraDocuments: [forumDocument],
});
assert.ok(
  persephoneRetrieval.documents.some((doc) => doc.id === forumDocument.id),
  "expected forum document to be retrieved for a matching query"
);
assert.notEqual(persephoneRetrieval.confidence, "unknown");

// Without the forum document supplied, static-only knowledge should not invent it.
const withoutForum = retrieveVisionaryKnowledge(ask("who is Persephone in JAB Comics?"));
assert.ok(
  !withoutForum.documents.some((doc) => doc.id === forumDocument.id),
  "forum document should not appear unless explicitly supplied"
);

// Unrelated queries should still behave as before (no forum doc leaking in).
const unrelated = retrieveVisionaryKnowledge(ask("what is Those Ryderz?"), {
  extraDocuments: [forumDocument],
});
assert.ok(
  !unrelated.documents.some((doc) => doc.id === forumDocument.id),
  "forum document should not be pulled in for unrelated queries"
);

console.log("knowledge.check.ts: ok");
