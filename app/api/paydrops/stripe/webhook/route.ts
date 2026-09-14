import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const db = getSupabaseAdmin();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !db || !webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhook is not configured." },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 400 });
  }

  try {
    const { data: processed, error: processedError } = await db
      .from("pay_drop_webhook_events")
      .select("stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (processedError) throw processedError;
    if (processed) return NextResponse.json({ received: true, duplicate: true });

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const payDropId = metadataValue(session.metadata, "board_pay_drop_id");
        const recipientUserId = metadataValue(
          session.metadata,
          "board_recipient_user_id"
        );
        const buyerUserId =
          metadataValue(session.metadata, "board_buyer_user_id") ??
          session.client_reference_id;
        if (!payDropId || !recipientUserId || !session.amount_total) {
          throw new Error(`Checkout session ${session.id} is missing Board payment metadata.`);
        }

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        let chargeId: string | null = null;
        if (paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ["latest_charge"],
          });
          chargeId =
            typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge?.id ?? null;
        }

        const fee = Number(
          metadataValue(session.metadata, "board_platform_fee_amount") ?? 0
        );
        const { error } = await db.from("pay_drop_payments").upsert(
          {
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_charge_id: chargeId,
            pay_drop_id: payDropId,
            buyer_user_id: buyerUserId || null,
            recipient_user_id: recipientUserId,
            amount_total: session.amount_total,
            platform_fee_amount: fee,
            creator_net_amount: Math.max(0, session.amount_total - fee),
            currency: session.currency ?? "usd",
            status: session.payment_status === "paid" ? "paid" : "pending",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_checkout_session_id" }
        );
        if (error) throw error;
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { data: updated, error } = await db
          .from("pay_drop_payments")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("stripe_checkout_session_id", session.id)
          .select("id");
        if (error) throw error;
        if (!updated?.length) throw new Error(`Payment row for ${session.id} is not available yet.`);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const status =
          charge.amount_refunded >= charge.amount ? "refunded" : "partially_refunded";
        const { data: updated, error } = await db
          .from("pay_drop_payments")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("stripe_charge_id", charge.id)
          .select("id");
        if (error) throw error;
        if (!updated?.length) throw new Error(`Payment row for charge ${charge.id} is not available yet.`);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId =
          typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
        const charge = await stripe.charges.retrieve(chargeId);
        const transferId =
          typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;

        if (transferId) {
          const reversibleAmount = Math.max(
            0,
            Math.min(
              dispute.amount,
              charge.amount - (charge.application_fee_amount ?? 0)
            )
          );
          if (reversibleAmount > 0) {
            await stripe.transfers.createReversal(
              transferId,
              {
                amount: reversibleAmount,
                metadata: { board_dispute_id: dispute.id },
              },
              { idempotencyKey: `board-dispute-reversal-${dispute.id}` }
            );
          }
        }

        const { data: updated, error } = await db
          .from("pay_drop_payments")
          .update({
            status: "disputed",
            stripe_dispute_id: dispute.id,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_charge_id", chargeId)
          .select("id");
        if (error) throw error;
        if (!updated?.length) throw new Error(`Payment row for charge ${chargeId} is not available yet.`);
        break;
      }

      default:
        break;
    }

    const { error: eventError } = await db.from("pay_drop_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
    });
    if (eventError && eventError.code !== "23505") throw eventError;
  } catch (error) {
    console.error("[Pay Drops] Webhook processing failed", event.id, error);
    return NextResponse.json(
      { ok: false, error: "Webhook processing failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
