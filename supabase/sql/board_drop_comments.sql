-- Board Drop Comments
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.

create extension if not exists pgcrypto;

create table if not exists public.board_drop_comments (
  id uuid primary key default gen_random_uuid(),
  drop_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists board_drop_comments_drop_created_idx
  on public.board_drop_comments (drop_id, created_at);

create index if not exists board_drop_comments_user_created_idx
  on public.board_drop_comments (user_id, created_at desc);

alter table public.board_drop_comments enable row level security;

drop policy if exists "authenticated users can read drop comments" on public.board_drop_comments;
create policy "authenticated users can read drop comments"
  on public.board_drop_comments
  for select
  to authenticated
  using (deleted_at is null);

drop policy if exists "users can create own drop comments" on public.board_drop_comments;
create policy "users can create own drop comments"
  on public.board_drop_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can soft delete own drop comments" on public.board_drop_comments;
create policy "users can soft delete own drop comments"
  on public.board_drop_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own drop comments" on public.board_drop_comments;
create policy "users can delete own drop comments"
  on public.board_drop_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.board_drop_comments to authenticated;

notify pgrst, 'reload schema';
