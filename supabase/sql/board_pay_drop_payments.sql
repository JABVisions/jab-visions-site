-- Pay Drop Payments (Stripe webhook fulfillment)
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.
-- Used by app/api/paydrops/stripe/webhook/route.ts via the service role.

create table if not exists public.pay_drop_payments (
  id text primary key,                 -- stripe checkout session id
  pay_drop_id text,
  amount_total integer,
  currency text,
  recipient_account text,
  status text,
  created_at timestamptz default now()
);

create index if not exists pay_drop_payments_pay_drop_created_idx
  on public.pay_drop_payments (pay_drop_id, created_at desc);

alter table public.pay_drop_payments enable row level security;

-- Service role writes from the webhook. Authenticated users can read their own
-- rows when recipient_account is stamped; until then only service role sees all.
drop policy if exists "service role full access" on public.pay_drop_payments;
-- No broad authenticated read: webhook uses service role. Add creator policies later
-- when recipient_account is consistently populated from Connect account ids.
