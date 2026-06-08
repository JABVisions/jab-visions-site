// File: app/api/paydrops/stripe/webhook/route.ts
// Stripe webhook for Pay Drop fulfillment. Verifies the signature, then records
// completed payments (and connected-account status changes) server-side.
//
// SETUP:
//   1) `stripe listen --forward-to localhost:3000/api/paydrops/stripe/webhook`
//      (or add the endpoint in the Stripe Dashboard) and copy the signing secret.
//   2) Set STRIPE_WEBHOOK_SECRET. For persistence, also set
//      SUPABASE_SERVICE_ROLE_KEY (server-only) + NEXT_PUBLIC_SUPABASE_URL.
//   3) Create the table (or adjust to your schema):
//        create table pay_drop_payments (
//          id text primary key,                 -- stripe session id
//          pay_drop_id text,
//          amount_total integer,
//          currency text,
//          recipient_account text,
//          status text,
//          created_at timestamptz default now()
//        );
//
// We never trust the client redirect for fulfillment — only this webhook.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
// Stripe needs the raw, unparsed body to verify the signature.
export const dynamic = "force-dynamic";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhook is not configured." },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  let event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
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

  const db = serviceSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string;
          amount_total: number | null;
          currency: string | null;
          payment_status: string | null;
          metadata?: Record<string, string> | null;
          payment_intent?: string | { transfer_data?: { destination?: string } } | null;
        };
        const payDropId = session.metadata?.payDropId ?? null;

        if (db) {
          await db.from("pay_drop_payments").upsert(
            {
              id: session.id,
              pay_drop_id: payDropId,
              amount_total: session.amount_total ?? null,
              currency: session.currency ?? null,
              status: session.payment_status ?? "paid",
            },
            { onConflict: "id" }
          );
        } else {
          console.log("[stripe webhook] checkout.session.completed", session.id, payDropId);
        }
        break;
      }

      case "account.updated": {
        // Connected-account onboarding/capability changes. Persist if you keep a
        // table of recipient accounts; otherwise just acknowledge.
        const account = event.data.object as {
          id: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
        };
        if (db) {
          await db
            .from("pay_drop_accounts")
            .upsert(
              {
                account_id: account.id,
                charges_enabled: !!account.charges_enabled,
                payouts_enabled: !!account.payouts_enabled,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "account_id" }
            )
            .then(undefined, () => {
              // table optional — ignore if it doesn't exist
            });
        }
        break;
      }

      default:
        // Ignore unrelated events.
        break;
    }
  } catch (error) {
    // Log but still 200 so Stripe doesn't retry a non-recoverable handler error.
    console.error("[stripe webhook] handler error", error);
  }

  return NextResponse.json({ received: true });
}
