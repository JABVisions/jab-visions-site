// File: lib/lore/ingestion/chunking.ts
// Splits large source text into logically sized, slightly overlapping chunks
// so a single document never has to fit in one model request (spec section
// 15). Prefers breaking on paragraph/scene boundaries over hard character
// cuts, so a character or scene description is rarely split mid-thought.

const MAX_CHUNK_CHARS = 6_000;
const OVERLAP_CHARS = 400;

/** Split on paragraph breaks first, falling back to sentences for one giant paragraph. */
function splitIntoUnits(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHUNK_CHARS) {
      units.push(paragraph);
      continue;
    }
    // One oversized paragraph (e.g. a wall-of-text pitch deck) — fall back to sentences.
    const sentences = paragraph.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [paragraph];
    units.push(...sentences.map((s) => s.trim()).filter(Boolean));
  }
  return units;
}

/**
 * Break raw text into chunks bounded by MAX_CHUNK_CHARS, each chunk ending
 * with a short overlap of the previous chunk's tail so an entity or fact
 * mentioned right at a chunk boundary doesn't lose context.
 */
export function chunkSourceText(rawText: string): string[] {
  const text = rawText.trim();
  if (!text) return [];
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const units = splitIntoUnits(text);
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      const overlap = current.slice(-OVERLAP_CHARS);
      current = `${overlap}\n\n${unit}`.trim();
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // A single oversized unit that still exceeds the cap (e.g. no punctuation
  // at all) gets a hard slice rather than being sent as one huge request.
  return chunks.flatMap((chunk) => {
    if (chunk.length <= MAX_CHUNK_CHARS * 1.2) return [chunk];
    const hardSlices: string[] = [];
    for (let i = 0; i < chunk.length; i += MAX_CHUNK_CHARS) {
      hardSlices.push(chunk.slice(i, i + MAX_CHUNK_CHARS));
    }
    return hardSlices;
  });
}
