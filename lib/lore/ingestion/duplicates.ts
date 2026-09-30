// File: lib/lore/ingestion/duplicates.ts
// Deterministic duplicate detection against the LIVE Lore Library — this is
// what powers the "Possible Existing Entity" prompt (spec section 9). Uses
// exact title match, alias match (stored in lore_entries.metadata.aliases),
// substring/keyword match, and — only when nothing else hits — semantic
// similarity via the same pgvector RPC the retrieval engine uses. Never
// merges or creates anything itself; it only reports the best match so the
// creator can decide.

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedLoreText } from "../server/embeddings";
import type { CanonStatus, LoreEntry, LoreProject } from "../types";

export type DuplicateMatch = {
  entryId: string;
  entryTitle: string;
  canonStatus: CanonStatus;
  matchReason: "exact_title" | "alias" | "keyword" | "semantic";
  confidence: number;
};

function entryAliases(entry: LoreEntry): string[] {
  const metadata = entry.metadata as { aliases?: unknown } | null;
  const aliases = metadata?.aliases;
  return Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [];
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Best-effort match of a free-text project hint (e.g. "Those Ryderz") to an existing lore_projects row. */
export async function resolveProjectHint(
  supabase: SupabaseClient,
  hint: string | undefined
): Promise<LoreProject | null> {
  if (!hint?.trim()) return null;
  const { data } = await supabase
    .from("lore_projects")
    .select("*")
    .ilike("title", hint.trim())
    .maybeSingle();
  if (data) return data as LoreProject;

  const { data: fuzzy } = await supabase
    .from("lore_projects")
    .select("*")
    .ilike("title", `%${hint.trim()}%`)
    .limit(1)
    .maybeSingle();
  return (fuzzy as LoreProject) ?? null;
}

/**
 * Pure name/alias matching between a candidate and a single existing entry —
 * no I/O, so this is the part unit tests can exercise directly. Exported for
 * duplicates.check.ts.
 */
export function matchCandidateAgainstEntry(
  candidate: { title: string; aliases: string[]; projectId?: string | null },
  row: Pick<LoreEntry, "title" | "project_id"> & { aliases?: string[] }
): { reason: DuplicateMatch["matchReason"]; confidence: number } | null {
  const candidateTitleNorm = norm(candidate.title);
  const candidateAliasesNorm = candidate.aliases.map(norm);
  const rowTitleNorm = norm(row.title);
  const rowAliasesNorm = (row.aliases ?? []).map(norm);

  let reason: DuplicateMatch["matchReason"] | null = null;
  let confidence = 0;

  if (rowTitleNorm === candidateTitleNorm) {
    reason = "exact_title";
    confidence = 0.95;
  } else if (
    candidateAliasesNorm.includes(rowTitleNorm) ||
    rowAliasesNorm.includes(candidateTitleNorm) ||
    candidateAliasesNorm.some((a) => rowAliasesNorm.includes(a))
  ) {
    reason = "alias";
    confidence = 0.85;
  } else if (rowTitleNorm.includes(candidateTitleNorm) || candidateTitleNorm.includes(rowTitleNorm)) {
    reason = "keyword";
    confidence = 0.6;
  }

  if (!reason) return null;

  if (candidate.projectId && row.project_id === candidate.projectId) {
    confidence = Math.min(1, confidence + 0.05);
  }

  return { reason, confidence };
}

export async function findPossibleDuplicate(
  supabase: SupabaseClient,
  candidate: { title: string; aliases: string[]; entryType: string; projectId?: string | null }
): Promise<DuplicateMatch | null> {
  const terms = Array.from(new Set([candidate.title, ...candidate.aliases].filter(Boolean)));
  if (!terms.length) return null;

  const orFilter = terms.map((t) => `title.ilike.%${t.replace(/[%,]/g, "")}%`).join(",");
  const { data } = await supabase
    .from("lore_entries")
    .select("*")
    .eq("entry_type", candidate.entryType)
    .or(orFilter)
    .limit(15);
  const rows = (data as LoreEntry[]) ?? [];

  let best: DuplicateMatch | null = null;

  for (const row of rows) {
    const match = matchCandidateAgainstEntry(candidate, { title: row.title, project_id: row.project_id, aliases: entryAliases(row) });
    if (match && (!best || match.confidence > best.confidence)) {
      best = { entryId: row.id, entryTitle: row.title, canonStatus: row.canon_status, matchReason: match.reason, confidence: match.confidence };
    }
  }

  if (best) return best;

  // Nothing matched by name — try semantic similarity as a last resort so a
  // renamed-but-clearly-the-same character doesn't slip through as "new".
  const embedding = await embedLoreText(`${candidate.title}\n${candidate.aliases.join(", ")}`);
  if (!embedding) return null;

  const { data: semanticMatches } = await supabase.rpc("lore_semantic_search", {
    query_embedding: embedding,
    match_count: 5,
    allowed_canon: ["CANON", "DRAFT", "CONCEPT", "SECRET_CANON", "RETIRED"],
  });
  const matches = (semanticMatches as Array<{ entry_id: string; similarity: number }>) ?? [];
  if (!matches.length) return null;

  const ids = matches.map((m) => m.entry_id);
  const { data: semanticRows } = await supabase
    .from("lore_entries")
    .select("*")
    .eq("entry_type", candidate.entryType)
    .in("id", ids);
  const byId = new Map(((semanticRows as LoreEntry[]) ?? []).map((r) => [r.id, r]));

  const SEMANTIC_THRESHOLD = 0.82;
  const topMatch = matches
    .map((m) => ({ match: m, row: byId.get(m.entry_id) }))
    .filter((m): m is { match: { entry_id: string; similarity: number }; row: LoreEntry } => Boolean(m.row))
    .sort((a, b) => b.match.similarity - a.match.similarity)[0];

  if (topMatch && topMatch.match.similarity >= SEMANTIC_THRESHOLD) {
    return {
      entryId: topMatch.row.id,
      entryTitle: topMatch.row.title,
      canonStatus: topMatch.row.canon_status,
      matchReason: "semantic",
      confidence: topMatch.match.similarity,
    };
  }

  return null;
}
