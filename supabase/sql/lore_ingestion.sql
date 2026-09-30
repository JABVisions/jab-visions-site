-- JAB Visions Lore Ingestion Studio — schema for the AI-assisted lore extraction
-- pipeline that feeds the Lore Library created in lore_library.sql.
-- Paste into Supabase Dashboard -> SQL Editor for the Board project. Safe to re-run.
--
-- Core rule this schema enforces end to end: AI may discover lore, only a JAB
-- Visions creator/admin may declare it canon. Nothing here writes to
-- lore_entries/lore_relationships directly — every extraction lands as a
-- lore_ingestion_proposals row with status PROPOSED, and only an explicit
-- admin review action (approve/reject/edit) ever promotes it into the real
-- Lore Library tables (see lore_library.sql).
--
-- Flow:
--   lore_ingestion_sources     — raw source material (pasted text / uploaded
--                                 text file), tagged with a source_type and
--                                 one or more associated projects.
--   lore_ingestion_sessions    — one row per "Analyze Lore" run against a
--                                 source: chunking + extraction progress and
--                                 the running approve/draft/reject/conflict
--                                 counts a creator sees on the session list.
--   lore_ingestion_proposals   — individual extracted candidates (entry,
--                                 relationship, or timeline fact) awaiting
--                                 creator review. Carries duplicate-match and
--                                 contradiction-flag metadata so the review
--                                 UI can show "possible existing entity" and
--                                 "CANON CONFLICT" without guessing.
--
-- Security model: identical posture to lore_library.sql — every table here is
-- admin-only (public.is_jab_admin()) for both read and write, with no public
-- or anon policy at all. Source text can contain unreleased screenplay
-- material, so it must never be reachable outside the admin path.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- lore_ingestion_sources
-- ---------------------------------------------------------------------------

create table if not exists public.lore_ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Free text; suggested values: screenplay, treatment, character_bible,
  -- pitch_deck, creator_notes, production_notes, comic, story, board_drop,
  -- dropbook, document, other. Not enum-restricted for the same reason
  -- lore_entry_sources.source_type isn't in lore_library.sql.
  source_type text not null,
  -- The extracted/pasted plain text the AI actually analyzes. Never exposed
  -- outside the admin ingestion path.
  raw_text text not null,
  original_filename text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lore_ingestion_sources_created_idx on public.lore_ingestion_sources (created_at desc);

-- A source may belong to multiple projects at once (spec section 3: "Allow
-- multiple project associations when appropriate"), or none (universe-wide).
create table if not exists public.lore_ingestion_source_projects (
  source_id uuid not null references public.lore_ingestion_sources(id) on delete cascade,
  project_id uuid not null references public.lore_projects(id) on delete cascade,
  primary key (source_id, project_id)
);

-- ---------------------------------------------------------------------------
-- lore_ingestion_sessions — one per "Analyze Lore" run
-- ---------------------------------------------------------------------------

create table if not exists public.lore_ingestion_sessions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.lore_ingestion_sources(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  chunk_count int not null default 0,
  extracted_count int not null default 0,
  approved_count int not null default 0,
  draft_count int not null default 0,
  concept_count int not null default 0,
  rejected_count int not null default 0,
  conflict_count int not null default 0,
  error text,
  -- Non-error informational note, e.g. "large source, analyzed the first N
  -- of M chunks — re-run to continue." Kept separate from `error` so a
  -- truncated-but-successful pass never reads as a failure in the UI.
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists lore_ingestion_sessions_source_idx on public.lore_ingestion_sessions (source_id);
create index if not exists lore_ingestion_sessions_created_idx on public.lore_ingestion_sessions (created_at desc);

-- ---------------------------------------------------------------------------
-- lore_ingestion_proposals — the review queue. Nothing here is canon.
-- ---------------------------------------------------------------------------

create table if not exists public.lore_ingestion_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lore_ingestion_sessions(id) on delete cascade,
  proposal_type text not null check (proposal_type in ('entry', 'relationship', 'timeline_fact')),
  -- Only meaningful when proposal_type = 'entry'. Free text, same suggested
  -- values as lore_entries.entry_type.
  entry_type text,
  title text,
  -- The full extracted candidate: summary, content, aliases, source excerpt,
  -- relationship endpoints (by title, resolved to ids on approval), timeline
  -- description, confidence, chunk provenance, etc. Kept schemaless on
  -- purpose since proposal_type/entry_type vary its shape.
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED', 'APPROVED_CANON', 'APPROVED_DRAFT', 'APPROVED_CONCEPT', 'REJECTED', 'NEEDS_REVIEW')),
  -- Deterministic duplicate-detection result against the live Lore Library
  -- (exact/alias/keyword/project match) — set before creator review, never
  -- auto-applied.
  possible_duplicate_of uuid references public.lore_entries(id) on delete set null,
  duplicate_match_reason text,
  -- Set when the matched existing entry is CANON and the new material may
  -- conflict with it. Never auto-resolved — see lore_ingestion.ts.
  conflict_detected boolean not null default false,
  conflict_notes text,
  -- Populated once a creator approves this proposal into the real Lore
  -- Library tables, so provenance and "what came from this ingestion" stay
  -- traceable both ways.
  resulting_entry_id uuid references public.lore_entries(id) on delete set null,
  resulting_relationship_id uuid references public.lore_relationships(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lore_ingestion_proposals_session_idx on public.lore_ingestion_proposals (session_id);
create index if not exists lore_ingestion_proposals_status_idx on public.lore_ingestion_proposals (status);
create index if not exists lore_ingestion_proposals_dup_idx on public.lore_ingestion_proposals (possible_duplicate_of);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses lore_touch_updated_at() from lore_library.sql)
-- ---------------------------------------------------------------------------

drop trigger if exists lore_ingestion_sources_touch_updated_at on public.lore_ingestion_sources;
create trigger lore_ingestion_sources_touch_updated_at
  before update on public.lore_ingestion_sources
  for each row execute function public.lore_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — admin-only, no public policies at all.
-- ---------------------------------------------------------------------------

alter table public.lore_ingestion_sources enable row level security;
alter table public.lore_ingestion_source_projects enable row level security;
alter table public.lore_ingestion_sessions enable row level security;
alter table public.lore_ingestion_proposals enable row level security;

drop policy if exists "lore ingestion sources admin read" on public.lore_ingestion_sources;
create policy "lore ingestion sources admin read"
  on public.lore_ingestion_sources for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion sources admin write" on public.lore_ingestion_sources;
create policy "lore ingestion sources admin write"
  on public.lore_ingestion_sources for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion source projects admin read" on public.lore_ingestion_source_projects;
create policy "lore ingestion source projects admin read"
  on public.lore_ingestion_source_projects for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion source projects admin write" on public.lore_ingestion_source_projects;
create policy "lore ingestion source projects admin write"
  on public.lore_ingestion_source_projects for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion sessions admin read" on public.lore_ingestion_sessions;
create policy "lore ingestion sessions admin read"
  on public.lore_ingestion_sessions for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion sessions admin write" on public.lore_ingestion_sessions;
create policy "lore ingestion sessions admin write"
  on public.lore_ingestion_sessions for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion proposals admin read" on public.lore_ingestion_proposals;
create policy "lore ingestion proposals admin read"
  on public.lore_ingestion_proposals for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore ingestion proposals admin write" on public.lore_ingestion_proposals;
create policy "lore ingestion proposals admin write"
  on public.lore_ingestion_proposals for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

-- No `grant ... to anon` anywhere in this file — anon has zero access.
grant select, insert, update, delete on
  public.lore_ingestion_sources,
  public.lore_ingestion_source_projects,
  public.lore_ingestion_sessions,
  public.lore_ingestion_proposals
  to authenticated;

-- After applying:
--   1. Confirm the four lore_ingestion_* tables exist under public.
--   2. This depends on lore_library.sql already having been applied (for
--      public.is_jab_admin, public.lore_touch_updated_at, public.lore_projects,
--      public.lore_entries, and public.lore_relationships).
