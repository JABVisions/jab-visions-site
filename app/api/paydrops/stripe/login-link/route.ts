import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { loadBankingSnapshot, requireBankingUser } from "@/lib/board/banking/server";

export const runtime = "nodejs";

export async function POST() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured." }, { status: 503 });
  }
  const { user } = await requireBankingUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to manage Banking." }, { status: 401 });
  }
  const snapshot = await loadBankingSnapshot(user.id);
  if (!snapshot.stripeAccountId) {
    return NextResponse.json({ ok: false, error: "Connect Banking first." }, { status: 400 });
  }
  try {
    const link = await stripe.accounts.createLoginLink(snapshot.stripeAccountId);
    return NextResponse.json({ ok: true, url: link.url });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not open payout settings.",
      },
      { status: 500 }
    );
  }
}
