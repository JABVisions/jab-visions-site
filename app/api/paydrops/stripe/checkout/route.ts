import { NextRequest, NextResponse } from "next/server";
import { applicationFeeCents, getStripe } from "@/lib/stripe/server";
import {
  creatorAmountCents,
  lookupPayDropForCheckout,
  requireBankingUser,
  styleStripeAccountId,
  bankingServiceSupabase,
} from "@/lib/board/banking/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "Stripe is not configured yet." },
      { status: 503 }
    );
  }

  const { supabase, user } = await requireBankingUser();
  const body = (await req.json().catch(() => ({}))) as {
    payDropId?: string;
    successPath?: string;
    cancelPath?: string;
  };
  const payDropId = String(body.payDropId ?? "").trim();
  if (!payDropId) {
    return NextResponse.json({ ok: false, error: "A Pay Drop is required." }, { status: 400 });
  }

  const drop = await lookupPayDropForCheckout(payDropId);
  if (!drop) {
    return NextResponse.json({ ok: false, error: "This Pay Drop could not be found." }, { status: 404 });
  }

  const amountCents = Math.round(Number(drop.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "This Pay Drop is missing a valid price." }, { status: 400 });
  }

  if (drop.provider === "payment_link") {
    return NextResponse.json(
      { ok: false, error: "This Pay Drop uses an external payment link." },
      { status: 400 }
    );
  }

  let destination =
    typeof drop.recipient_stripe_account_id === "string"
      ? drop.recipient_stripe_account_id.trim()
      : "";
  if (!destination && drop.owner_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("board_style")
      .eq("id", drop.owner_id)
      .maybeSingle();
    destination = styleStripeAccountId(profile?.board_style) || "";
    const db = bankingServiceSupabase();
    if (!destination && db) {
      const { data: banking } = await db
        .from("board_banking_profiles")
        .select("stripe_account_id, charges_enabled, payouts_enabled")
        .eq("user_id", drop.owner_id)
        .maybeSingle();
      destination =
        typeof banking?.stripe_account_id === "string" ? banking.stripe_account_id.trim() : "";
      if (!banking?.charges_enabled && !banking?.payouts_enabled && !destination) {
        return NextResponse.json(
          { ok: false, error: "This creator has not finished Banking setup." },
          { status: 409 }
        );
      }
    }
  }

  if (!destination) {
    return NextResponse.json(
      { ok: false, error: "This creator has not finished Banking setup." },
      { status: 409 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const successUrl = new URL(body.successPath || "/board/feed?paydrop=success", appUrl).toString();
  const cancelUrl = new URL(body.cancelPath || "/board/feed?paydrop=cancelled", appUrl).toString();
  const title = String(drop.title ?? "Pay Drop").trim() || "Pay Drop";
  const fee = applicationFeeCents(amountCents);

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
              ...(drop.description
                ? { description: String(drop.description).slice(0, 240) }
                : {}),
            },
          },
        },
      ],
      payment_intent_data: {
        transfer_data: { destination },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
        metadata: {
          payDropId,
          recipientUserId: String(drop.owner_id ?? ""),
          payerUserId: user?.id ?? "",
        },
      },
      metadata: {
        payDropId,
        recipientUserId: String(drop.owner_id ?? ""),
        payerUserId: user?.id ?? "",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const db = bankingServiceSupabase();
    if (db) {
      await db.from("pay_drop_transactions").upsert(
        {
          id: session.id,
          pay_drop_id: payDropId,
          payer_id: user?.id ?? null,
          recipient_id: drop.owner_id ?? null,
          stripe_session_id: session.id,
          amount_cents: amountCents,
          currency: "usd",
          platform_fee_cents: fee,
          creator_amount_cents: creatorAmountCents(amountCents),
          payment_status: "pending",
          payout_status: "pending",
          title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }

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
