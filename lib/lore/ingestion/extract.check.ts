import assert from "node:assert/strict";
import { validateExtractionResult } from "./extract";

// Completely malformed input never throws — it degrades to empty arrays.
assert.deepEqual(validateExtractionResult(null), { entries: [], relationships: [], timelineFacts: [] });
assert.deepEqual(validateExtractionResult("not an object"), { entries: [], relationships: [], timelineFacts: [] });
assert.deepEqual(validateExtractionResult({}), { entries: [], relationships: [], timelineFacts: [] });

// A well-formed response round-trips cleanly, using clearly fictional test
// fixtures (never real JAB Visions lore) per the ingestion spec's testing rule.
const wellFormed = {
  entries: [
    {
      title: "Test Hero Alpha",
      aliases: ["Alpha"],
      entryType: "character",
      summary: "A fictional test character for validation only.",
      confidence: "high",
    },
  ],
  relationships: [
    {
      sourceTitle: "Test Hero Alpha",
      targetTitle: "Test Hero Beta",
      relationshipType: "RIVALRY",
      confidence: "medium",
    },
  ],
  timelineFacts: [{ description: "Test Event A occurs before Test Event B.", confidence: "low" }],
};
const validated = validateExtractionResult(wellFormed);
assert.equal(validated.entries.length, 1);
assert.equal(validated.entries[0].title, "Test Hero Alpha");
assert.equal(validated.relationships.length, 1);
assert.equal(validated.timelineFacts.length, 1);

// Entries missing a required field (no summary) are dropped, not guessed at —
// this is the "never invent missing lore" boundary enforced in code.
const partiallyMalformed = {
  entries: [
    { title: "Missing Summary", entryType: "character" }, // no summary -> dropped
    { title: "Complete Entry", entryType: "location", summary: "A place that exists in the text." },
  ],
  relationships: [
    { sourceTitle: "Only Source", targetTitle: "", relationshipType: "MEMBER_OF" }, // blank target -> dropped
  ],
  timelineFacts: "not-an-array", // wrong type entirely -> ignored, not crashed on
};
const validatedPartial = validateExtractionResult(partiallyMalformed);
assert.equal(validatedPartial.entries.length, 1);
assert.equal(validatedPartial.entries[0].title, "Complete Entry");
assert.equal(validatedPartial.relationships.length, 0);
assert.equal(validatedPartial.timelineFacts.length, 0);

// Unknown confidence values fall back to "low" rather than being trusted blindly.
const unknownConfidence = validateExtractionResult({
  entries: [{ title: "T", entryType: "character", summary: "S", confidence: "extremely-sure" }],
});
assert.equal(unknownConfidence.entries[0].confidence, "low");

console.log("extract.check.ts: ok");
