-- Raise Board media buckets to the 4GB app video cap.
-- Paste THIS SCRIPT into the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- Default bucket file_size_limit is 50MB, which 413s a 64.9MB iPhone tape.
--
-- REQUIRED in addition to this script:
--   Dashboard -> Storage -> Settings (or Project Settings -> Storage)
--   set the GLOBAL max file size / FILE_SIZE_LIMIT to at least 4GB.
-- The RPC below only updates storage.buckets.file_size_limit. Hosted Supabase
-- still 413s a 65MB Project Room tape when the project-wide Storage Settings
-- cap stays at 50MB. This script cannot change that global gateway limit.

update storage.buckets
set file_size_limit = 4294967296
where id in ('board-media', 'board-docs');

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('board-media', 'board-media', false, 4294967296),
  ('board-docs', 'board-docs', false, 4294967296)
on conflict (id) do update
  set file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit);

create or replace function public.ensure_board_media_file_size_limit()
returns bigint
language plpgsql
security definer
set search_path = storage, public
as $$
declare
  target bigint := 4294967296;
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values
    ('board-media', 'board-media', false, target),
    ('board-docs', 'board-docs', false, target)
  on conflict (id) do update
    set file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit);
  return target;
end;
$$;

revoke all on function public.ensure_board_media_file_size_limit() from public;
grant execute on function public.ensure_board_media_file_size_limit() to authenticated;
