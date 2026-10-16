-- Pay Drop connected accounts (Stripe Connect)
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.
-- Used by app/api/paydrops/stripe/webhook/route.ts on `account.updated`, via the
-- service role.
--
-- The webhook already swallows a missing-table error, so Board works without
-- this table; the effect of not having it is that connected-account capability
-- changes are never recorded and Options -> Banking cannot show payout status
-- from anything but a live Stripe call.

create table if not exists public.pay_drop_accounts (
  account_id      text primary key,   -- stripe acct_… id
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.pay_drop_accounts enable row level security;

-- No policies on purpose. These rows hold payout capability flags that no
-- browser client needs, and the only writer is the webhook's service-role
-- client, which bypasses RLS. Enabling RLS with zero policies denies anon and
-- authenticated access outright; add a narrow owner-read policy here if the UI
-- ever needs to read payout status without calling Stripe.
