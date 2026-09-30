import assert from "node:assert/strict";
import { chunkSourceText } from "./chunking";

// Short text stays as a single chunk.
assert.deepEqual(chunkSourceText("  "), []);
assert.equal(chunkSourceText("A short paragraph.").length, 1);

// Long text is split into multiple chunks, each within the size cap (with
// slack for the overlap prefix), and every paragraph's content survives.
const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}: ${"lore ".repeat(80)}`);
const longText = paragraphs.join("\n\n");
const chunks = chunkSourceText(longText);
assert.ok(chunks.length > 1, "expected multiple chunks for long text");
for (const chunk of chunks) {
  assert.ok(chunk.length <= 6_000 * 1.2, `chunk exceeded size cap: ${chunk.length}`);
}
assert.ok(chunks[0].includes("Paragraph 0"));
assert.ok(chunks.join(" ").includes(`Paragraph ${paragraphs.length - 1}`));

// Overlap: the tail of one chunk should reappear at the start of the next,
// so an entity mentioned right at a boundary isn't lost from context.
if (chunks.length > 1) {
  const tailOfFirst = chunks[0].slice(-200);
  assert.ok(chunks[1].includes(tailOfFirst.slice(-50)), "expected overlap between consecutive chunks");
}

// A single giant unbroken run of text (no paragraph/sentence breaks) still
// gets hard-sliced rather than sent as one oversized request.
const noPunctuation = "lore".repeat(4000);
const hardChunks = chunkSourceText(noPunctuation);
assert.ok(hardChunks.length > 1);
for (const chunk of hardChunks) assert.ok(chunk.length <= 6_000);

console.log("chunking.check.ts: ok");
