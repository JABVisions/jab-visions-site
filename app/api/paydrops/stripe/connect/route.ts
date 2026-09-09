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
import { supabaseServer } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

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

function notSignedIn() {
  return NextResponse.json(
    { ok: false, error: "Sign in to your Board account to set up Pay Drops." },
    { status: 401 }
  );
}

// Onboarding is creator-only: require a session and return the connected
// account id already saved on the caller's profile (if any).
async function requireUserWithAccount() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("board_style")
    .eq("id", user.id)
    .maybeSingle();

  const style =
    profile?.board_style && typeof profile.board_style === "object"
      ? (profile.board_style as Record<string, unknown>)
      : {};
  const savedAccountId =
    typeof style.stripeAccountId === "string" ? style.stripeAccountId.trim() : "";

  return { user, savedAccountId };
}

// Keep return/refresh redirects on our own origin.
function safeReturnUrl(path: unknown, fallback: string, appUrl: string) {
  const origin = new URL(appUrl).origin;
  const raw = typeof path === "string" ? path.trim() : "";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const resolved = new URL(raw, origin);
    if (resolved.origin === origin) return resolved.toString();
  }
  return new URL(fallback, origin).toString();
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.connect);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return notConfigured();

  const auth = await requireUserWithAccount();
  if (!auth) return notSignedIn();

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const returnUrl = safeReturnUrl(body.returnPath, "/board/options", appUrl);
  const refreshUrl = safeReturnUrl(body.refreshPath, "/board/options", appUrl);

  try {
    // Only reuse an account id that is actually saved on the caller's own
    // profile — a client-supplied id for someone else's account is ignored.
    let accountId =
      auth.savedAccountId &&
      auth.savedAccountId === String(body.accountId ?? "").trim()
        ? auth.savedAccountId
        : auth.savedAccountId || "";

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: auth.user.email || body.email?.trim() || undefined,
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
  const limited = await enforceRateLimit(req, RATE_LIMITS.connect);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return notConfigured();

  const auth = await requireUserWithAccount();
  if (!auth) return notSignedIn();

  const accountId = req.nextUrl.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: "accountId is required." },
      { status: 400 }
    );
  }

  // Status lookups are limited to the caller's own connected account.
  if (accountId !== auth.savedAccountId) {
    return NextResponse.json(
      { ok: false, error: "You can only check your own Pay Drops account." },
      { status: 403 }
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
