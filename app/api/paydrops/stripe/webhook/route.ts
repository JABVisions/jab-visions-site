import { NextRequest, NextResponse } from "next/server";
import { getStripe, applicationFeeCents } from "@/lib/stripe/server";
import { bankingServiceSupabase, creatorAmountCents } from "@/lib/board/banking/server";
import { classifyBankingState } from "@/lib/board/banking/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? `Signature verification failed: ${error.message}` : "Bad signature.",
      },
      { status: 400 }
    );
  }

  const db = bankingServiceSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string;
          amount_total: number | null;
          currency: string | null;
          payment_status: string | null;
          payment_intent?: string | null;
          metadata?: Record<string, string> | null;
        };
        if (!db) break;
        const amount = session.amount_total ?? 0;
        await db.from("pay_drop_transactions").upsert(
          {
            id: session.id,
            pay_drop_id: session.metadata?.payDropId ?? null,
            payer_id: session.metadata?.payerUserId || null,
            recipient_id: session.metadata?.recipientUserId || null,
            stripe_session_id: session.id,
            stripe_payment_intent:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount_cents: amount,
            currency: session.currency ?? "usd",
            platform_fee_cents: applicationFeeCents(amount),
            creator_amount_cents: creatorAmountCents(amount),
            payment_status: session.payment_status === "unpaid" ? "failed" : "succeeded",
            payout_status:
              session.payment_status === "unpaid"
                ? "failed"
                : session.payment_status === "paid" || session.payment_status === "no_payment_required"
                  ? "succeeded"
                  : "processing",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as { id: string };
        if (!db) break;
        await db
          .from("pay_drop_transactions")
          .update({
            payment_status: "failed",
            payout_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as { payment_intent?: string };
        if (!db || !charge.payment_intent) break;
        await db
          .from("pay_drop_transactions")
          .update({
            payment_status: "refunded",
            payout_status: "refunded",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent", charge.payment_intent);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as { payment_intent?: string };
        if (!db || !dispute.payment_intent) break;
        await db
          .from("pay_drop_transactions")
          .update({
            payment_status: "disputed",
            payout_status: "disputed",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent", dispute.payment_intent);
        break;
      }
      case "account.updated": {
        const account = event.data.object as {
          id: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
          requirements?: {
            currently_due?: string[] | null;
            past_due?: string[] | null;
            disabled_reason?: string | null;
          } | null;
        };
        if (!db) break;
        const verificationStatus = classifyBankingState({
          stripeAccountId: account.id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirementsDue: [
            ...(account.requirements?.currently_due ?? []),
            ...(account.requirements?.past_due ?? []),
          ],
          disabledReason: account.requirements?.disabled_reason ?? null,
        });
        await db
          .from("board_banking_profiles")
          .update({
            charges_enabled: !!account.charges_enabled,
            payouts_enabled: !!account.payouts_enabled,
            details_submitted: !!account.details_submitted,
            onboarding_complete: !!account.details_submitted && !!account.charges_enabled,
            verification_status: verificationStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook] handler error");
  }

  return NextResponse.json({ received: true });
}
