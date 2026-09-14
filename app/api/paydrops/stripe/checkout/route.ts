import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolvePayDrop } from "@/lib/board/server/payDrops";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  applicationFeeCents,
  checkoutIntegrationIdentifier,
  getStripe,
} from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  payDropId?: string;
  recipientUserId?: string;
  checkoutAttemptId?: string;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const db = getSupabaseAdmin();
  if (!stripe || !db) {
    return jsonError("Pay Drop checkout is not configured yet.", 503);
  }

  const supabase = supabaseServer();
  const {
    data: { user: buyer },
  } = await supabase.auth.getUser();
  if (!buyer) return jsonError("Sign in to purchase this Pay Drop.", 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const payDropId = String(body.payDropId ?? "").trim().slice(0, 160);
  const recipientUserId = String(body.recipientUserId ?? "").trim() || undefined;
  if (!payDropId) return jsonError("A Pay Drop is required.", 400);

  try {
    const payDrop = await resolvePayDrop(payDropId, recipientUserId);
    if (!payDrop) {
      return jsonError("This Pay Drop is unavailable or its price could not be verified.", 404);
    }
    if (payDrop.recipientUserId === buyer.id) {
      return jsonError("You cannot purchase your own Pay Drop.", 400);
    }

    const { data: connectedAccount, error: accountError } = await db
      .from("pay_drop_accounts")
      .select("stripe_account_id")
      .eq("user_id", payDrop.recipientUserId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!connectedAccount?.stripe_account_id) {
      return jsonError("This creator has not connected a payout account yet.", 409);
    }

    const account = await stripe.v2.core.accounts.retrieve(
      connectedAccount.stripe_account_id,
      { include: ["configuration.recipient", "requirements"] }
    );
    const transferStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
        ?.status;
    if (transferStatus !== "active") {
      return jsonError("This creator's payout account is not ready to receive Pay Drops.", 409);
    }

    const amountCents = payDrop.amountCents;
    const feeCents = applicationFeeCents(amountCents);
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
    const successUrl = `${new URL("/board/feed?paydrop=success", base).toString()}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = new URL("/board/feed?paydrop=cancelled", base);
    const checkoutAttemptId = /^[a-f0-9-]{16,64}$/i.test(
      String(body.checkoutAttemptId ?? "")
    )
      ? String(body.checkoutAttemptId)
      : randomUUID();

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: buyer.id,
        customer_email: buyer.email ?? undefined,
        integration_identifier: checkoutIntegrationIdentifier(),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: payDrop.title,
                ...(payDrop.description ? { description: payDrop.description } : {}),
              },
            },
          },
        ],
        payment_intent_data: {
          transfer_data: { destination: connectedAccount.stripe_account_id },
          ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
          metadata: {
            board_pay_drop_id: payDrop.id,
            board_buyer_user_id: buyer.id,
            board_recipient_user_id: payDrop.recipientUserId,
          },
        },
        metadata: {
          board_pay_drop_id: payDrop.id,
          board_buyer_user_id: buyer.id,
          board_recipient_user_id: payDrop.recipientUserId,
          board_platform_fee_amount: String(feeCents),
        },
        success_url: successUrl,
        cancel_url: cancelUrl.toString(),
      },
      { idempotencyKey: `board-paydrop-${checkoutAttemptId}` }
    );

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    const { error: ledgerError } = await db.from("pay_drop_payments").upsert(
      {
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        pay_drop_id: payDrop.id,
        buyer_user_id: buyer.id,
        recipient_user_id: payDrop.recipientUserId,
        amount_total: amountCents,
        platform_fee_amount: feeCents,
        creator_net_amount: Math.max(0, amountCents - feeCents),
        currency: "usd",
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id" }
    );
    if (ledgerError) throw ledgerError;

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("[Pay Drops] Checkout creation failed", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not open Stripe checkout.",
      500
    );
  }
}
