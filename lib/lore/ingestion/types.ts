// File: lib/lore/ingestion/types.ts
// Shared shapes for the Lore Ingestion Studio — mirrors
// supabase/sql/lore_ingestion.sql. Nothing in this pipeline writes directly to
// lore_entries/lore_relationships; everything lands here first as a proposal.

import type { CanonStatus } from "../types";

export type IngestionSourceType =
  | "screenplay"
  | "treatment"
  | "character_bible"
  | "pitch_deck"
  | "creator_notes"
  | "production_notes"
  | "comic"
  | "story"
  | "board_drop"
  | "dropbook"
  | "document"
  | "other";

export type LoreIngestionSource = {
  id: string;
  title: string;
  source_type: string;
  raw_text: string;
  original_filename: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IngestionSessionStatus = "running" | "completed" | "failed";

export type LoreIngestionSession = {
  id: string;
  source_id: string;
  status: IngestionSessionStatus;
  chunk_count: number;
  extracted_count: number;
  approved_count: number;
  draft_count: number;
  concept_count: number;
  rejected_count: number;
  conflict_count: number;
  error: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ProposalType = "entry" | "relationship" | "timeline_fact";

export type ProposalStatus =
  | "PROPOSED"
  | "APPROVED_CANON"
  | "APPROVED_DRAFT"
  | "APPROVED_CONCEPT"
  | "REJECTED"
  | "NEEDS_REVIEW";

/** Confidence the extraction step assigns to a single candidate. */
export type ExtractionConfidence = "high" | "medium" | "low";

/** payload shape when proposal_type === "entry". */
export type EntryProposalPayload = {
  title: string;
  aliases?: string[];
  entryTypeLabel?: string;
  summary: string;
  content?: string;
  projectHint?: string;
  /** e.g. abilities, affiliations, important history — kept as readable prose, never invented. */
  details?: string;
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

/** payload shape when proposal_type === "relationship". */
export type RelationshipProposalPayload = {
  sourceTitle: string;
  targetTitle: string;
  relationshipType: string;
  description?: string;
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

/** payload shape when proposal_type === "timeline_fact". */
export type TimelineFactProposalPayload = {
  description: string;
  relatedTitles?: string[];
  confidence: ExtractionConfidence;
  sourceExcerpt?: string;
  chunkIndexes: number[];
};

export type ProposalPayload = EntryProposalPayload | RelationshipProposalPayload | TimelineFactProposalPayload;

export type LoreIngestionProposal = {
  id: string;
  session_id: string;
  proposal_type: ProposalType;
  entry_type: string | null;
  title: string | null;
  payload: ProposalPayload;
  status: ProposalStatus;
  possible_duplicate_of: string | null;
  duplicate_match_reason: string | null;
  conflict_detected: boolean;
  conflict_notes: string | null;
  resulting_entry_id: string | null;
  resulting_relationship_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/** The raw shape asked of the model for one chunk — validated before use. */
export type RawExtractionResult = {
  entries: Array<{
    title: string;
    aliases?: string[];
    entryType: string;
    summary: string;
    content?: string;
    details?: string;
    projectHint?: string;
    confidence: ExtractionConfidence;
    sourceExcerpt?: string;
  }>;
  relationships: Array<{
    sourceTitle: string;
    targetTitle: string;
    relationshipType: string;
    description?: string;
    confidence: ExtractionConfidence;
    sourceExcerpt?: string;
  }>;
  timelineFacts: Array<{
    description: string;
    relatedTitles?: string[];
    confidence: ExtractionConfidence;
    sourceExcerpt?: string;
  }>;
};

/** What creators choose when the review UI shows "Possible Existing Entity". */
export type DuplicateResolution = "update_existing" | "create_new" | "merge_information" | "ignore_proposal";

export type ApprovalDecision =
  | {
      action: "approve";
      canonStatus: Extract<CanonStatus, "CANON" | "DRAFT" | "CONCEPT" | "SECRET_CANON">;
      duplicateResolution?: DuplicateResolution;
    }
  | { action: "reject" }
  | { action: "needs_review" };
