-- Board profile images: avatar, cover poster, and Vision Wall photos.
-- Paste THIS SCRIPT into the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- Safe to re-run.
--
-- Root cause fixed by this script:
--   The app has always uploaded avatar/cover/Vision Wall photos straight from
--   the browser to Storage buckets `board-avatars` and `board-images`. Those
--   buckets never existed in this project, so every upload silently failed
--   and the app fell back to keeping the photo only as a base64 string in
--   the browser's localStorage. A cleanup routine in the app deliberately
--   strips large base64 strings out of localStorage on every save/reload
--   (to avoid blowing the browser storage quota), which is why the photos
--   kept disappearing. Creating the buckets + policies below lets uploads
--   actually persist to Supabase Storage, which is what the app expects.

insert into storage.buckets (id, name, public)
values
  ('board-avatars', 'board-avatars', true),
  ('board-images', 'board-images', true)
on conflict (id) do update
  set public = true;

-- Public read (profiles, Friend Zone, Work Boards, and any signed/public URL).
drop policy if exists "board avatars are publicly readable" on storage.objects;
create policy "board avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'board-avatars');

drop policy if exists "board images are publicly readable" on storage.objects;
create policy "board images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'board-images');

-- Authenticated users may only write into their own `${auth.uid()}/...` path,
-- matching the app's upload path (`${userId}/avatar-...`, `${userId}/cover-...`,
-- `${userId}/vision-1-...` etc.).
drop policy if exists "users manage own board avatars" on storage.objects;
create policy "users manage own board avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own board avatars" on storage.objects;
create policy "users update own board avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'board-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'board-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own board avatars" on storage.objects;
create policy "users delete own board avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'board-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users manage own board images" on storage.objects;
create policy "users manage own board images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own board images" on storage.objects;
create policy "users update own board images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'board-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'board-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own board images" on storage.objects;
create policy "users delete own board images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'board-images' and (storage.foldername(name))[1] = auth.uid()::text);
