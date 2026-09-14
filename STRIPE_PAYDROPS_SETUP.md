# Board Pay Drops — Stripe setup

Board Pay Drops use Stripe Connect Accounts v2 with this configuration:

- Dashboard: Express (lightweight creator payout view)
- Fee collection: Board manages pricing
- Negative balance liability: Board
- Charge pattern: destination charges
- Onboarding: Stripe-hosted account onboarding from Options → Banking

A buyer pays through Stripe Checkout. Stripe routes the creator's share to the
creator's connected account and records the result through a signed webhook.
The unused legacy Authorize.Net endpoints were removed; previously saved legacy
Pay Drops still normalize to Stripe Connect in the client data model.

## 1. Create the payment tables

In Supabase Dashboard → SQL Editor, run:

`supabase/sql/board_pay_drops.sql`

The migration creates:

- `pay_drop_accounts` for the server-owned creator/account mapping and safe bank status.
- `pay_drop_payments` for pending, paid, refunded, and disputed payment records.
- `pay_drop_webhook_events` for idempotent webhook processing.

Clients can read only their own relevant records and cannot write payment state.

## 2. Configure environment variables

Set these locally in `.env.local` and in the production Vercel project:

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Server-side Stripe key. Prefer a restricted key with only the required Connect, Checkout, Balance, Account, Transfer, and webhook-related access. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret for the production Pay Drop webhook endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only access for account mappings and the payment ledger. |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical origin, such as `https://jabvisions.com`. |
| `BOARD_PLATFORM_FEE_BPS` | Yes | Board fee in basis points: `1000` = 10%, `500` = 5%, `0` = no fee. |
| `BOARD_STRIPE_DEFAULT_COUNTRY` | No | Two-letter onboarding country; defaults to `us`. |

Never expose the Stripe secret key, webhook secret, or Supabase service-role key
through a `NEXT_PUBLIC_` variable.

## 3. Finish Connect setup in Stripe

In Stripe Dashboard:

1. Activate Connect and complete the platform profile.
2. Add Board branding and the public business/support details Stripe requests.
3. Configure the payment methods accepted by Checkout. The code intentionally
   uses Stripe's dynamic payment methods instead of hard-coding card types.
4. Review Radar for Platforms and payout settings.

Creators connect or update their payout method from Board → Options → Banking.
They manage payout schedule and eligible instant payout options through their
Stripe Express dashboard.

## 4. Register the webhook

Create a webhook endpoint:

`https://YOUR_DOMAIN/api/paydrops/stripe/webhook`

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`
- `charge.dispute.created`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

For local testing:

```bash
stripe listen --forward-to localhost:3000/api/paydrops/stripe/webhook
```

## 5. Test before live mode

1. Sign in as a creator and complete Banking onboarding in Stripe test mode.
2. Confirm Banking shows the masked payout account and a ready status.
3. Create a Pay Drop.
4. Sign in as a different Board user and purchase it with Stripe's test card
   `4242 4242 4242 4242`, any future expiry, and any CVC.
5. Confirm the payment appears in Stripe, the destination account receives the
   creator share, and Banking shows the pending/available balance and ledger row.
6. Test a refund and a dispute webhook.

Do not switch to live keys until every step passes in test mode.

## Fee warning

With destination charges, Board pays Stripe processing fees. If
`BOARD_PLATFORM_FEE_BPS` is zero or below Stripe's processing cost, Board's
margin on Pay Drops can be negative. Confirm current rates at
https://stripe.com/pricing and monitor Connect margin reporting before launch.
