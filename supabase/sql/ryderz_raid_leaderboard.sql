create table if not exists public.ryderz_raid_leaderboard (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  display_name text not null check (char_length(display_name) between 1 and 16),
  ryder_id text not null check (ryder_id in ('rubi', 'leo', 'aaron', 'zoe', 'keven', 'lilly', 'kid-paranormal', 'agent-nyx')),
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard', 'nightmare')),
  result text not null check (result in ('victory', 'defeat')),
  wave_reached integer not null check (wave_reached between 1 and 999),
  kills integer not null check (kills between 0 and 100000),
  damage integer not null check (damage between 0 and 100000000),
  score bigint generated always as (
    floor(
      (wave_reached::numeric * 1000000000
        + kills::numeric * 1000
        + least(damage, 999999)::numeric)
      * case difficulty
          when 'easy' then 1.00
          when 'normal' then 1.15
          when 'hard' then 1.30
          when 'nightmare' then 1.50
        end
    )::bigint
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists ryderz_raid_leaderboard_score_idx
  on public.ryderz_raid_leaderboard (score desc, created_at asc);

alter table public.ryderz_raid_leaderboard enable row level security;

drop policy if exists "public can read raid leaderboard" on public.ryderz_raid_leaderboard;
create policy "public can read raid leaderboard"
  on public.ryderz_raid_leaderboard
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public can submit raid leaderboard runs" on public.ryderz_raid_leaderboard;
create policy "public can submit raid leaderboard runs"
  on public.ryderz_raid_leaderboard
  for insert
  to anon, authenticated
  with check (true);

grant select, insert on public.ryderz_raid_leaderboard to anon, authenticated;

notify pgrst, 'reload schema';
