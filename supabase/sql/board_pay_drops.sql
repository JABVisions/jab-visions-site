-- Pay Drop banking + transactions.
-- Paste in Supabase SQL Editor. Safe to re-run.
-- RLS: owners see their own banking profile and transactions they send or receive.

create table if not exists public.board_banking_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  onboarding_complete boolean not null default false,
  verification_status text not null default 'not_connected',
  payout_interval text,
  default_amount_cents integer not null default 2500,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.board_pay_drops (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  amount_cents integer not null,
  currency text not null default 'usd',
  provider text not null default 'stripe_connect',
  recipient_stripe_account_id text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint board_pay_drops_amount_positive check (amount_cents > 0)
);

create table if not exists public.pay_drop_transactions (
  id text primary key,
  pay_drop_id text,
  payer_id uuid,
  recipient_id uuid,
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  platform_fee_cents integer not null default 0,
  creator_amount_cents integer not null default 0,
  payment_status text not null default 'pending',
  payout_status text not null default 'pending',
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists pay_drop_transactions_recipient_idx
  on public.pay_drop_transactions (recipient_id, created_at desc);
create index if not exists pay_drop_transactions_payer_idx
  on public.pay_drop_transactions (payer_id, created_at desc);
create index if not exists board_pay_drops_owner_idx
  on public.board_pay_drops (owner_id, created_at desc);
create index if not exists pay_drop_transactions_payment_intent_idx
  on public.pay_drop_transactions (stripe_payment_intent);

alter table public.board_banking_profiles enable row level security;
alter table public.board_pay_drops enable row level security;
alter table public.pay_drop_transactions enable row level security;

drop policy if exists "own banking profile" on public.board_banking_profiles;
create policy "own banking profile"
  on public.board_banking_profiles for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "read own or public pay drops" on public.board_pay_drops;
create policy "read own or public pay drops"
  on public.board_pay_drops for select
  to authenticated
  using (true);

drop policy if exists "insert own pay drops" on public.board_pay_drops;
create policy "insert own pay drops"
  on public.board_pay_drops for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "update own pay drops" on public.board_pay_drops;
create policy "update own pay drops"
  on public.board_pay_drops for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "read own pay drop transactions" on public.pay_drop_transactions;
create policy "read own pay drop transactions"
  on public.pay_drop_transactions for select
  to authenticated
  using (
    (select auth.uid()) = recipient_id
    or (select auth.uid()) = payer_id
  );

grant select, insert, update on public.board_banking_profiles to authenticated;
grant select, insert, update on public.board_pay_drops to authenticated;
grant select on public.pay_drop_transactions to authenticated;
