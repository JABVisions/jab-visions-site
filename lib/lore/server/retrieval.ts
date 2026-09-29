// File: lib/lore/server/retrieval.ts
// The Lore Library's retrieval layer for Visionary AI. Combines three legs —
// exact/keyword title matches, full-text search, and (when embeddings are
// configured) pgvector semantic similarity — into one ranked, deduplicated set
// of entries, then hydrates each with its project, one hop of relationships,
// and its sources. Canon status both filters (RETIRED is never current lore;
// SECRET_CANON is excluded unless explicitly allowed) and weights the ranking
// (CANON outranks DRAFT/CONCEPT for the same match strength).
//
// This never touches the model directly — see formatContext.ts for turning a
// LoreRetrieval into the text block Visionary AI actually reads.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loreServiceClient } from "./serviceClient";
import { embedLoreText } from "./embeddings";
import type {
  CanonStatus,
  LoreEntry,
  LoreEntryBundle,
  LoreEntrySource,
  LoreProject,
  LoreRelatedEntry,
  LoreRetrieval,
} from "../types";

const DEFAULT_LIMIT = 6;
const CANDIDATE_FETCH_LIMIT = 20;

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "who", "what",
  "when", "where", "why", "how", "does", "do", "did", "of", "to", "in", "on",
  "and", "or", "for", "with", "about", "between", "connect", "connects",
  "connection", "relationship", "tell", "me", "us", "please", "can", "you",
  "explain", "describe", "know", "there",
]);

function extractQueryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .match(/[a-z0-9']+/g) ?? [];
  const terms = words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(terms)).slice(0, 12);
}

const CANON_WEIGHT: Record<CanonStatus, number> = {
  CANON: 10,
  SECRET_CANON: 10,
  DRAFT: 3,
  CONCEPT: 1,
  RETIRED: 0,
};

type Candidate = {
  entry: LoreEntry;
  score: number;
  matchReason: LoreEntryBundle["matchReason"];
};

function allowedCanonStatuses(includeSecretCanon: boolean): CanonStatus[] {
  // RETIRED is never "current" lore, so it's never a retrieval candidate.
  return includeSecretCanon ? ["CANON", "DRAFT", "CONCEPT", "SECRET_CANON"] : ["CANON", "DRAFT", "CONCEPT"];
}

async function fetchTitleAndKeywordCandidates(
  supabase: SupabaseClient,
  query: string,
  terms: string[],
  allowedCanon: CanonStatus[]
): Promise<Candidate[]> {
  const candidates = new Map<string, Candidate>();
  const trimmedQuery = query.trim();

  function consider(entry: LoreEntry, score: number, reason: Candidate["matchReason"]) {
    const existing = candidates.get(entry.id);
    if (!existing || score > existing.score) {
      candidates.set(entry.id, { entry, score, matchReason: reason });
    }
  }

  if (terms.length) {
    const orFilter = terms.map((t) => `title.ilike.%${t.replace(/[%,]/g, "")}%`).join(",");
    const { data } = await supabase
      .from("lore_entries")
      .select("*")
      .in("canon_status", allowedCanon)
      .or(orFilter)
      .limit(CANDIDATE_FETCH_LIMIT);
    for (const row of (data as LoreEntry[]) ?? []) {
      const titleLower = row.title.toLowerCase();
      const isExact = titleLower === trimmedQuery.toLowerCase();
      const titleWords = titleLower.match(/[a-z0-9']+/g) ?? [];
      const allTitleWordsPresent =
        titleWords.length > 0 && titleWords.every((w) => trimmedQuery.toLowerCase().includes(w));
      if (isExact || allTitleWordsPresent) {
        consider(row, 100 + CANON_WEIGHT[row.canon_status], "exact_title");
      } else {
        const hitCount = terms.filter((t) => titleLower.includes(t)).length;
        consider(row, 40 + hitCount * 8 + CANON_WEIGHT[row.canon_status], "exact_title");
      }
    }
  }

  try {
    const { data } = await supabase
      .from("lore_entries")
      .select("*")
      .in("canon_status", allowedCanon)
      .textSearch("search_vector", trimmedQuery, { type: "websearch", config: "english" })
      .limit(CANDIDATE_FETCH_LIMIT);
    for (const row of (data as LoreEntry[]) ?? []) {
      consider(row, 20 + CANON_WEIGHT[row.canon_status], "keyword");
    }
  } catch {
    // A malformed websearch query (rare, e.g. stray quotes) should never break retrieval.
  }

  return Array.from(candidates.values());
}

async function fetchSemanticCandidates(
  supabase: SupabaseClient,
  query: string,
  allowedCanon: CanonStatus[]
): Promise<Candidate[]> {
  const embedding = await embedLoreText(query);
  if (!embedding) return [];

  const { data: matches, error } = await supabase.rpc("lore_semantic_search", {
    query_embedding: embedding,
    match_count: CANDIDATE_FETCH_LIMIT,
    allowed_canon: allowedCanon,
  });
  if (error || !matches?.length) return [];

  const ids = (matches as Array<{ entry_id: string; similarity: number }>).map((m) => m.entry_id);
  const { data: rows } = await supabase.from("lore_entries").select("*").in("id", ids);
  const byId = new Map(((rows as LoreEntry[]) ?? []).map((r) => [r.id, r]));

  const out: Candidate[] = [];
  for (const match of matches as Array<{ entry_id: string; similarity: number }>) {
    const entry = byId.get(match.entry_id);
    if (!entry) continue;
    out.push({
      entry,
      score: match.similarity * 30 + CANON_WEIGHT[entry.canon_status],
      matchReason: "semantic",
    });
  }
  return out;
}

async function hydrateEntry(
  supabase: SupabaseClient,
  candidate: Candidate,
  allowedCanon: CanonStatus[],
  projectCache: Map<string, LoreProject | null>
): Promise<LoreEntryBundle> {
  const { entry } = candidate;

  let project: LoreProject | null = null;
  if (entry.project_id) {
    if (projectCache.has(entry.project_id)) {
      project = projectCache.get(entry.project_id) ?? null;
    } else {
      const { data } = await supabase
        .from("lore_projects")
        .select("*")
        .eq("id", entry.project_id)
        .maybeSingle();
      project = (data as LoreProject) ?? null;
      projectCache.set(entry.project_id, project);
    }
  }

  const [{ data: outgoing }, { data: incoming }, { data: sources }] = await Promise.all([
    supabase
      .from("lore_relationships")
      .select("*, target:lore_entries!lore_relationships_target_entry_id_fkey(*)")
      .eq("source_entry_id", entry.id)
      .in("canon_status", allowedCanon),
    supabase
      .from("lore_relationships")
      .select("*, source:lore_entries!lore_relationships_source_entry_id_fkey(*)")
      .eq("target_entry_id", entry.id)
      .in("canon_status", allowedCanon),
    supabase.from("lore_entry_sources").select("*").eq("entry_id", entry.id),
  ]);

  const related: LoreRelatedEntry[] = [];
  for (const row of (outgoing as Array<{ relationship_type: string; description: string | null; target: LoreEntry | null }>) ?? []) {
    if (!row.target) continue;
    related.push({
      entry: row.target,
      relationshipType: row.relationship_type,
      description: row.description,
      direction: "outgoing",
    });
  }
  for (const row of (incoming as Array<{ relationship_type: string; description: string | null; source: LoreEntry | null }>) ?? []) {
    if (!row.source) continue;
    related.push({
      entry: row.source,
      relationshipType: row.relationship_type,
      description: row.description,
      direction: "incoming",
    });
  }

  return {
    entry,
    project,
    related,
    sources: (sources as LoreEntrySource[]) ?? [],
    matchReason: candidate.matchReason,
    score: candidate.score,
  };
}

/**
 * Search the Lore Library for a user query. Always degrades gracefully: if
 * the service-role key or Supabase itself is unavailable, returns an empty
 * retrieval rather than throwing, so Visionary AI can still answer from its
 * static/forum knowledge.
 */
export async function retrieveLoreContext(
  query: string,
  options?: { limit?: number; includeSecretCanon?: boolean }
): Promise<LoreRetrieval> {
  const supabase = loreServiceClient();
  if (!supabase || !query.trim()) return { entries: [], hasCanonMatch: false };

  const allowedCanon = allowedCanonStatuses(Boolean(options?.includeSecretCanon));
  const terms = extractQueryTerms(query);

  try {
    const [titleAndKeyword, semantic] = await Promise.all([
      fetchTitleAndKeywordCandidates(supabase, query, terms, allowedCanon),
      fetchSemanticCandidates(supabase, query, allowedCanon),
    ]);

    const merged = new Map<string, Candidate>();
    for (const candidate of [...titleAndKeyword, ...semantic]) {
      const existing = merged.get(candidate.entry.id);
      if (!existing || candidate.score > existing.score) {
        merged.set(candidate.entry.id, candidate);
      }
    }
    if (!merged.size) return { entries: [], hasCanonMatch: false };

    const ranked = Array.from(merged.values()).sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, options?.limit ?? DEFAULT_LIMIT);

    const projectCache = new Map<string, LoreProject | null>();
    const entries = await Promise.all(
      top.map((candidate) => hydrateEntry(supabase, candidate, allowedCanon, projectCache))
    );

    return {
      entries,
      hasCanonMatch: entries.some((bundle) => bundle.entry.canon_status === "CANON"),
    };
  } catch {
    // Lore Library being unreachable must never break Visionary AI's other knowledge.
    return { entries: [], hasCanonMatch: false };
  }
}
