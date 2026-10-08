-- Drafts Deck — editor state only. Media files stay in local drafts / board-media.
-- Run once in the Supabase SQL editor. The app keeps local drafts if this table is missing.

create extension if not exists pgcrypto;

create table if not exists public.board_drop_drafts (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  drop_type text not null default 'video',
  editor_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists board_drop_drafts_user_updated_idx
  on public.board_drop_drafts (user_id, updated_at desc);

alter table public.board_drop_drafts enable row level security;

drop policy if exists "users read own drop drafts" on public.board_drop_drafts;
create policy "users read own drop drafts"
  on public.board_drop_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users insert own drop drafts" on public.board_drop_drafts;
create policy "users insert own drop drafts"
  on public.board_drop_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own drop drafts" on public.board_drop_drafts;
create policy "users update own drop drafts"
  on public.board_drop_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.board_drop_drafts to authenticated;

notify pgrst, 'reload schema';
