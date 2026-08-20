-- Run once in Supabase Dashboard -> SQL Editor.
-- Connects Supabase Auth users to the Board profiles used by this app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  avatar_path text,
  board_style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists board_style jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;

alter table public.profiles enable row level security;

drop policy if exists "board profiles are publicly readable" on public.profiles;
create policy "board profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "users can create own board profile" on public.profiles;
create policy "users can create own board profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "users can update own board profile" on public.profiles;
create policy "users can update own board profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create or replace function public.handle_new_board_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, bio, board_style)
  values (
    new.id,
    nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '', 'g')), ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'Board User'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'board_goal', ''),
    jsonb_build_object(
      'auraColor', coalesce(new.raw_user_meta_data ->> 'board_signal_color', 'sloth_pink'),
      'auraMood', coalesce(new.raw_user_meta_data ->> 'board_vibe', 'locked_in'),
      'glowColor', coalesce(new.raw_user_meta_data ->> 'board_signal_hex', '#FF4FD8')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_board_profile on auth.users;
create trigger on_auth_user_created_create_board_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_board_user();
