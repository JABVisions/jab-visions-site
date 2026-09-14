-- Run once in Supabase Dashboard -> SQL Editor before enabling Pay Drops.
-- Payment account identifiers and ledger rows are server-owned. Clients can
-- read only the safe records that belong to them and cannot insert/update them.

create table if not exists public.pay_drop_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  livemode boolean not null default false,
  dashboard_mode text not null default 'express',
  transfers_status text not null default 'pending',
  payouts_status text not null default 'pending',
  requirements_due jsonb not null default '[]'::jsonb,
  bank_name text,
  bank_last4 text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pay_drop_accounts_dashboard_check check (dashboard_mode in ('express')),
  constraint pay_drop_accounts_transfer_status_check check (
    transfers_status in ('active', 'pending', 'restricted', 'unsupported')
  ),
  constraint pay_drop_accounts_payout_status_check check (
    payouts_status in ('active', 'pending', 'restricted', 'unsupported')
  )
);

create table if not exists public.pay_drop_payments (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_dispute_id text,
  pay_drop_id text not null,
  buyer_user_id uuid references public.profiles(id) on delete set null,
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  amount_total integer not null check (amount_total > 0),
  platform_fee_amount integer not null default 0 check (platform_fee_amount >= 0),
  creator_net_amount integer not null check (creator_net_amount >= 0),
  currency text not null default 'usd',
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pay_drop_payments_status_check check (
    status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed')
  )
);

create index if not exists pay_drop_payments_recipient_created_idx
  on public.pay_drop_payments (recipient_user_id, created_at desc);
create index if not exists pay_drop_payments_buyer_created_idx
  on public.pay_drop_payments (buyer_user_id, created_at desc);
create index if not exists pay_drop_payments_pay_drop_idx
  on public.pay_drop_payments (pay_drop_id);

create table if not exists public.pay_drop_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default timezone('utc', now())
);

alter table public.pay_drop_accounts enable row level security;
alter table public.pay_drop_payments enable row level security;
alter table public.pay_drop_webhook_events enable row level security;

drop policy if exists "users can read own Pay Drop account" on public.pay_drop_accounts;
create policy "users can read own Pay Drop account"
  on public.pay_drop_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "participants can read Pay Drop payments" on public.pay_drop_payments;
create policy "participants can read Pay Drop payments"
  on public.pay_drop_payments for select to authenticated
  using (
    (select auth.uid()) = buyer_user_id
    or (select auth.uid()) = recipient_user_id
  );

grant select on public.pay_drop_accounts to authenticated;
grant select on public.pay_drop_payments to authenticated;
revoke all on public.pay_drop_webhook_events from anon, authenticated;
