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
import { applicationFeeCents, getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
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
  const title = String(body.title ?? "Pay Drop").trim() || "Pay Drop";

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "A valid amount is required." },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const successUrl = new URL(
    body.successPath || "/board/feed?paydrop=success",
    appUrl
  ).toString();
  const cancelUrl = new URL(
    body.cancelPath || "/board/feed?paydrop=cancelled",
    appUrl
  ).toString();

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
          payDropId: String(body.payDropId ?? ""),
          recipient: body.recipientLabel?.slice(0, 120) ?? "",
        },
      },
      metadata: {
        payDropId: String(body.payDropId ?? ""),
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
