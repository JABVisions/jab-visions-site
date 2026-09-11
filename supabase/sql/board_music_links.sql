-- My Music links
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.
-- Backs lib/board/MyMusicModule.tsx.
--
-- The module selects with no user_id filter and relies on RLS to scope rows to
-- the signed-in user, so the select policy below is load-bearing rather than
-- defence in depth: without it every user would read every user's links.

create extension if not exists pgcrypto;

create table if not exists public.music_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  url        text not null,
  platform   text,
  title      text,
  created_at timestamptz default now()
);

create index if not exists music_links_user_created_idx
  on public.music_links (user_id, created_at desc);

alter table public.music_links enable row level security;

drop policy if exists "own rows read" on public.music_links;
create policy "own rows read"
  on public.music_links
  for select
  using (auth.uid() = user_id);

drop policy if exists "own rows write" on public.music_links;
create policy "own rows write"
  on public.music_links
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "own rows modify" on public.music_links;
create policy "own rows modify"
  on public.music_links
  for update
  using (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.music_links;
create policy "own rows delete"
  on public.music_links
  for delete
  using (auth.uid() = user_id);
