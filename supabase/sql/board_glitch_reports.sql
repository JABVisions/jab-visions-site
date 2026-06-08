create table if not exists public.board_glitch_reports (
  id text primary key,
  created_at timestamptz not null default now(),
  page text not null,
  severity text not null,
  description text not null,
  optional_link text,
  user_agent text,
  current_path text,
  reporter_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'new',
  source text not null default 'board_beta',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists board_glitch_reports_created_idx
  on public.board_glitch_reports (created_at desc);

create index if not exists board_glitch_reports_status_created_idx
  on public.board_glitch_reports (status, created_at desc);

alter table public.board_glitch_reports enable row level security;

drop policy if exists "anyone can submit board glitch reports" on public.board_glitch_reports;
create policy "anyone can submit board glitch reports"
  on public.board_glitch_reports
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "authenticated users can view own board glitch reports" on public.board_glitch_reports;
create policy "authenticated users can view own board glitch reports"
  on public.board_glitch_reports
  for select
  to authenticated
  using (reporter_user_id = auth.uid());

grant insert on public.board_glitch_reports to anon, authenticated;
grant select on public.board_glitch_reports to authenticated;

notify pgrst, 'reload schema';
