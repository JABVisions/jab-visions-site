# Pay Drops → Stripe Connect — Setup & Status

Pay Drops now run on **Stripe Connect (Express)** with **destination charges**: a
supporter checks out on Stripe-hosted Checkout, the platform processes the
payment, and funds transfer immediately to the recipient's connected account.
An optional platform fee is supported.

> ⚠️ I could not `npm install` or run a build in this environment, so the
> Stripe SDK code is written against the official docs but **untested**. Do the
> setup below, then run a local build before deploying.

## 1. Install + environment

```bash
npm install            # picks up "stripe" (added to package.json)
```

Set these env vars (Vercel project + `.env.local`):

| Variable | Required | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | `sk_test_…` while testing, `sk_live_…` in production |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `https://board.jabvisions.com` — used for return/success URLs |
| `BOARD_PLATFORM_FEE_BPS` | no | Platform fee in basis points (e.g. `250` = 2.5%). **Default 0 = no fee.** |
| `STRIPE_WEBHOOK_SECRET` | for fulfillment | `whsec_…` once you add the webhook (below) |

Then in the Stripe Dashboard: enable **Connect**, complete the platform profile,
and set Connect branding (name/icon/color) — Express onboarding requires it.

## 2. What's wired up

- `lib/stripe/server.ts` — server Stripe client + platform-fee helpers.
- `POST /api/paydrops/stripe/connect` — create/link an **Express** account, return a
  one-time onboarding URL. `GET ?accountId=` — returns `chargesEnabled` /
  `payoutsEnabled` / `detailsSubmitted`.
- `POST /api/paydrops/stripe/checkout` — Checkout Session as a **destination charge**
  (`transfer_data.destination` + optional `application_fee_amount`).
- `lib/board/payCheckout.ts` — `openHostedPayDropCheckout` now redirects to Stripe Checkout.
- `lib/board/paydrops.ts` — provider model migrated to `stripe_connect` (legacy
  Authorize.Net drops migrate forward; external payment links unchanged).
- Composers (`DropTile`, `DropConsole`) — "Pay on Board" provider + Stripe copy.
- Options → Banking — processor is **Stripe Connect**; "Connect" starts onboarding.
- Privacy/Terms — processor language updated to Stripe (please have counsel review).

## 3. Architecture choices (change if you prefer)

- **Account type:** Express (Stripe-hosted onboarding; BOARD is the platform).
- **Charge model:** Destination charge with `application_fee_amount`.
- **Platform fee:** configurable, **defaults to 0** so nothing is taken until you set it.

Stripe now recommends the **Accounts v2 API** for brand-new platforms; this uses
the well-supported v1 Express path. Switch later if you want v2.

## 4. Banking control center

Options → Banking is now the Pay Drop control center:

- Live Stripe Connect status, available/pending balances, and truthful automatic payouts (no fake cash-out).
- `GET/PATCH /api/paydrops/banking`, `POST /api/paydrops/register`, `POST /api/paydrops/stripe/login-link`.
- Checkout looks up the Pay Drop server-side. Do not send amount or destination from the client.
- Webhook updates `pay_drop_transactions` on paid / failed / refunded / account.updated.
- Paste `supabase/sql/board_pay_drops.sql` so profiles, Pay Drops, and history persist.

## 5. Still TODO

1. **Paste `supabase/sql/board_pay_drops.sql`** in the Board Supabase SQL editor so Banking profiles, Pay Drops, and history persist.
2. **Stripe Dashboard webhook** — `https://www.jabvisions.com/api/paydrops/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `account.updated`.
3. **Consolidate duplicated provider labels** — a few older "National Bankcard" strings remain in non-critical Work Desk copy.
4. **Remove the legacy Authorize.Net routes** (`app/api/paydrops/authorize-net/**`)
   once you confirm nothing depends on them.

## 5. Test checklist (local)

- `npm run build` passes.
- Options → Banking → Connect → completes Stripe Express onboarding (test mode).
- Create a Pay Drop → checkout → Stripe test card `4242…` → funds show on the
  connected account in the Stripe test dashboard.
