// File: lib/lore/ingestion/conflicts.ts
// Flags possible CANON CONFLICTs (spec section 11) between a newly extracted
// candidate and an existing CANON/SECRET_CANON entry it may be a duplicate
// of. This never decides which version is correct — it only surfaces both
// pieces of information so a creator can choose KEEP EXISTING / REPLACE /
// SAVE AS DRAFT / MARK AS RETCON / NEEDS REVIEW.
//
// When the AI comparison call itself is unavailable (no API key, network
// failure), the SAFE default is to flag a conflict anyway with a note asking
// for manual review — matching an existing CANON entry is exactly the case
// that must never be silently auto-approved.

import type { LoreEntry } from "../types";
import type { MergedEntryCandidate } from "./normalize";

export type ConflictCheckResult = { conflictDetected: boolean; notes: string };

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text!.trim())
    .join("\n\n");
}

const CONFLICT_PROMPT = `
You compare NEW proposed lore text against EXISTING canon lore text for the
same entity in the JAB Visions universe. You do not decide which is correct.
You only report whether the new text appears to directly contradict a
specific factual claim in the existing text (e.g. a different birthplace,
a different stated allegiance, a power described differently in a way that
can't both be true) versus simply adding new, non-contradictory information.

Respond with ONLY this JSON object:
{ "contradicts": boolean, "explanation": string }

"explanation" must be one or two plain sentences naming the specific claims
that conflict, or state briefly why nothing conflicts. Do not invent facts
that are not present in either text.
`.trim();

/**
 * Compares a merged extraction candidate against the existing entry it was
 * matched to. Only meaningful when the existing entry is CANON or
 * SECRET_CANON — callers should skip this entirely for DRAFT/CONCEPT matches,
 * since those are already understood to be in flux.
 */
export async function checkForConflict(
  candidate: Pick<MergedEntryCandidate, "summary" | "content" | "details">,
  existing: Pick<LoreEntry, "summary" | "content">
): Promise<ConflictCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const existingText = [existing.summary, existing.content].filter(Boolean).join("\n");
  const newText = [candidate.summary, candidate.content, candidate.details].filter(Boolean).join("\n");

  if (!apiKey || !existingText.trim() || !newText.trim()) {
    return {
      conflictDetected: true,
      notes: "Automatic contradiction check unavailable — this proposal matches an existing CANON entry. Please compare manually before approving.",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_LORE_EXTRACTION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
        instructions: CONFLICT_PROMPT,
        input: [
          {
            role: "user",
            content: `EXISTING CANON:\n${existingText}\n\nNEW PROPOSED TEXT:\n${newText}`,
          },
        ],
        max_output_tokens: 400,
        store: false,
        text: { format: { type: "json_object" } },
        tools: [],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload;
    if (!response.ok) throw new Error("conflict check request failed");

    const text = extractOutputText(payload);
    const parsed = JSON.parse(text) as { contradicts?: unknown; explanation?: unknown };
    const contradicts = typeof parsed.contradicts === "boolean" ? parsed.contradicts : true;
    const explanation =
      typeof parsed.explanation === "string" && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : "Possible conflict with existing canon — please compare manually.";
    return { conflictDetected: contradicts, notes: explanation };
  } catch {
    return {
      conflictDetected: true,
      notes: "Automatic contradiction check failed — this proposal matches an existing CANON entry. Please compare manually before approving.",
    };
  }
}
