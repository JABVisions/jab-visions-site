-- Store Drop Collection
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.
-- Backs lib/board/storeDrops.ts sync/persist (localStorage remains offline cache).

create extension if not exists pgcrypto;

create table if not exists public.store_drop_collection (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  drop_id     text not null,
  title       text not null,
  image_url   text,
  product_url text,
  price       text,
  artifact_no text,
  status      text not null default 'bookmarked'
                check (status in ('bookmarked','collected')),
  created_at  timestamptz default now(),
  unique (user_id, drop_id)
);

create index if not exists store_drop_collection_user_created_idx
  on public.store_drop_collection (user_id, created_at desc);

alter table public.store_drop_collection enable row level security;

drop policy if exists "own rows read" on public.store_drop_collection;
create policy "own rows read"
  on public.store_drop_collection
  for select
  using (auth.uid() = user_id);

drop policy if exists "own rows write" on public.store_drop_collection;
create policy "own rows write"
  on public.store_drop_collection
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "own rows modify" on public.store_drop_collection;
create policy "own rows modify"
  on public.store_drop_collection
  for update
  using (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.store_drop_collection;
create policy "own rows delete"
  on public.store_drop_collection
  for delete
  using (auth.uid() = user_id);
