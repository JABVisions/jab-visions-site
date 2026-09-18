-- Friend Zone directory.
-- Run once in Supabase Dashboard -> SQL Editor so the dock can list every
-- Board account, not only people with a public drop.

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
      nullif(p.avatar_url, ''),
      nullif(p.board_style ->> 'avatarUrl', ''),
      case
        when coalesce(p.board_style ->> 'avatarDataUrl', '') ~* '^https?://'
          then p.board_style ->> 'avatarDataUrl'
        else null
      end,
      nullif(p.board_style ->> 'avatarPath', ''),
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

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "profiles are viewable by users who created them" on public.profiles;
drop policy if exists "Enable read access for all users" on public.profiles;
drop policy if exists "board profiles are publicly readable" on public.profiles;

create policy "board profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (
    coalesce(board_style ->> 'visibility', 'public') <> 'private'
    or (select auth.uid()) = id
  );

grant select on public.profiles to anon, authenticated;

create table if not exists public.board_orbit (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  visible boolean not null default true
);

alter table public.board_orbit enable row level security;

drop policy if exists "board orbit is publicly readable" on public.board_orbit;
create policy "board orbit is publicly readable"
  on public.board_orbit for select
  to anon, authenticated
  using (visible = true);

drop policy if exists "users can write own board orbit" on public.board_orbit;
create policy "users can write own board orbit"
  on public.board_orbit for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own board orbit" on public.board_orbit;
create policy "users can update own board orbit"
  on public.board_orbit for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.board_orbit to anon, authenticated;
grant insert, update on public.board_orbit to authenticated;

notify pgrst, 'reload schema';
