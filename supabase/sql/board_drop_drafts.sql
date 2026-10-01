-- Drafts Deck
-- Cross-device, private storage for unfinished Drop Studio work.
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.

create extension if not exists pgcrypto;

create table if not exists public.board_drop_drafts (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  drop_type text not null check (drop_type in ('photo', 'video', 'art', 'voice', 'descript', 'dropbook')),
  status text not null default 'editing' check (status in ('sketching', 'editing', 'ready', 'converted', 'archived')),
  preview_data_url text,
  media_bucket text,
  media_path text,
  media_mime text,
  editor_state jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_drop_drafts_user_updated_idx
  on public.board_drop_drafts (user_id, updated_at desc);

alter table public.board_drop_drafts enable row level security;

drop policy if exists "users can read own drafts" on public.board_drop_drafts;
create policy "users can read own drafts"
  on public.board_drop_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can create own drafts" on public.board_drop_drafts;
create policy "users can create own drafts"
  on public.board_drop_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update own drafts" on public.board_drop_drafts;
create policy "users can update own drafts"
  on public.board_drop_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own drafts" on public.board_drop_drafts;
create policy "users can delete own drafts"
  on public.board_drop_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.board_drop_drafts to authenticated;

notify pgrst, 'reload schema';
