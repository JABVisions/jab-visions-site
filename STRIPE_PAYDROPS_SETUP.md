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

## 4. Still TODO (not done here)

1. **Webhook for fulfillment** — add `POST /api/paydrops/stripe/webhook` handling
   `checkout.session.completed` to mark a Pay Drop paid / record the transaction.
   Don't rely on the browser redirect for fulfillment.
2. **Store the connected account id** — persist the recipient's `acct_…` on their
   profile when onboarding returns, and stamp it onto each Pay Drop so the buyer's
   checkout can route funds (`destinationAccountId`). Until then, checkout returns
   a friendly "recipient hasn't connected payout" message.
3. **Consolidate duplicated provider logic** — `profile/page.tsx`,
   `profile/[username]/page.tsx`, `PayDropsPanel`, `PayDropsMiniPanel`, and
   `WorkDesk` still carry their own copies + a few "National Bankcard" strings in
   non-critical labels. They compile and route through the new Stripe seam, but
   should be unified onto `lib/board/paydrops.ts` + `dropFlavors`-style shared types.
4. **Remove the legacy Authorize.Net routes** (`app/api/paydrops/authorize-net/**`)
   once you confirm nothing depends on them.

## 5. Test checklist (local)

- `npm run build` passes.
- Options → Banking → Connect → completes Stripe Express onboarding (test mode).
- Create a Pay Drop → checkout → Stripe test card `4242…` → funds show on the
  connected account in the Stripe test dashboard.
