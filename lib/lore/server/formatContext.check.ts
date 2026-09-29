import assert from "node:assert/strict";
import { formatLoreContext } from "./formatContext";
import type { LoreEntryBundle, LoreRetrieval } from "../types";

function entry(overrides: Partial<LoreEntryBundle["entry"]> = {}): LoreEntryBundle["entry"] {
  return {
    id: "entry-1",
    project_id: "project-1",
    title: "Leo Montana",
    slug: "leo-montana",
    entry_type: "character",
    summary: "Founder and leader of Those Ryderz.",
    content: null,
    canon_status: "CANON",
    spoiler_level: "none",
    timeline_position: null,
    metadata: {},
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// Empty retrieval renders nothing — callers should skip appending it entirely.
assert.equal(formatLoreContext({ entries: [], hasCanonMatch: false }), "");

const bundle: LoreEntryBundle = {
  entry: entry(),
  project: {
    id: "project-1",
    slug: "those-ryderz",
    title: "Those Ryderz",
    description: null,
    universe: "JAB Visions",
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  related: [
    {
      entry: entry({ id: "entry-2", title: "Aaron Addams" }),
      relationshipType: "DATING",
      description: null,
      direction: "outgoing",
    },
  ],
  sources: [
    {
      id: "source-1",
      entry_id: "entry-1",
      source_type: "character_biography",
      source_title: "Those Ryderz Character Bible",
      source_ref: null,
      notes: null,
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
  matchReason: "exact_title",
  score: 100,
};

const retrieval: LoreRetrieval = { entries: [bundle], hasCanonMatch: true };
const rendered = formatLoreContext(retrieval);

// Structured section headers from spec section 9 are all present.
for (const heading of ["PROJECT:", "ENTITY:", "TYPE:", "CANON STATUS:", "SUMMARY:", "RELATED ENTITIES:", "SOURCE:"]) {
  assert.ok(rendered.includes(heading), `missing heading ${heading}`);
}
assert.ok(rendered.includes("Those Ryderz"));
assert.ok(rendered.includes("Leo Montana"));
assert.ok(rendered.includes("Aaron Addams — Dating"));
assert.ok(rendered.includes("Those Ryderz Character Bible"));

// Anti-hallucination guardrail text is always present when lore was found.
assert.ok(rendered.toLowerCase().includes("hasn't been established"));

// SECRET_CANON entries must never be labeled as secret in the rendered text,
// even though their facts are used naturally.
const secretBundle: LoreEntryBundle = {
  ...bundle,
  entry: entry({ id: "entry-3", canon_status: "SECRET_CANON" }),
  related: [],
  sources: [],
};
const secretRendered = formatLoreContext({ entries: [secretBundle], hasCanonMatch: false });
assert.ok(secretRendered.includes("SECRET_CANON")); // the model sees the status internally...
assert.ok(secretRendered.toLowerCase().includes("never call out its status")); // ...but is told not to expose it

console.log("formatContext.check.ts: ok");
