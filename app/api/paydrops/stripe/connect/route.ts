// File: app/api/paydrops/stripe/connect/route.ts
// Stripe Connect onboarding for Pay Drop recipients (Express accounts).
//
// POST  -> create (or reuse) an Express connected account and return a one-time
//          onboarding Account Link URL. The client persists the returned
//          accountId onto the creator's profile (board_style.stripeAccountId).
// GET    ?accountId=acct_… -> return onboarding/payout status flags.
//
// Requires: STRIPE_SECRET_KEY, a Connect-enabled platform, and NEXT_PUBLIC_APP_URL.

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

type PostBody = {
  accountId?: string;
  email?: string;
  returnPath?: string;
  refreshPath?: string;
};

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Stripe is not configured yet. Add STRIPE_SECRET_KEY and enable Connect to accept Pay Drops.",
    },
    { status: 503 }
  );
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return notConfigured();

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const returnUrl = new URL(body.returnPath || "/board/options", appUrl).toString();
  const refreshUrl = new URL(body.refreshPath || "/board/options", appUrl).toString();

  try {
    let accountId = String(body.accountId ?? "").trim();

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: body.email?.trim() || undefined,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: "individual",
        metadata: { board_role: "paydrop_recipient" },
      });
      accountId = account.id;
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ ok: true, accountId, url: link.url });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not start Stripe onboarding.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return notConfigured();

  const accountId = req.nextUrl.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: "accountId is required." },
      { status: 400 }
    );
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const requirementsDue = [
      ...(account.requirements?.currently_due ?? []),
      ...(account.requirements?.past_due ?? []),
    ];

    return NextResponse.json({
      ok: true,
      accountId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      disabledReason: account.requirements?.disabled_reason ?? null,
      requirementsDue,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load Stripe status.",
      },
      { status: 500 }
    );
  }
}
