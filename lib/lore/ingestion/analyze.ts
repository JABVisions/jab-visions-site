// File: lib/lore/ingestion/analyze.ts
// The "Analyze Lore" action end to end: chunk -> extract -> normalize ->
// duplicate-match -> conflict-check -> persist as PROPOSED rows. Nothing here
// ever writes to lore_entries/lore_relationships — see review.ts for the only
// path that promotes a proposal into real Lore Library data, and only on an
// explicit creator action.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loreServiceClient } from "../server/serviceClient";
import { chunkSourceText } from "./chunking";
import { extractLoreFromChunk } from "./extract";
import { normalizeExtractions, type ChunkExtraction } from "./normalize";
import { findPossibleDuplicate, resolveProjectHint } from "./duplicates";
import { checkForConflict } from "./conflicts";
import type { LoreIngestionSource } from "./types";
import type { LoreEntry } from "../types";

const CANON_LIKE = new Set(["CANON", "SECRET_CANON"]);

// Keeps one "Analyze" request inside the platform's route time budget. Very
// long sources still get chunked in full for size purposes, but only the
// first MAX_CHUNKS are analyzed in a single pass — the session is marked
// completed with a note so a creator can re-run analysis on the remainder in
// a follow-up phase rather than the request timing out mid-way.
const MAX_CHUNKS_PER_PASS = 60;
const EXTRACTION_CONCURRENCY = 4;

export class IngestionError extends Error {}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchSource(supabase: SupabaseClient, sourceId: string): Promise<LoreIngestionSource> {
  const { data, error } = await supabase
    .from("lore_ingestion_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) throw new IngestionError("Source not found.");
  return data as LoreIngestionSource;
}

async function sourceProjectHint(supabase: SupabaseClient, sourceId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("lore_ingestion_source_projects")
    .select("lore_projects(title)")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();
  const joined = data as { lore_projects?: { title?: string } | null } | null;
  return joined?.lore_projects?.title;
}

/**
 * Runs a full analysis pass for one ingestion session and persists every
 * extracted candidate as a PROPOSED (or NEEDS_REVIEW, if a CANON conflict was
 * flagged) row. Updates the session's progress counters and final status as
 * it goes so a creator can watch it complete or see why it failed.
 */
export async function analyzeIngestionSource(sessionId: string): Promise<void> {
  const supabase = loreServiceClient();
  if (!supabase) throw new IngestionError("Lore Library service credentials are not configured.");

  const { data: session, error: sessionError } = await supabase
    .from("lore_ingestion_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) throw new IngestionError("Ingestion session not found.");

  try {
    const source = await fetchSource(supabase, session.source_id);
    const projectHint = await sourceProjectHint(supabase, session.source_id);
    const resolvedProject = await resolveProjectHint(supabase, projectHint);

    const allChunks = chunkSourceText(source.raw_text);
    const chunks = allChunks.slice(0, MAX_CHUNKS_PER_PASS);
    const truncated = allChunks.length > chunks.length;
    await supabase.from("lore_ingestion_sessions").update({ chunk_count: allChunks.length }).eq("id", sessionId);

    // extractLoreFromChunk degrades to an empty result (by design) when
    // OPENAI_API_KEY isn't configured, so a missing key previously looked
    // identical to "the AI genuinely found nothing" — completed, 0
    // candidates, no explanation. Catch that case explicitly so the creator
    // gets a clear reason instead of a silent no-op.
    if (!process.env.OPENAI_API_KEY?.trim()) {
      await supabase
        .from("lore_ingestion_sessions")
        .update({
          status: "completed",
          extracted_count: 0,
          conflict_count: 0,
          note: "AI extraction is not configured (missing OPENAI_API_KEY) — no analysis was actually run. Add the key and re-run analysis.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return;
    }

    const chunkExtractions: ChunkExtraction[] = await mapWithConcurrency(chunks, EXTRACTION_CONCURRENCY, async (chunk, i) => ({
      chunkIndex: i,
      result: await extractLoreFromChunk(chunk, {
        sourceTitle: source.title,
        sourceType: source.source_type,
        projectHint,
        chunkIndex: i,
        chunkCount: chunks.length,
      }),
    }));

    const normalized = normalizeExtractions(chunkExtractions);
    let extractedCount = 0;
    let conflictCount = 0;

    for (const entryCandidate of normalized.entries) {
      const duplicate = await findPossibleDuplicate(supabase, {
        title: entryCandidate.title,
        aliases: entryCandidate.aliases,
        entryType: entryCandidate.entryType,
        projectId: resolvedProject?.id ?? null,
      });

      let conflictDetected = false;
      let conflictNotes: string | null = null;
      let status: "PROPOSED" | "NEEDS_REVIEW" = "PROPOSED";

      if (duplicate && CANON_LIKE.has(duplicate.canonStatus)) {
        const { data: existingEntry } = await supabase
          .from("lore_entries")
          .select("summary, content")
          .eq("id", duplicate.entryId)
          .maybeSingle();
        if (existingEntry) {
          const check = await checkForConflict(entryCandidate, existingEntry as Pick<LoreEntry, "summary" | "content">);
          conflictDetected = check.conflictDetected;
          conflictNotes = check.notes;
          if (conflictDetected) {
            status = "NEEDS_REVIEW";
            conflictCount += 1;
          }
        }
      }

      await supabase.from("lore_ingestion_proposals").insert({
        session_id: sessionId,
        proposal_type: "entry",
        entry_type: entryCandidate.entryType,
        title: entryCandidate.title,
        payload: { ...entryCandidate, projectHint: entryCandidate.projectHint ?? projectHint },
        status,
        possible_duplicate_of: duplicate?.entryId ?? null,
        duplicate_match_reason: duplicate
          ? `${duplicate.matchReason} (${Math.round(duplicate.confidence * 100)}% confidence, existing status ${duplicate.canonStatus})`
          : null,
        conflict_detected: conflictDetected,
        conflict_notes: conflictNotes,
      });
      extractedCount += 1;
    }

    for (const relationshipCandidate of normalized.relationships) {
      await supabase.from("lore_ingestion_proposals").insert({
        session_id: sessionId,
        proposal_type: "relationship",
        title: `${relationshipCandidate.sourceTitle} → ${relationshipCandidate.relationshipType} → ${relationshipCandidate.targetTitle}`,
        payload: relationshipCandidate,
        status: "PROPOSED",
      });
      extractedCount += 1;
    }

    for (const factCandidate of normalized.timelineFacts) {
      await supabase.from("lore_ingestion_proposals").insert({
        session_id: sessionId,
        proposal_type: "timeline_fact",
        title: factCandidate.description.slice(0, 120),
        payload: factCandidate,
        status: "PROPOSED",
      });
      extractedCount += 1;
    }

    await supabase
      .from("lore_ingestion_sessions")
      .update({
        status: "completed",
        extracted_count: extractedCount,
        conflict_count: conflictCount,
        note: truncated
          ? `Analyzed the first ${chunks.length} of ${allChunks.length} chunks. Source is large — re-run analysis to continue reviewing the remainder in a later pass.`
          : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  } catch (error) {
    await supabase
      .from("lore_ingestion_sessions")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown ingestion error.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    throw error;
  }
}
