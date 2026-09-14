import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function appUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const db = getSupabaseAdmin();
  if (!stripe || !db) {
    return jsonError(
      "Pay Drops are not configured yet. Add the Stripe and Supabase server keys first.",
      503
    );
  }

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Sign in to connect a payout account.", 401);

  try {
    const { data: storedAccount, error: storedError } = await db
      .from("pay_drop_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (storedError) throw storedError;

    let accountId = storedAccount?.stripe_account_id as string | undefined;
    let createdNewAccount = false;

    if (!accountId) {
      const { data: profile } = await db
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      const country = /^[a-z]{2}$/i.test(process.env.BOARD_STRIPE_DEFAULT_COUNTRY ?? "")
        ? String(process.env.BOARD_STRIPE_DEFAULT_COUNTRY).toLowerCase()
        : "us";
      const displayName =
        String(profile?.display_name ?? profile?.username ?? user.email?.split("@")[0] ?? "Board creator")
          .trim()
          .slice(0, 100) || "Board creator";

      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: user.email ?? undefined,
          display_name: displayName,
          dashboard: "express",
          defaults: {
            currency: "usd",
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application",
            },
            profile: {
              business_url: "https://jabvisions.com/board",
              doing_business_as: displayName,
              product_description: "Creative work and digital content offered through Board Pay Drops.",
            },
          },
          identity: { country },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
          metadata: {
            board_user_id: user.id,
            board_role: "paydrop_recipient",
          },
          include: ["configuration.recipient", "requirements"],
        },
        { idempotencyKey: `board-paydrop-account-${user.id}` }
      );
      accountId = account.id;
      createdNewAccount = true;

      const transferStatus =
        account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
          ?.status ?? "pending";
      const payoutStatus =
        account.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status ??
        "pending";
      const requirements = account.requirements?.entries ?? [];

      const { error: saveError } = await db.from("pay_drop_accounts").upsert(
        {
          user_id: user.id,
          stripe_account_id: account.id,
          livemode: account.livemode,
          dashboard_mode: "express",
          transfers_status: transferStatus,
          payouts_status: payoutStatus,
          requirements_due: requirements,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (saveError) throw saveError;
    }

    const base = appUrl(req);
    const refreshUrl = new URL(
      "/board/options?tab=banking&stripe=refresh",
      base
    ).toString();
    const returnUrl = new URL(
      "/board/options?tab=banking&stripe=return",
      base
    ).toString();
    const collectionOptions = {
      fields: "eventually_due" as const,
      future_requirements: "include" as const,
    };
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: createdNewAccount
        ? {
            type: "account_onboarding",
            account_onboarding: {
              configurations: ["recipient"],
              collection_options: collectionOptions,
              refresh_url: refreshUrl,
              return_url: returnUrl,
            },
          }
        : {
            type: "account_update",
            account_update: {
              configurations: ["recipient"],
              collection_options: collectionOptions,
              refresh_url: refreshUrl,
              return_url: returnUrl,
            },
          },
    });

    return NextResponse.json({ ok: true, url: link.url });
  } catch (error) {
    console.error("[Pay Drops] Connect onboarding failed", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not start Stripe onboarding.",
      500
    );
  }
}
