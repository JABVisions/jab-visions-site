import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { applicationFeeCents, getStripe } from "@/lib/stripe/server";
import {
  bankingCopy,
  classifyBankingState,
  DEFAULT_PAY_DROP_BANKING_SETTINGS,
  isBankingReadyForPayDrops,
  normalizeBankingSettings,
  type BankingSnapshot,
  type PayDropBankingSettings,
} from "@/lib/board/banking/status";

export function bankingSupabaseFromCookies() {
  const { url, key, configured } = getSupabasePublicConfig();
  if (!configured) return null;
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) =>
        cs.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Route handlers can persist cookies; server components may not.
          }
        }),
    },
  });
}

export function bankingServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function requireBankingUser() {
  const supabase = bankingSupabaseFromCookies();
  if (!supabase) return { supabase: null, user: null, configured: false as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user, configured: true as const };
}

export function styleStripeAccountId(boardStyle: unknown) {
  if (!boardStyle || typeof boardStyle !== "object") return null;
  const id = (boardStyle as { stripeAccountId?: unknown }).stripeAccountId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function persistStripeAccountId(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("board_style")
    .eq("id", userId)
    .maybeSingle();
  const style =
    profile?.board_style && typeof profile.board_style === "object"
      ? { ...(profile.board_style as Record<string, unknown>) }
      : {};
  style.stripeAccountId = accountId;
  await supabase.from("profiles").upsert(
    { id: userId, board_style: style },
    { onConflict: "id" }
  );
}

export async function upsertBankingProfileRow(input: {
  userId: string;
  stripeAccountId?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  onboardingComplete?: boolean;
  verificationStatus?: string;
  payoutInterval?: string | null;
  settings?: PayDropBankingSettings;
}) {
  const db = bankingServiceSupabase() ?? (await requireBankingUser()).supabase;
  if (!db) return;
  const settings = input.settings ?? DEFAULT_PAY_DROP_BANKING_SETTINGS;
  try {
  await db.from("board_banking_profiles").upsert(
    {
      user_id: input.userId,
      stripe_account_id: input.stripeAccountId ?? null,
      charges_enabled: !!input.chargesEnabled,
      payouts_enabled: !!input.payoutsEnabled,
      details_submitted: !!input.detailsSubmitted,
      onboarding_complete: !!input.onboardingComplete,
      verification_status: input.verificationStatus ?? "not_connected",
      payout_interval: input.payoutInterval ?? null,
      default_amount_cents: settings.defaultAmountCents,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  } catch {
    // Table may not be applied yet.
  }
}

export async function loadBankingSnapshot(userId: string): Promise<BankingSnapshot> {
  const { supabase } = await requireBankingUser();
  if (!supabase) {
    const copy = bankingCopy("not_connected");
    return {
      state: "not_connected",
      label: copy.label,
      message: "Banking is not connected on this server yet.",
      readyForPayDrops: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      onboardingComplete: false,
      stripeAccountId: null,
      availableCents: 0,
      pendingCents: 0,
      lifetimeCents: 0,
      payoutInterval: null,
      nextPayoutHint: null,
      requirementsDue: [],
    };
  }
  const [{ data: profile }, { data: bankingRow }] = await Promise.all([
    supabase.from("profiles").select("board_style").eq("id", userId).maybeSingle(),
    supabase.from("board_banking_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const settings = normalizeBankingSettings(bankingRow?.settings);
  let stripeAccountId =
    (typeof bankingRow?.stripe_account_id === "string" && bankingRow.stripe_account_id.trim()) ||
    styleStripeAccountId(profile?.board_style);

  let chargesEnabled = !!bankingRow?.charges_enabled;
  let payoutsEnabled = !!bankingRow?.payouts_enabled;
  let detailsSubmitted = !!bankingRow?.details_submitted;
  let requirementsDue: string[] = [];
  let disabledReason: string | null = null;
  let payoutInterval: string | null =
    typeof bankingRow?.payout_interval === "string" ? bankingRow.payout_interval : null;
  let availableCents = 0;
  let pendingCents = 0;
  let nextPayoutHint: string | null = null;

  const stripe = getStripe();
  if (stripe && stripeAccountId) {
    try {
      const [account, balance] = await Promise.all([
        stripe.accounts.retrieve(stripeAccountId),
        stripe.balance.retrieve({ stripeAccount: stripeAccountId }).catch(() => null),
      ]);
      chargesEnabled = !!account.charges_enabled;
      payoutsEnabled = !!account.payouts_enabled;
      detailsSubmitted = !!account.details_submitted;
      disabledReason = account.requirements?.disabled_reason ?? null;
      requirementsDue = [
        ...(account.requirements?.currently_due ?? []),
        ...(account.requirements?.past_due ?? []),
      ];
      const schedule = account.settings?.payouts?.schedule;
      payoutInterval = schedule?.interval ?? payoutInterval;
      if (schedule?.interval === "daily") nextPayoutHint = "Automatic daily payouts";
      else if (schedule?.interval === "weekly") nextPayoutHint = "Automatic weekly payouts";
      else if (schedule?.interval === "monthly") nextPayoutHint = "Automatic monthly payouts";
      else if (payoutsEnabled) nextPayoutHint = "Automatic payouts to your connected account";

      const usdAvailable = balance?.available?.find((item) => item.currency === "usd");
      const usdPending = balance?.pending?.find((item) => item.currency === "usd");
      availableCents = usdAvailable?.amount ?? 0;
      pendingCents = usdPending?.amount ?? 0;

      await upsertBankingProfileRow({
        userId,
        stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        onboardingComplete: detailsSubmitted && chargesEnabled,
        verificationStatus: classifyBankingState({
          stripeAccountId,
          chargesEnabled,
          payoutsEnabled,
          detailsSubmitted,
          requirementsDue,
          disabledReason,
        }),
        payoutInterval,
        settings,
      });
    } catch {
      // Keep stored flags if Stripe is unreachable.
    }
  }

  const { data: lifetimeRows } = await supabase
    .from("pay_drop_transactions")
    .select("creator_amount_cents, payment_status")
    .eq("recipient_id", userId);

  const lifetimeCents = (lifetimeRows ?? []).reduce((sum, row) => {
    if (row.payment_status !== "succeeded") return sum;
    return sum + (Number(row.creator_amount_cents) || 0);
  }, 0);

  const state = classifyBankingState({
    stripeAccountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDue,
    disabledReason,
  });
  const copy = bankingCopy(state);

  return {
    state,
    label: copy.label,
    message: copy.message,
    readyForPayDrops: isBankingReadyForPayDrops(state),
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardingComplete: detailsSubmitted && chargesEnabled,
    stripeAccountId: stripeAccountId ?? null,
    availableCents,
    pendingCents,
    lifetimeCents,
    payoutInterval,
    nextPayoutHint,
    requirementsDue,
  };
}

export async function registerBoardPayDrop(input: {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  amountCents: number;
  provider: "stripe_connect" | "payment_link";
  recipientStripeAccountId?: string | null;
  status?: string;
}) {
  const db = bankingServiceSupabase();
  const client = db ?? (await requireBankingUser()).supabase;
  if (!client) return;
  try {
  await client.from("board_pay_drops").upsert(
    {
      id: input.id,
      owner_id: input.ownerId,
      title: input.title,
      description: input.description ?? null,
      amount_cents: input.amountCents,
      currency: "usd",
      provider: input.provider,
      recipient_stripe_account_id: input.recipientStripeAccountId ?? null,
      status: input.status ?? "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  } catch {
    // Table may not be applied yet.
  }
}

export async function lookupPayDropForCheckout(payDropId: string) {
  const db = bankingServiceSupabase();
  const client = db ?? (await requireBankingUser()).supabase;
  if (!client) return null;
  const { data: drop } = await client
    .from("board_pay_drops")
    .select("*")
    .eq("id", payDropId)
    .maybeSingle();
  if (drop) return drop;

  const { data: activity } = await client
    .from("board_activity")
    .select("id, user_id, title, body, meta")
    .eq("id", payDropId)
    .maybeSingle();
  if (!activity) return null;
  const meta = activity.meta && typeof activity.meta === "object" ? activity.meta : {};
  const amountCents = Number((meta as { priceCents?: unknown }).priceCents ?? 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  return {
    id: activity.id,
    owner_id: activity.user_id,
    title: activity.title || "Pay Drop",
    description: activity.body,
    amount_cents: Math.round(amountCents),
    currency: "usd",
    provider: "stripe_connect",
    recipient_stripe_account_id: null,
    status: "active",
  };
}

export function creatorAmountCents(amountCents: number) {
  return Math.max(0, amountCents - applicationFeeCents(amountCents));
}
