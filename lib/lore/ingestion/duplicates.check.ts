// File: lib/lore/ingestion/duplicates.check.ts
// Exercises the pure name/alias/keyword scoring logic without touching a
// live Supabase client. Run with: npx tsx lib/lore/ingestion/duplicates.check.ts

import assert from "node:assert/strict";
import { matchCandidateAgainstEntry } from "./duplicates";

// Exact title match wins with high confidence.
assert.deepEqual(
  matchCandidateAgainstEntry({ title: "Leo Montana", aliases: [] }, { title: "Leo Montana", project_id: null }),
  { reason: "exact_title", confidence: 0.95 }
);

// Case-insensitive exact match still counts as exact.
assert.deepEqual(
  matchCandidateAgainstEntry({ title: "leo montana", aliases: [] }, { title: "Leo Montana", project_id: null }),
  { reason: "exact_title", confidence: 0.95 }
);

// Alias on either side counts as an alias match.
assert.deepEqual(
  matchCandidateAgainstEntry({ title: "Big Leo", aliases: ["Leo Montana"] }, { title: "Leo Montana", project_id: null }),
  { reason: "alias", confidence: 0.85 }
);
assert.deepEqual(
  matchCandidateAgainstEntry({ title: "Leo Montana", aliases: [] }, { title: "Big Leo", project_id: null, aliases: ["Leo Montana"] }),
  { reason: "alias", confidence: 0.85 }
);

// Substring/keyword match when neither exact nor alias hits.
assert.deepEqual(
  matchCandidateAgainstEntry({ title: "Montana", aliases: [] }, { title: "Leo Montana", project_id: null }),
  { reason: "keyword", confidence: 0.6 }
);

// Completely unrelated names never match.
assert.equal(matchCandidateAgainstEntry({ title: "Aaron Addams", aliases: [] }, { title: "Rubi Wong", project_id: null }), null);

// Same-project match gets a small confidence boost, capped at 1.
assert.deepEqual(
  matchCandidateAgainstEntry(
    { title: "Leo Montana", aliases: [], projectId: "proj-1" },
    { title: "Leo Montana", project_id: "proj-1" }
  ),
  { reason: "exact_title", confidence: 1 }
);

// Different-project match does not get the boost.
assert.deepEqual(
  matchCandidateAgainstEntry(
    { title: "Leo Montana", aliases: [], projectId: "proj-1" },
    { title: "Leo Montana", project_id: "proj-2" }
  ),
  { reason: "exact_title", confidence: 0.95 }
);

console.log("duplicates.check.ts: ok");
