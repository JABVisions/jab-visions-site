// File: lib/lore/ingestion/conflicts.check.ts
// Exercises the safe-default behavior of checkForConflict when the AI
// comparison call is unavailable — a matched CANON entry must never be
// silently cleared of a possible conflict just because infrastructure failed.
// Run with: npx tsx lib/lore/ingestion/conflicts.check.ts

import assert from "node:assert/strict";

delete process.env.OPENAI_API_KEY;

async function main() {
  const { checkForConflict } = await import("./conflicts");

  // No API key configured -> safe default: flag as a conflict needing manual review.
  const noKeyResult = await checkForConflict(
    { summary: "New summary", content: undefined, details: undefined },
    { summary: "Existing summary", content: null }
  );
  assert.equal(noKeyResult.conflictDetected, true);
  assert.match(noKeyResult.notes, /manual|review/i);

  // Empty text on either side also safe-defaults to flagged.
  process.env.OPENAI_API_KEY = "sk-test-placeholder";
  const emptyTextResult = await checkForConflict(
    { summary: "", content: undefined, details: undefined },
    { summary: "", content: null }
  );
  assert.equal(emptyTextResult.conflictDetected, true);

  console.log("conflicts.check.ts: ok");
}

main();
