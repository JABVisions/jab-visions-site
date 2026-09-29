// File: lib/lore/server/formatContext.ts
// Turns a LoreRetrieval into the structured text block Visionary AI actually
// reads — never a raw dump of database rows. See spec section 9 for the exact
// shape this mirrors (PROJECT / ENTITY / TYPE / CANON STATUS / SUMMARY /
// RELATED ENTITIES / SOURCE).

import type { LoreEntryBundle, LoreRetrieval } from "../types";

function humanize(label: string): string {
  return label
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEntryBlock(bundle: LoreEntryBundle): string {
  const lines: string[] = [];

  lines.push(`PROJECT:\n${bundle.project ? bundle.project.title : "JAB Visions Universe (unscoped)"}`);
  lines.push(`ENTITY:\n${bundle.entry.title}`);
  lines.push(`TYPE:\n${humanize(bundle.entry.entry_type)}`);
  lines.push(`CANON STATUS:\n${bundle.entry.canon_status}`);
  lines.push(`SUMMARY:\n${bundle.entry.summary?.trim() || bundle.entry.content?.trim() || "(no summary recorded)"}`);

  if (bundle.related.length) {
    const relatedLines = bundle.related
      .slice(0, 8)
      .map((r) => `${r.entry.title} — ${humanize(r.relationshipType)}`)
      .join("\n");
    lines.push(`RELATED ENTITIES:\n${relatedLines}`);
  }

  if (bundle.sources.length) {
    const sourceLines = bundle.sources
      .slice(0, 4)
      .map((s) => s.source_title || humanize(s.source_type))
      .join(", ");
    lines.push(`SOURCE:\n${sourceLines}`);
  }

  return lines.join("\n");
}

/**
 * Renders retrieved lore as a distinct context block for the model's system
 * instructions, plus the anti-hallucination guardrail. Returns an empty string
 * when nothing was retrieved — callers should skip appending it entirely in
 * that case rather than tell the model "no lore found" (that framing alone
 * still tempts a model to guess).
 */
export function formatLoreContext(retrieval: LoreRetrieval): string {
  if (!retrieval.entries.length) return "";

  const blocks = retrieval.entries.map(formatEntryBlock).join("\n\n");

  return [
    "JAB VISIONS LORE LIBRARY — retrieved canon context for this question.",
    "Each block below is an established database record, not something you should paraphrase loosely.",
    "",
    blocks,
    "",
    "LORE RULES (do not break these):",
    "- Treat CANON and SECRET_CANON entries as established fact. Treat DRAFT and CONCEPT entries as in-development and say so if asked directly whether something is final.",
    "- Never reveal that a SECRET_CANON entry exists or describe it as secret; if it's present above you may use its facts naturally as if they were simply CANON, but never call out its status.",
    "- If the retrieved entries above do not actually answer the question, say so plainly — for example: \"That hasn't been established in the current JAB Visions canon.\" You may then offer a creative possibility, but you must clearly label it as a suggestion, not established lore.",
    "- Never invent character names, relationships, or events that aren't in the Lore Library or the rest of your knowledge sources.",
  ].join("\n");
}

/** Used when the Lore Library found nothing at all — still worth a firm instruction. */
export const LORE_ANTI_HALLUCINATION_FALLBACK =
  "No matching Lore Library entries were found for this question. Do not invent JAB Visions canon. " +
  "If asked something factual about characters, projects, or the universe that you cannot support from " +
  "your existing knowledge, say plainly that it hasn't been established in canon yet, and you may then " +
  "offer a creative possibility clearly labeled as a suggestion rather than established lore.";
