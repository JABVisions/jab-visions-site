-- JAB Visions Lore Library — canon database + retrieval architecture for Visionary AI.
-- Paste into Supabase Dashboard -> SQL Editor for the Board project. Safe to re-run.
--
-- Architecture:
--   lore_projects      — a franchise/world (Those Ryderz, Fatal Stars, Joan of Arc, …).
--   lore_entries       — any single piece of canon (character, location, event, …),
--                        optionally scoped to a project, or universe-wide when
--                        project_id is null.
--   lore_relationships — a knowledge graph edge between two entries (MEMBER_OF,
--                        DATING, CHILD_OF, CONNECTED_TO, …), including cross-project
--                        connections.
--   lore_entry_sources — provenance for an entry (screenplay, character bible,
--                        Board Drop, …). AI-generated text is never a valid source —
--                        only creator-authored material establishes canon.
--
-- This schema is intentionally generic: new projects/entry types/relationship
-- types are just new rows, never new columns or migrations. `entry_type`,
-- `relationship_type`, and `source_type` are free text (documented, not
-- enum-restricted) so the universe can grow without further schema changes.
--
-- Security model:
--   Every lore table is admin-only end to end (reuses public.is_jab_admin() from
--   board_rooms.sql — insert your user id into public.jab_admins first). There is
--   NO public/anon SELECT policy on any lore table: the public never gets direct
--   database access to lore. Visionary AI reads lore server-side with the Supabase
--   service-role key (never shipped to the browser) and, on the public chat route,
--   explicitly excludes canon_status = 'SECRET_CANON' in application code before
--   anything reaches the model — RLS blocks the client path entirely, and the
--   server path is additionally code-gated, so SECRET_CANON has two independent
--   barriers between it and a public answer.
--
-- After applying:
--   1. Confirm the four lore_* tables exist under public.
--   2. Make sure you're already in public.jab_admins (see board_rooms.sql) —
--      that's what the future admin Lore Library page checks.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- lore_projects
-- ---------------------------------------------------------------------------

create table if not exists public.lore_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  -- The umbrella universe a project belongs to. Everything today is "JAB Visions",
  -- but this stays a plain string so a genuinely separate universe can exist later
  -- without a schema change.
  universe text not null default 'JAB Visions',
  -- Free text; suggested values: active, in_development, hiatus, completed, archived.
  status text not null default 'in_development',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lore_projects_universe_idx on public.lore_projects (universe);

-- ---------------------------------------------------------------------------
-- lore_entries
-- ---------------------------------------------------------------------------

create table if not exists public.lore_entries (
  id uuid primary key default gen_random_uuid(),
  -- Null = universe-wide entry not scoped to a single project.
  project_id uuid references public.lore_projects(id) on delete set null,
  title text not null,
  slug text not null,
  -- Free text; suggested values: character, location, event, organization,
  -- artifact, power, technology, concept, timeline, project, relationship,
  -- production, other. Not enum-restricted — new entry types are just new rows.
  entry_type text not null,
  summary text,
  content text,
  canon_status text not null default 'DRAFT'
    check (canon_status in ('CANON', 'DRAFT', 'CONCEPT', 'RETIRED', 'SECRET_CANON')),
  -- Free text; suggested values: none, mild, major, ending.
  spoiler_level text not null default 'none',
  -- A sortable/human label for where this sits in-story (e.g. "Season 1, Episode 4",
  -- "Before the founding of the Ryderz"). Kept as text, not a hard timestamp, since
  -- fictional timelines rarely map to real calendar dates.
  timeline_position text,
  metadata jsonb not null default '{}'::jsonb,
  -- OpenAI text-embedding-3-small (1536-dim). Null until the entry has been embedded;
  -- retrieval falls back to keyword/relationship matching when it's absent.
  embedding vector(1536),
  -- Generated tsvector for fast keyword search — the "exact name should win" leg of
  -- retrieval alongside semantic similarity.
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, slug)
);

create index if not exists lore_entries_project_idx on public.lore_entries (project_id);
create index if not exists lore_entries_entry_type_idx on public.lore_entries (entry_type);
create index if not exists lore_entries_canon_status_idx on public.lore_entries (canon_status);
create index if not exists lore_entries_search_vector_idx on public.lore_entries using gin (search_vector);
create index if not exists lore_entries_metadata_idx on public.lore_entries using gin (metadata);
-- No vector index yet on purpose: ivfflat/hnsw indexes need a meaningful amount of
-- data to be worth it. Once lore_entries has real volume (~1k+ embedded rows), add:
--   create index lore_entries_embedding_idx on public.lore_entries
--     using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- lore_relationships — the knowledge graph
-- ---------------------------------------------------------------------------

create table if not exists public.lore_relationships (
  id uuid primary key default gen_random_uuid(),
  source_entry_id uuid not null references public.lore_entries(id) on delete cascade,
  target_entry_id uuid not null references public.lore_entries(id) on delete cascade,
  -- Free text, upper-snake-case convention (MEMBER_OF, DATING, CHILD_OF,
  -- ASSOCIATED_WITH, CONNECTED_TO, RIVALRY, …). Not enum-restricted.
  relationship_type text not null,
  description text,
  canon_status text not null default 'CANON'
    check (canon_status in ('CANON', 'DRAFT', 'CONCEPT', 'RETIRED', 'SECRET_CANON')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (source_entry_id <> target_entry_id)
);

create index if not exists lore_relationships_source_idx on public.lore_relationships (source_entry_id);
create index if not exists lore_relationships_target_idx on public.lore_relationships (target_entry_id);
create index if not exists lore_relationships_type_idx on public.lore_relationships (relationship_type);

-- ---------------------------------------------------------------------------
-- lore_entry_sources — provenance. AI answers are never written here as a source.
-- ---------------------------------------------------------------------------

create table if not exists public.lore_entry_sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lore_entries(id) on delete cascade,
  -- Free text; suggested values: screenplay, treatment, pitch_deck,
  -- character_biography, production_notes, creator_notes, comic, board_drop,
  -- dropbook, uploaded_document, manual. Deliberately no "ai_generated" value —
  -- AI output is never authoritative source material for canon.
  source_type text not null,
  source_title text,
  source_ref text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lore_entry_sources_entry_idx on public.lore_entry_sources (entry_id);

-- ---------------------------------------------------------------------------
-- Semantic search helper (used only by the service-role key — see grants).
-- Security invoker by design: it executes as whatever role calls it, so
-- ordinary RLS still nominally applies; the only role ever granted EXECUTE is
-- service_role, which already bypasses RLS at the role level. Nobody without
-- the service-role key can reach this function or the rows it returns.
-- ---------------------------------------------------------------------------

create or replace function public.lore_semantic_search(
  query_embedding vector(1536),
  match_count int default 8,
  allowed_canon text[] default array['CANON', 'DRAFT', 'CONCEPT']
)
returns table (entry_id uuid, similarity float)
language sql
stable
as $$
  select id as entry_id, 1 - (embedding <=> query_embedding) as similarity
  from public.lore_entries
  where embedding is not null
    and canon_status = any(allowed_canon)
  order by embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.lore_semantic_search(vector, int, text[]) from public;
grant execute on function public.lore_semantic_search(vector, int, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.lore_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists lore_projects_touch_updated_at on public.lore_projects;
create trigger lore_projects_touch_updated_at
  before update on public.lore_projects
  for each row execute function public.lore_touch_updated_at();

drop trigger if exists lore_entries_touch_updated_at on public.lore_entries;
create trigger lore_entries_touch_updated_at
  before update on public.lore_entries
  for each row execute function public.lore_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — admin-only, no public policies at all.
-- ---------------------------------------------------------------------------

alter table public.lore_projects enable row level security;
alter table public.lore_entries enable row level security;
alter table public.lore_relationships enable row level security;
alter table public.lore_entry_sources enable row level security;

drop policy if exists "lore projects admin read" on public.lore_projects;
create policy "lore projects admin read"
  on public.lore_projects for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore projects admin write" on public.lore_projects;
create policy "lore projects admin write"
  on public.lore_projects for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore entries admin read" on public.lore_entries;
create policy "lore entries admin read"
  on public.lore_entries for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore entries admin write" on public.lore_entries;
create policy "lore entries admin write"
  on public.lore_entries for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore relationships admin read" on public.lore_relationships;
create policy "lore relationships admin read"
  on public.lore_relationships for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore relationships admin write" on public.lore_relationships;
create policy "lore relationships admin write"
  on public.lore_relationships for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "lore entry sources admin read" on public.lore_entry_sources;
create policy "lore entry sources admin read"
  on public.lore_entry_sources for select
  to authenticated
  using (public.is_jab_admin(auth.uid()));

drop policy if exists "lore entry sources admin write" on public.lore_entry_sources;
create policy "lore entry sources admin write"
  on public.lore_entry_sources for all
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

-- No `grant ... to anon` anywhere in this file — anon has zero access to lore.
grant select, insert, update, delete on
  public.lore_projects,
  public.lore_entries,
  public.lore_relationships,
  public.lore_entry_sources
  to authenticated;
