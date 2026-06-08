// File: lib/stripe/server.ts
// Server-only Stripe client for BOARD Pay Drops (Stripe Connect).
//
// SETUP (required before this works):
//   1) `npm install stripe`
//   2) Set STRIPE_SECRET_KEY in your environment (Vercel project env + .env.local).
//      Use a test key (sk_test_…) until you go live.
//   3) Register your platform for Connect in the Stripe Dashboard and complete
//      the platform profile + branding.
//
// Never import this from a client component — it holds the secret key.

import Stripe from "stripe";

let cached: Stripe | null = null;

/** Returns the configured Stripe client, or null if the secret key is missing. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (cached) return cached;
  cached = new Stripe(key, {
    // Pin a version so behavior is stable; bump intentionally.
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    appInfo: { name: "BOARD Pay Drops" },
  });
  return cached;
}

/** Platform fee in basis points (e.g. 250 = 2.5%). Default 0 = no platform fee. */
export function platformFeeBps(): number {
  const raw = Number(process.env.BOARD_PLATFORM_FEE_BPS ?? "0");
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 5000); // hard cap 50% for safety
}

/** Compute the application_fee_amount (in cents) for a given charge amount. */
export function applicationFeeCents(amountCents: number): number {
  const fee = Math.floor((amountCents * platformFeeBps()) / 10000);
  // Never exceed the charge amount.
  return Math.max(0, Math.min(fee, amountCents));
}
