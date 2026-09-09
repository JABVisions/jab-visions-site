-- Board RLS hardening
-- Run once in Supabase Dashboard -> SQL Editor for the Board project.
--
-- Closes the "RLS Disabled in Public" advisor warnings WITHOUT breaking the app.
-- The app uses the ANON key + the visitor's session everywhere (no service role),
-- so policies must allow exactly what the app does:
--   * board_activity / board_drops  -> PUBLIC read (feed + public profiles read
--     them with no user filter, incl. logged-out visitors), OWNER-only write.
--   * forum_channels / forum_threads -> PUBLIC read only. The app's forums run on
--     localStorage today and never write these tables, so read-only is safe.
--
-- Re-runnable: every policy is dropped first, so you can run this multiple times.

-- =========================================================
-- board_activity  (id, scope, user_id, kind, title, body, href, image_url, meta, created_at)
-- =========================================================
alter table public.board_activity enable row level security;

grant select on public.board_activity to anon, authenticated;
grant insert, update, delete on public.board_activity to authenticated;

drop policy if exists "board_activity public read" on public.board_activity;
create policy "board_activity public read"
  on public.board_activity
  for select
  using (true);

drop policy if exists "board_activity owner insert" on public.board_activity;
create policy "board_activity owner insert"
  on public.board_activity
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "board_activity owner update" on public.board_activity;
create policy "board_activity owner update"
  on public.board_activity
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "board_activity owner delete" on public.board_activity;
create policy "board_activity owner delete"
  on public.board_activity
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================
-- board_drops  (id, user_id, text, style_snapshot, created_at)
-- =========================================================
alter table public.board_drops enable row level security;

grant select on public.board_drops to anon, authenticated;
grant insert, update, delete on public.board_drops to authenticated;

drop policy if exists "board_drops public read" on public.board_drops;
create policy "board_drops public read"
  on public.board_drops
  for select
  using (true);

drop policy if exists "board_drops owner insert" on public.board_drops;
create policy "board_drops owner insert"
  on public.board_drops
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "board_drops owner update" on public.board_drops;
create policy "board_drops owner update"
  on public.board_drops
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "board_drops owner delete" on public.board_drops;
create policy "board_drops owner delete"
  on public.board_drops
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================
-- forum_channels  (read-only public; app does not write these yet)
-- =========================================================
alter table public.forum_channels enable row level security;

grant select on public.forum_channels to anon, authenticated;

drop policy if exists "forum_channels public read" on public.forum_channels;
create policy "forum_channels public read"
  on public.forum_channels
  for select
  using (true);

-- =========================================================
-- forum_threads  (read-only public; app does not write these yet)
-- =========================================================
alter table public.forum_threads enable row level security;

grant select on public.forum_threads to anon, authenticated;

drop policy if exists "forum_threads public read" on public.forum_threads;
create policy "forum_threads public read"
  on public.forum_threads
  for select
  using (true);

notify pgrst, 'reload schema';
