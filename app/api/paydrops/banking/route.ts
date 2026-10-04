import { NextRequest, NextResponse } from "next/server";
import {
  loadBankingSnapshot,
  requireBankingUser,
  upsertBankingProfileRow,
} from "@/lib/board/banking/server";
import { normalizeBankingSettings } from "@/lib/board/banking/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await requireBankingUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to open Banking." }, { status: 401 });
  }

  const [snapshot, transactionsResult, bankingRow] = await Promise.all([
    loadBankingSnapshot(user.id),
    supabase
      .from("pay_drop_transactions")
      .select(
        "id, pay_drop_id, title, amount_cents, creator_amount_cents, platform_fee_cents, currency, payment_status, payout_status, created_at, payer_id"
      )
      .or(`recipient_id.eq.${user.id},payer_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("board_banking_profiles").select("settings, default_amount_cents").eq("user_id", user.id).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    banking: snapshot,
    settings:     normalizeBankingSettings({
      ...(bankingRow.data?.settings && typeof bankingRow.data.settings === "object"
        ? bankingRow.data.settings
        : {}),
      defaultAmountCents: bankingRow.data?.default_amount_cents,
    }),
    transactions: transactionsResult.data ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const { user } = await requireBankingUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to update Banking." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = normalizeBankingSettings(body);
  const snapshot = await loadBankingSnapshot(user.id);
  await upsertBankingProfileRow({
    userId: user.id,
    stripeAccountId: snapshot.stripeAccountId,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    onboardingComplete: snapshot.onboardingComplete,
    verificationStatus: snapshot.state,
    payoutInterval: snapshot.payoutInterval,
    settings,
  });
  return NextResponse.json({ ok: true, settings });
}
