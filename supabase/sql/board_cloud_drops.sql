-- Cloud sync for Board drops that previously lived only in localStorage.
-- Run this in the Supabase SQL editor, then refresh Board.
--
-- Tables:
--   board_universal_drops : the personal drops bucket (jab_board_drops_v2)
--   board_pay_drops       : Pay Drops (jab_board_pay_drops_v2)
--
-- Both store the full client payload as jsonb so the client schema can evolve
-- without further migrations. RLS: owners only.

-- ---------------------------------------------------------------------------
-- Universal drops
-- ---------------------------------------------------------------------------

create table if not exists public.board_universal_drops (
  id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists board_universal_drops_user_updated_idx
  on public.board_universal_drops (user_id, updated_at desc);

alter table public.board_universal_drops enable row level security;

drop policy if exists "universal_drops_select_own" on public.board_universal_drops;
create policy "universal_drops_select_own"
  on public.board_universal_drops for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "universal_drops_insert_own" on public.board_universal_drops;
create policy "universal_drops_insert_own"
  on public.board_universal_drops for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "universal_drops_update_own" on public.board_universal_drops;
create policy "universal_drops_update_own"
  on public.board_universal_drops for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "universal_drops_delete_own" on public.board_universal_drops;
create policy "universal_drops_delete_own"
  on public.board_universal_drops for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Pay Drops
-- ---------------------------------------------------------------------------

create table if not exists public.board_pay_drops (
  id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists board_pay_drops_user_updated_idx
  on public.board_pay_drops (user_id, updated_at desc);

alter table public.board_pay_drops enable row level security;

drop policy if exists "pay_drops_select_own" on public.board_pay_drops;
create policy "pay_drops_select_own"
  on public.board_pay_drops for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "pay_drops_insert_own" on public.board_pay_drops;
create policy "pay_drops_insert_own"
  on public.board_pay_drops for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "pay_drops_update_own" on public.board_pay_drops;
create policy "pay_drops_update_own"
  on public.board_pay_drops for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pay_drops_delete_own" on public.board_pay_drops;
create policy "pay_drops_delete_own"
  on public.board_pay_drops for delete
  to authenticated
  using (auth.uid() = user_id);
