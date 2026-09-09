// File: app/api/paydrops/stripe/checkout/route.ts
// Create a Stripe Checkout Session for a Pay Drop as a DESTINATION CHARGE:
// the platform processes the payment and immediately transfers the funds to the
// recipient's connected account, optionally keeping an application fee.
//
// POST body: { payDropId, title, description?, amountCents, destinationAccountId,
//              recipientLabel?, successPath?, cancelPath? }
// Returns:   { ok, url } — redirect the buyer to `url`.
//
// Fulfillment (marking a Pay Drop as paid) should be handled by a
// `checkout.session.completed` webhook — see SETUP notes in the migration doc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applicationFeeCents, getStripe } from "@/lib/stripe/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Buyers can be anonymous (public profile Pay Drops), so this route stays
// reachable without a session — input hardening below is the security boundary.
const MIN_AMOUNT_CENTS = 50; // Stripe's own minimum for USD
const MAX_AMOUNT_CENTS = 1_000_000; // $10,000 cap per Pay Drop

type Body = {
  payDropId?: string;
  title?: string;
  description?: string;
  amountCents?: number;
  destinationAccountId?: string;
  recipientLabel?: string;
  successPath?: string;
  cancelPath?: string;
};

// Resolve a client-supplied path against the app origin, refusing anything
// that would redirect off-site (protocol-relative URLs, absolute URLs, etc).
function safeReturnUrl(path: unknown, fallback: string, appUrl: string) {
  const origin = new URL(appUrl).origin;
  const raw = typeof path === "string" ? path.trim() : "";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const resolved = new URL(raw, origin);
    if (resolved.origin === origin) return resolved.toString();
  }
  return new URL(fallback, origin).toString();
}

// A destination account is only payable if some Board profile has claimed it
// via Stripe Connect onboarding (profiles.board_style.stripeAccountId).
async function destinationBelongsToProfile(accountId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("board_style->>stripeAccountId", accountId)
    .limit(1)
    .maybeSingle();

  return !error && !!data;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.checkout);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Stripe is not configured yet. Add STRIPE_SECRET_KEY to accept Pay Drops.",
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const amountCents = Number(body.amountCents ?? 0);
  const destination = String(body.destinationAccountId ?? "").trim();
  const title =
    String(body.title ?? "Pay Drop").trim().slice(0, 120) || "Pay Drop";

  if (
    !Number.isInteger(amountCents) ||
    amountCents < MIN_AMOUNT_CENTS ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Amount must be between $${(MIN_AMOUNT_CENTS / 100).toFixed(2)} and $${(
          MAX_AMOUNT_CENTS / 100
        ).toLocaleString()}.`,
      },
      { status: 400 }
    );
  }

  if (destination) {
    if (!/^acct_[A-Za-z0-9]+$/.test(destination)) {
      return NextResponse.json(
        { ok: false, error: "Invalid recipient account." },
        { status: 400 }
      );
    }
    if (!(await destinationBelongsToProfile(destination))) {
      return NextResponse.json(
        { ok: false, error: "This Pay Drop recipient isn't connected on the Board." },
        { status: 403 }
      );
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const successUrl = safeReturnUrl(
    body.successPath,
    "/board/feed?paydrop=success",
    appUrl
  );
  const cancelUrl = safeReturnUrl(
    body.cancelPath,
    "/board/feed?paydrop=cancelled",
    appUrl
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: title,
              ...(body.description?.trim()
                ? { description: body.description.trim().slice(0, 240) }
                : {}),
            },
          },
        },
      ],
      payment_intent_data: {
        // If the recipient has a connected Stripe account, route the funds there
        // (destination charge + optional platform fee). Otherwise the charge
        // settles on the platform Stripe account — checkout still works either way.
        ...(destination
          ? {
              transfer_data: { destination },
              ...(applicationFeeCents(amountCents) > 0
                ? { application_fee_amount: applicationFeeCents(amountCents) }
                : {}),
            }
          : {}),
        metadata: {
          payDropId: String(body.payDropId ?? "").slice(0, 64),
          recipient: body.recipientLabel?.slice(0, 120) ?? "",
        },
      },
      metadata: {
        payDropId: String(body.payDropId ?? "").slice(0, 64),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not open Stripe checkout.",
      },
      { status: 500 }
    );
  }
}
