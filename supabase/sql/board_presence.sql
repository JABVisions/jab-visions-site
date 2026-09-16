-- Optional Friend Zone presence table.
-- If this is not applied, /api/board/presence falls back to a hidden
-- board_activity ping that never appears on the feed.

create table if not exists public.board_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  visible boolean not null default true
);

alter table public.board_presence enable row level security;

drop policy if exists "board presence is publicly readable" on public.board_presence;
create policy "board presence is publicly readable"
  on public.board_presence for select
  to anon, authenticated
  using (visible = true);

drop policy if exists "users can write own board presence" on public.board_presence;
create policy "users can write own board presence"
  on public.board_presence for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own board presence" on public.board_presence;
create policy "users can update own board presence"
  on public.board_presence for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.board_presence to anon, authenticated;
grant insert, update on public.board_presence to authenticated;
