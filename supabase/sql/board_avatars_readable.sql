-- Make Board profile photos readable in Friend Zone and Work Boards.
-- Paste THIS SCRIPT into the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- Do not paste the file path. board-avatars stays a storage bucket; this only
-- lets /object/public and signed URLs actually return the image.

insert into storage.buckets (id, name, public)
values ('board-avatars', 'board-avatars', true)
on conflict (id) do update
  set public = true;

drop policy if exists "board avatars are publicly readable" on storage.objects;
create policy "board avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'board-avatars');

-- Friend Zone directory should prefer a storage path over a dead public URL.
create or replace function public.list_friend_zone_profiles()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  updated_at timestamptz,
  last_seen_at timestamptz,
  board_style jsonb
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    nullif(
      lower(regexp_replace(coalesce(p.username, u.raw_user_meta_data ->> 'username', split_part(coalesce(u.email, ''), '@', 1)), '[^a-zA-Z0-9_]', '', 'g')),
      ''
    ) as username,
    coalesce(
      nullif(p.display_name, ''),
      nullif(p.board_style ->> 'displayName', ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(u.email, 'Board User'), '@', 1)
    ) as display_name,
    coalesce(
      nullif(p.board_style ->> 'avatarPath', ''),
      nullif(p.avatar_url, ''),
      nullif(p.board_style ->> 'avatarUrl', ''),
      case
        when coalesce(p.board_style ->> 'avatarDataUrl', '') ~* '^https?://'
          then p.board_style ->> 'avatarDataUrl'
        else null
      end,
      nullif(u.raw_user_meta_data ->> 'avatar_url', '')
    ) as avatar_url,
    coalesce(p.updated_at, u.last_sign_in_at, u.created_at) as updated_at,
    coalesce(p.updated_at, u.last_sign_in_at, u.created_at) as last_seen_at,
    coalesce(p.board_style, '{}'::jsonb) as board_style
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p.board_style ->> 'visibility', 'public') <> 'private'
  order by coalesce(p.updated_at, u.last_sign_in_at, u.created_at) desc
  limit 80;
$$;

revoke all on function public.list_friend_zone_profiles() from public;
grant execute on function public.list_friend_zone_profiles() to anon, authenticated;
