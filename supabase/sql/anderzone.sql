-- ANDERZONE pre-alpha. Additive. Run in the Supabase SQL editor.
-- Reverse with supabase/sql/anderzone_down.sql.

create table if not exists public.anderzone_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Ander',
  appearance jsonb not null default '{}'::jsonb,
  starter_pod_granted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.anderzone_regions (
  id text primary key,
  title text not null,
  playable boolean not null default false,
  mood text not null default '',
  definition jsonb not null default '{}'::jsonb
);

create table if not exists public.anderzone_furniture_catalog (
  id text primary key,
  label text not null,
  width_tiles integer not null default 1,
  height_tiles integer not null default 1
);

create table if not exists public.anderzone_pods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  visitor_access text not null default 'private' check (visitor_access in ('private', 'friends', 'public')),
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.anderzone_inventory (
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.anderzone_furniture_catalog(id),
  qty integer not null default 1 check (qty >= 0),
  primary key (owner_id, item_id)
);

create table if not exists public.anderzone_dooboos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  species_id text not null,
  name text not null check (char_length(name) between 1 and 16),
  care jsonb not null default '{"fullness":80,"energy":80,"bond":1}'::jsonb,
  region_id text not null default 'anderzone-central',
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists anderzone_dooboos_owner_idx on public.anderzone_dooboos (owner_id);
create index if not exists anderzone_pods_owner_idx on public.anderzone_pods (owner_id);

insert into public.anderzone_regions (id, title, playable, mood)
values
  ('anderzone-central', 'ANDERZONE CENTRAL', true, 'Playable hub'),
  ('home-pod', 'Home Pod', true, 'Private starter room'),
  ('pixel-paradise', 'Pixel Paradise', false, 'Defined, not playable'),
  ('whisper-woods', 'Whisper Woods', false, 'Defined, not playable'),
  ('outer-grid', 'Outer Grid', false, 'Defined, not playable'),
  ('underground', 'Underground', false, 'Defined, not playable'),
  ('null-zone', 'Null Zone', false, 'Defined, not playable')
on conflict (id) do update set title = excluded.title, playable = excluded.playable, mood = excluded.mood;

insert into public.anderzone_furniture_catalog (id, label, width_tiles, height_tiles)
values
  ('bed', 'Pet Bed', 1, 1),
  ('lamp', 'Signal Lamp', 1, 1),
  ('table', 'Low Table', 2, 1),
  ('cushion', 'Floor Cushion', 1, 1),
  ('plant', 'Orbit Plant', 1, 1)
on conflict (id) do update set label = excluded.label;

alter table public.anderzone_profiles enable row level security;
alter table public.anderzone_regions enable row level security;
alter table public.anderzone_furniture_catalog enable row level security;
alter table public.anderzone_pods enable row level security;
alter table public.anderzone_inventory enable row level security;
alter table public.anderzone_dooboos enable row level security;

drop policy if exists "anderzone regions are readable" on public.anderzone_regions;
create policy "anderzone regions are readable" on public.anderzone_regions
  for select to anon, authenticated using (true);

drop policy if exists "anderzone catalog is readable" on public.anderzone_furniture_catalog;
create policy "anderzone catalog is readable" on public.anderzone_furniture_catalog
  for select to anon, authenticated using (true);

drop policy if exists "anderzone profile owner read" on public.anderzone_profiles;
create policy "anderzone profile owner read" on public.anderzone_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "anderzone profile owner insert" on public.anderzone_profiles;
create policy "anderzone profile owner insert" on public.anderzone_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "anderzone profile owner update" on public.anderzone_profiles;
create policy "anderzone profile owner update" on public.anderzone_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "anderzone pod owner all" on public.anderzone_pods;
create policy "anderzone pod owner all" on public.anderzone_pods
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "anderzone public pods are readable" on public.anderzone_pods;
create policy "anderzone public pods are readable" on public.anderzone_pods
  for select to authenticated using (visitor_access = 'public');

drop policy if exists "anderzone inventory owner all" on public.anderzone_inventory;
create policy "anderzone inventory owner all" on public.anderzone_inventory
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "anderzone dooboo owner all" on public.anderzone_dooboos;
create policy "anderzone dooboo owner all" on public.anderzone_dooboos
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant select on public.anderzone_regions, public.anderzone_furniture_catalog to anon, authenticated;
grant select, insert, update on public.anderzone_profiles to authenticated;
grant select, insert, update, delete on public.anderzone_pods, public.anderzone_inventory, public.anderzone_dooboos to authenticated;
