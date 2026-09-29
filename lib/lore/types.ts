// File: lib/lore/types.ts
// Shared shapes for the JAB Visions Lore Library — mirrors
// supabase/sql/lore_library.sql. Kept generic on purpose: new projects, entry
// types, and relationship types are just new rows, never new fields here.

export type CanonStatus = "CANON" | "DRAFT" | "CONCEPT" | "RETIRED" | "SECRET_CANON";

/** Suggested values — entry_type is free text in the database, not an enum. */
export type SuggestedEntryType =
  | "character"
  | "location"
  | "event"
  | "organization"
  | "artifact"
  | "power"
  | "technology"
  | "concept"
  | "timeline"
  | "project"
  | "relationship"
  | "production"
  | "other";

/** Suggested values — source_type is free text. Never "ai_generated". */
export type SuggestedSourceType =
  | "screenplay"
  | "treatment"
  | "pitch_deck"
  | "character_biography"
  | "production_notes"
  | "creator_notes"
  | "comic"
  | "board_drop"
  | "dropbook"
  | "uploaded_document"
  | "manual";

export type LoreProject = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  universe: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type LoreEntry = {
  id: string;
  project_id: string | null;
  title: string;
  slug: string;
  entry_type: string;
  summary: string | null;
  content: string | null;
  canon_status: CanonStatus;
  spoiler_level: string;
  timeline_position: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LoreRelationship = {
  id: string;
  source_entry_id: string;
  target_entry_id: string;
  relationship_type: string;
  description: string | null;
  canon_status: CanonStatus;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type LoreEntrySource = {
  id: string;
  entry_id: string;
  source_type: string;
  source_title: string | null;
  source_ref: string | null;
  notes: string | null;
  created_at: string;
};

/** A related entry, flattened for display/context — one hop from some entry. */
export type LoreRelatedEntry = {
  entry: LoreEntry;
  relationshipType: string;
  description: string | null;
  /** Which side of the relationship row the *other* entry (this one) was on. */
  direction: "outgoing" | "incoming";
};

/** Everything retrieval gathers for a single matched entry. */
export type LoreEntryBundle = {
  entry: LoreEntry;
  project: LoreProject | null;
  related: LoreRelatedEntry[];
  sources: LoreEntrySource[];
  /** Why this entry was retrieved — for debugging/ranking transparency. */
  matchReason: "exact_title" | "keyword" | "semantic" | "relationship";
  score: number;
};

export type LoreRetrieval = {
  entries: LoreEntryBundle[];
  /** True when at least one CANON entry was found for the query. */
  hasCanonMatch: boolean;
};
