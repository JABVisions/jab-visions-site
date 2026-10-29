-- Allow every Ryder currently available in the game to post a raid score.
alter table public.ryderz_raid_leaderboard
  drop constraint if exists ryderz_raid_leaderboard_ryder_id_check;

alter table public.ryderz_raid_leaderboard
  add constraint ryderz_raid_leaderboard_ryder_id_check
  check (ryder_id in (
    'rubi', 'leo', 'aaron', 'zoe', 'keven', 'lilly',
    'kid-paranormal', 'agent-nyx', 'marilyn-monroe',
    'martin-luther-king', 'marywantis', 'tj'
  ));

notify pgrst, 'reload schema';
