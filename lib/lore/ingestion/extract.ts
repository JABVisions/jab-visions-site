// File: lib/lore/ingestion/extract.ts
// Structured lore extraction for one text chunk. Deliberately narrow: this
// module's only job is "turn this chunk of source text into typed candidate
// lore," never summarization and never inventing facts the source doesn't
// state (spec section 21 — absence of information is not permission to
// invent information). Every response is validated server-side; a malformed
// or unparsable model response degrades to an empty result rather than ever
// touching the Lore Library.

import type { ExtractionConfidence, RawExtractionResult } from "./types";

const EXTRACTION_SYSTEM_PROMPT = `
You are a lore-extraction engine for the JAB Visions Lore Library. You read one
chunk of raw creative source material (screenplay, treatment, character bible,
pitch deck, notes, comic script, etc.) and extract STRUCTURED CANDIDATE LORE.

CRITICAL RULES:
- You are proposing candidates for a human creator to review. You are not
  declaring canon. Never state anything as more certain than the source
  supports.
- ABSENCE OF INFORMATION IS NOT PERMISSION TO INVENT INFORMATION. If an origin,
  limitation, date, or relationship is not explicitly stated or strongly
  implied in the text, omit that field entirely rather than guessing.
- Do not invent names, aliases, relationships, powers, or events that are not
  present in the text.
- Extract, do not summarize the whole document — only pull out distinct
  characters, relationships, locations, events, powers/abilities,
  organizations, artifacts/objects, worldbuilding concepts, and explicit
  chronological facts (e.g. "X happens before Y").
- If nothing in this chunk qualifies, return empty arrays. Empty is correct
  and expected for a lot of chunks (dialogue-only scenes, transitions, etc.).
- confidence must be "high" only when the text is explicit and unambiguous,
  "medium" when reasonably inferable, "low" when speculative/thin.

Respond with ONLY a single JSON object shaped exactly like this (all arrays
may be empty, omit fields you have no basis for rather than inventing them):

{
  "entries": [
    {
      "title": string,
      "aliases": string[] (optional),
      "entryType": one of "character" | "location" | "event" | "organization" | "artifact" | "power" | "technology" | "concept" | "other",
      "summary": string (1-3 sentences),
      "content": string (optional, longer detail actually present in the text),
      "details": string (optional — abilities/affiliations/history actually stated),
      "projectHint": string (optional, only if the text names a project/world),
      "confidence": "high" | "medium" | "low",
      "sourceExcerpt": string (optional, a short supporting quote from the chunk)
    }
  ],
  "relationships": [
    {
      "sourceTitle": string,
      "targetTitle": string,
      "relationshipType": string (upper snake case, e.g. "DATING", "CHILD_OF", "MEMBER_OF", "WORKS_WITH", "RIVALRY", "ASSOCIATED_WITH"),
      "description": string (optional),
      "confidence": "high" | "medium" | "low",
      "sourceExcerpt": string (optional)
    }
  ],
  "timelineFacts": [
    {
      "description": string (a plain chronological fact, e.g. "X occurs before Y"),
      "relatedTitles": string[] (optional, entities/events this fact concerns),
      "confidence": "high" | "medium" | "low",
      "sourceExcerpt": string (optional)
    }
  ]
}
`.trim();

type OpenAIResponsePayload = {
  error?: { message?: string };
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Pull the first balanced {...} block out of arbitrary model text, tolerating stray prose around it. */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const CONFIDENCE_VALUES: ExtractionConfidence[] = ["high", "medium", "low"];
function asConfidence(value: unknown): ExtractionConfidence {
  return typeof value === "string" && (CONFIDENCE_VALUES as string[]).includes(value)
    ? (value as ExtractionConfidence)
    : "low";
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return cleaned.length ? cleaned : undefined;
}

/**
 * Validates and coerces a parsed JSON value into RawExtractionResult,
 * silently dropping any malformed individual item rather than failing the
 * whole chunk. This is the one hard boundary between "whatever the model
 * said" and anything that can become a proposal row.
 */
export function validateExtractionResult(parsed: unknown): RawExtractionResult {
  const result: RawExtractionResult = { entries: [], relationships: [], timelineFacts: [] };
  if (!parsed || typeof parsed !== "object") return result;
  const raw = parsed as Record<string, unknown>;

  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const title = asOptionalString(entry.title);
      const summary = asOptionalString(entry.summary);
      const entryType = asOptionalString(entry.entryType);
      if (!title || !summary || !entryType) continue; // required fields absent — skip, never guess
      result.entries.push({
        title,
        summary,
        entryType,
        aliases: asStringArray(entry.aliases),
        content: asOptionalString(entry.content),
        details: asOptionalString(entry.details),
        projectHint: asOptionalString(entry.projectHint),
        confidence: asConfidence(entry.confidence),
        sourceExcerpt: asOptionalString(entry.sourceExcerpt),
      });
    }
  }

  if (Array.isArray(raw.relationships)) {
    for (const item of raw.relationships) {
      if (!item || typeof item !== "object") continue;
      const rel = item as Record<string, unknown>;
      const sourceTitle = asOptionalString(rel.sourceTitle);
      const targetTitle = asOptionalString(rel.targetTitle);
      const relationshipType = asOptionalString(rel.relationshipType);
      if (!sourceTitle || !targetTitle || !relationshipType) continue;
      result.relationships.push({
        sourceTitle,
        targetTitle,
        relationshipType,
        description: asOptionalString(rel.description),
        confidence: asConfidence(rel.confidence),
        sourceExcerpt: asOptionalString(rel.sourceExcerpt),
      });
    }
  }

  if (Array.isArray(raw.timelineFacts)) {
    for (const item of raw.timelineFacts) {
      if (!item || typeof item !== "object") continue;
      const fact = item as Record<string, unknown>;
      const description = asOptionalString(fact.description);
      if (!description) continue;
      result.timelineFacts.push({
        description,
        relatedTitles: asStringArray(fact.relatedTitles),
        confidence: asConfidence(fact.confidence),
        sourceExcerpt: asOptionalString(fact.sourceExcerpt),
      });
    }
  }

  return result;
}

const EMPTY_RESULT: RawExtractionResult = { entries: [], relationships: [], timelineFacts: [] };

/**
 * Analyze one chunk of source text. Never throws — any failure (missing key,
 * network error, malformed JSON) degrades to an empty result so one bad
 * chunk never aborts an entire ingestion session.
 */
export async function extractLoreFromChunk(
  chunk: string,
  context: { sourceTitle: string; sourceType: string; projectHint?: string; chunkIndex: number; chunkCount: number }
): Promise<RawExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !chunk.trim()) return EMPTY_RESULT;

  const userPrompt = [
    `SOURCE TITLE: ${context.sourceTitle}`,
    `SOURCE TYPE: ${context.sourceType}`,
    context.projectHint ? `PROJECT HINT: ${context.projectHint}` : null,
    `CHUNK ${context.chunkIndex + 1} of ${context.chunkCount}`,
    "",
    "SOURCE TEXT CHUNK:",
    chunk,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_LORE_EXTRACTION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
        instructions: EXTRACTION_SYSTEM_PROMPT,
        input: [{ role: "user", content: userPrompt }],
        max_output_tokens: 3000,
        store: false,
        text: { format: { type: "json_object" } },
        tools: [],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload;
    if (!response.ok) return EMPTY_RESULT;

    const text = extractOutputText(payload);
    if (!text) return EMPTY_RESULT;

    const jsonBlock = extractJsonBlock(text) ?? text;
    const parsed = JSON.parse(jsonBlock);
    return validateExtractionResult(parsed);
  } catch {
    return EMPTY_RESULT;
  }
}
