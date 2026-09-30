import assert from "node:assert/strict";
import { normalizeExtractions } from "./normalize";
import type { RawExtractionResult } from "./types";

const chunk0: RawExtractionResult = {
  entries: [
    {
      title: "Test Hero Alpha",
      entryType: "character",
      summary: "Short summary from chunk 0.",
      confidence: "medium",
      aliases: ["Alpha"],
    },
  ],
  relationships: [],
  timelineFacts: [{ description: "Test Event A occurs before Test Event B.", confidence: "low" }],
};

// Same character mentioned again in a later chunk, with a longer summary and
// higher confidence, plus a new alias — should merge into ONE candidate.
const chunk1: RawExtractionResult = {
  entries: [
    {
      title: "test hero alpha", // case-different but same entity
      entryType: "character",
      summary: "A much longer and more detailed summary discovered later in the document.",
      confidence: "high",
      aliases: ["The Alpha"],
    },
  ],
  relationships: [
    { sourceTitle: "Test Hero Alpha", targetTitle: "Test Hero Beta", relationshipType: "RIVALRY", confidence: "medium" },
  ],
  timelineFacts: [{ description: "Test Event A occurs before Test Event B.", confidence: "high" }], // exact dup
};

const merged = normalizeExtractions([
  { chunkIndex: 0, result: chunk0 },
  { chunkIndex: 1, result: chunk1 },
]);

assert.equal(merged.entries.length, 1, "expected the two chunk mentions to merge into one entry candidate");
const heroAlpha = merged.entries[0];
assert.equal(heroAlpha.confidence, "high", "expected the higher confidence to win");
assert.ok(heroAlpha.summary.includes("much longer"), "expected the longer summary to win");
assert.deepEqual(new Set(heroAlpha.aliases), new Set(["Alpha", "The Alpha"]), "expected aliases to union");
assert.deepEqual(heroAlpha.chunkIndexes, [0, 1]);

assert.equal(merged.relationships.length, 1);
assert.equal(merged.relationships[0].relationshipType, "RIVALRY");

// Exact duplicate timeline fact across chunks collapses to one, keeping the
// higher confidence seen.
assert.equal(merged.timelineFacts.length, 1);
assert.equal(merged.timelineFacts[0].confidence, "high");
assert.deepEqual(merged.timelineFacts[0].chunkIndexes, [0, 1]);

// A same-named entity but a DIFFERENT entry type is kept separate rather than
// silently merged (e.g. a location named after a character).
const distinctType: RawExtractionResult = {
  entries: [{ title: "Test Hero Alpha", entryType: "location", summary: "A place, not the character.", confidence: "low" }],
  relationships: [],
  timelineFacts: [],
};
const mergedWithDistinct = normalizeExtractions([
  { chunkIndex: 0, result: chunk0 },
  { chunkIndex: 1, result: distinctType },
]);
assert.equal(mergedWithDistinct.entries.length, 2);

console.log("normalize.check.ts: ok");
