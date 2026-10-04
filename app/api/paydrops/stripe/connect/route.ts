import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import {
  loadBankingSnapshot,
  persistStripeAccountId,
  requireBankingUser,
  upsertBankingProfileRow,
} from "@/lib/board/banking/server";

export const runtime = "nodejs";

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      error: "Stripe is not configured yet. Add the server Stripe key and enable Connect to accept Pay Drops.",
    },
    { status: 503 }
  );
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return notConfigured();

  const { supabase, user, configured } = await requireBankingUser();
  if (!configured || !supabase) {
    return NextResponse.json({ ok: false, error: "Banking is not connected on this server yet." }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to set up Banking." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    returnPath?: string;
    refreshPath?: string;
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const returnUrl = new URL(body.returnPath || "/board/options?tab=banking&pay=continue", appUrl).toString();
  const refreshUrl = new URL(body.refreshPath || "/board/options?tab=banking", appUrl).toString();

  try {
    const current = await loadBankingSnapshot(user.id);
    let accountId = current.stripeAccountId || "";

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email || undefined,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: "individual",
        metadata: { board_role: "paydrop_recipient", board_user_id: user.id },
      });
      accountId = account.id;
    }

    await persistStripeAccountId(supabase, user.id, accountId);
    await upsertBankingProfileRow({
      userId: user.id,
      stripeAccountId: accountId,
      verificationStatus: current.state === "not_connected" ? "setup_incomplete" : current.state,
    });

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

export async function GET() {
  const { user, configured } = await requireBankingUser();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "Banking is not connected on this server yet." }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to check Banking." }, { status: 401 });
  }
  const snapshot = await loadBankingSnapshot(user.id);
  return NextResponse.json({ ok: true, ...snapshot });
}
