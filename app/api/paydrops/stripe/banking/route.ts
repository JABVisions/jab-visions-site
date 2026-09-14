import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentRow = {
  id: string;
  amount_total: number;
  created_at: string;
  status: string;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function signedInUser() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await signedInUser();
  if (!user) return jsonError("Sign in to view Banking.", 401);

  const stripe = getStripe();
  const db = getSupabaseAdmin();
  if (!stripe || !db) {
    return NextResponse.json({
      ok: true,
      configured: false,
      connected: false,
      status: "processor_setup_required",
    });
  }

  try {
    const { data: storedAccount, error: accountError } = await db
      .from("pay_drop_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (accountError) throw accountError;

    if (!storedAccount?.stripe_account_id) {
      return NextResponse.json({
        ok: true,
        configured: true,
        connected: false,
        status: "bank_not_connected",
        availableBalance: 0,
        pendingBalance: 0,
        lifetimePayDrops: 0,
        recentPayDrops: [],
      });
    }

    const accountId = storedAccount.stripe_account_id;
    const [account, balance, externalAccounts, recentResult, lifetimeResult] = await Promise.all([
      stripe.v2.core.accounts.retrieve(accountId, {
        include: ["configuration.recipient", "requirements"],
      }),
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.accounts.listExternalAccounts(
        accountId,
        { limit: 10 }
      ),
      db
        .from("pay_drop_payments")
        .select("id, amount_total, created_at, status")
        .eq("recipient_user_id", user.id)
        .in("status", ["paid", "refunded", "partially_refunded", "disputed"])
        .order("created_at", { ascending: false })
        .limit(6),
      db
        .from("pay_drop_payments")
        .select("amount_total")
        .eq("recipient_user_id", user.id)
        .eq("status", "paid"),
    ]);

    if (recentResult.error) throw recentResult.error;
    if (lifetimeResult.error) throw lifetimeResult.error;

    const transferStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
        ?.status ?? "pending";
    const payoutStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status ??
      "pending";
    const requirements = account.requirements?.entries ?? [];
    const payoutMethod =
      externalAccounts.data.find((method) => method.default_for_currency) ??
      externalAccounts.data[0];
    const bankName = payoutMethod
      ? payoutMethod.object === "bank_account"
        ? payoutMethod.bank_name
        : `${payoutMethod.brand ?? "Debit"} card`
      : null;
    const bankLast4 = payoutMethod?.last4 ?? null;
    const availableBalance = balance.available
      .filter((entry) => entry.currency === "usd")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const pendingBalance = balance.pending
      .filter((entry) => entry.currency === "usd")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const paymentRows = (recentResult.data ?? []) as PaymentRow[];
    const lifetimePayDrops = ((lifetimeResult.data ?? []) as Array<{ amount_total: number }>).reduce(
      (sum: number, row: { amount_total: number }) => sum + Number(row.amount_total ?? 0),
      0
    );

    let status = "verification_needed";
    if (!payoutMethod) status = "bank_not_connected";
    else if (transferStatus === "active" && payoutStatus === "active") {
      status = availableBalance > 0 ? "cash_out_available" : "ready_for_pay_drops";
    }

    const { error: syncError } = await db
      .from("pay_drop_accounts")
      .update({
        livemode: account.livemode,
        transfers_status: transferStatus,
        payouts_status: payoutStatus,
        requirements_due: requirements,
        bank_name: bankName,
        bank_last4: bankLast4,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (syncError) throw syncError;

    return NextResponse.json({
      ok: true,
      configured: true,
      connected: true,
      status,
      transfersEnabled: transferStatus === "active",
      payoutsEnabled: payoutStatus === "active",
      requirementsDue: requirements.length,
      bankName,
      bankLast4,
      availableBalance,
      pendingBalance,
      lifetimePayDrops,
      recentPayDrops: paymentRows.slice(0, 6).map((row: PaymentRow) => ({
        id: row.id,
        from: "Board supporter",
        amount: Number(row.amount_total ?? 0),
        createdAt: row.created_at,
        status: row.status,
      })),
    });
  } catch (error) {
    console.error("[Pay Drops] Banking status failed", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not load Banking status.",
      500
    );
  }
}

export async function POST(_req: NextRequest) {
  const user = await signedInUser();
  if (!user) return jsonError("Sign in to manage payouts.", 401);

  const stripe = getStripe();
  const db = getSupabaseAdmin();
  if (!stripe || !db) return jsonError("Pay Drops are not configured yet.", 503);

  try {
    const { data: storedAccount, error } = await db
      .from("pay_drop_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!storedAccount?.stripe_account_id) {
      return jsonError("Connect your payout account first.", 409);
    }

    const link = await stripe.accounts.createLoginLink(storedAccount.stripe_account_id);
    return NextResponse.json({ ok: true, url: link.url });
  } catch (error) {
    console.error("[Pay Drops] Payout dashboard link failed", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not open payout management.",
      500
    );
  }
}
