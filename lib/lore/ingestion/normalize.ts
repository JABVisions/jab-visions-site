// File: lib/lore/ingestion/normalize.ts
// Merges extraction results collected across all chunks of one ingestion
// session so the same character/relationship/fact mentioned in multiple
// chunks becomes ONE proposal, not several near-duplicates (spec section 15:
// "avoid generating multiple versions of the same character because they
// appeared in multiple chunks").
//
// This only merges WITHIN a single session's fresh extraction results. Matching
// against the Lore Library's existing, already-approved entries is a separate
// concern — see duplicates.ts.

import type { ExtractionConfidence, RawExtractionResult } from "./types";

export type ChunkExtraction = { chunkIndex: number; result: RawExtractionResult };

export type MergedEntryCandidate = {
  title: string;
  aliases: string[];
  entryType: string;
  summary: string;
  content?: string;
  details?: string;
  projectHint?: string;
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

export type MergedRelationshipCandidate = {
  sourceTitle: string;
  targetTitle: string;
  relationshipType: string;
  description?: string;
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

export type MergedTimelineFactCandidate = {
  description: string;
  relatedTitles: string[];
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

export type NormalizedExtraction = {
  entries: MergedEntryCandidate[];
  relationships: MergedRelationshipCandidate[];
  timelineFacts: MergedTimelineFactCandidate[];
};

const CONFIDENCE_RANK: Record<ExtractionConfidence, number> = { high: 3, medium: 2, low: 1 };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function betterConfidence(a: ExtractionConfidence, b: ExtractionConfidence): ExtractionConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function longer(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

export function normalizeExtractions(chunkExtractions: ChunkExtraction[]): NormalizedExtraction {
  const entryMap = new Map<string, MergedEntryCandidate>();
  const relationshipMap = new Map<string, MergedRelationshipCandidate>();
  const timelineMap = new Map<string, MergedTimelineFactCandidate>();

  for (const { chunkIndex, result } of chunkExtractions) {
    for (const raw of result.entries) {
      // Same title + same entry type collapses into one candidate; the same
      // name used for a different type (rare, but possible with common
      // words) is kept separate rather than silently merged.
      const key = `${normalizeKey(raw.title)}::${normalizeKey(raw.entryType)}`;
      const existing = entryMap.get(key);
      if (!existing) {
        entryMap.set(key, {
          title: raw.title,
          aliases: raw.aliases ? [...raw.aliases] : [],
          entryType: raw.entryType,
          summary: raw.summary,
          content: raw.content,
          details: raw.details,
          projectHint: raw.projectHint,
          confidence: raw.confidence,
          sourceExcerpt: raw.sourceExcerpt,
          chunkIndexes: [chunkIndex],
        });
        continue;
      }
      existing.aliases = Array.from(new Set([...existing.aliases, ...(raw.aliases ?? [])]));
      existing.summary = longer(existing.summary, raw.summary) ?? existing.summary;
      existing.content = longer(existing.content, raw.content);
      existing.details = longer(existing.details, raw.details);
      existing.projectHint = existing.projectHint ?? raw.projectHint;
      existing.confidence = betterConfidence(existing.confidence, raw.confidence);
      existing.sourceExcerpt = existing.sourceExcerpt ?? raw.sourceExcerpt;
      if (!existing.chunkIndexes.includes(chunkIndex)) existing.chunkIndexes.push(chunkIndex);
    }

    for (const raw of result.relationships) {
      const key = `${normalizeKey(raw.sourceTitle)}::${normalizeKey(raw.targetTitle)}::${normalizeKey(raw.relationshipType)}`;
      const existing = relationshipMap.get(key);
      if (!existing) {
        relationshipMap.set(key, {
          sourceTitle: raw.sourceTitle,
          targetTitle: raw.targetTitle,
          relationshipType: raw.relationshipType,
          description: raw.description,
          confidence: raw.confidence,
          sourceExcerpt: raw.sourceExcerpt,
          chunkIndexes: [chunkIndex],
        });
        continue;
      }
      existing.description = longer(existing.description, raw.description);
      existing.confidence = betterConfidence(existing.confidence, raw.confidence);
      existing.sourceExcerpt = existing.sourceExcerpt ?? raw.sourceExcerpt;
      if (!existing.chunkIndexes.includes(chunkIndex)) existing.chunkIndexes.push(chunkIndex);
    }

    for (const raw of result.timelineFacts) {
      const key = normalizeKey(raw.description);
      const existing = timelineMap.get(key);
      if (!existing) {
        timelineMap.set(key, {
          description: raw.description,
          relatedTitles: raw.relatedTitles ? [...raw.relatedTitles] : [],
          confidence: raw.confidence,
          sourceExcerpt: raw.sourceExcerpt,
          chunkIndexes: [chunkIndex],
        });
        continue;
      }
      existing.relatedTitles = Array.from(new Set([...existing.relatedTitles, ...(raw.relatedTitles ?? [])]));
      existing.confidence = betterConfidence(existing.confidence, raw.confidence);
      if (!existing.chunkIndexes.includes(chunkIndex)) existing.chunkIndexes.push(chunkIndex);
    }
  }

  return {
    entries: Array.from(entryMap.values()),
    relationships: Array.from(relationshipMap.values()),
    timelineFacts: Array.from(timelineMap.values()),
  };
}
