import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type StoredPayDrop = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  priceCents?: unknown;
  amountCents?: unknown;
  payProvider?: unknown;
  provider?: unknown;
  status?: unknown;
};

export type ResolvedPayDrop = {
  id: string;
  title: string;
  description?: string;
  amountCents: number;
  recipientUserId: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  board_style?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findDrop(boardStyle: unknown, payDropId: string): StoredPayDrop | null {
  const drops = record(boardStyle).boardDrops;
  if (!Array.isArray(drops)) return null;
  return (
    (drops.find((drop) => String(record(drop).id ?? "") === payDropId) as
      | StoredPayDrop
      | undefined) ?? null
  );
}

function normalizePayDrop(
  drop: StoredPayDrop,
  profile: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    board_style?: unknown;
  }
): ResolvedPayDrop | null {
  const type = String(drop.type ?? "").toLowerCase();
  const provider = String(drop.payProvider ?? drop.provider ?? "stripe_connect");
  const amountCents = Number(drop.priceCents ?? drop.amountCents ?? 0);
  const status = String(drop.status ?? "active");
  const options = record(record(profile.board_style).boardOptions);

  if (type !== "pay" || provider !== "stripe_connect") return null;
  if (!Number.isSafeInteger(amountCents) || amountCents < 50 || amountCents > 999_999_99) {
    return null;
  }
  if (status === "draft" || status === "archived") return null;
  if (options.payDropsEnabled === false) return null;

  return {
    id: String(drop.id),
    title: String(drop.title ?? "Pay Drop").trim().slice(0, 120) || "Pay Drop",
    description:
      typeof drop.description === "string" && drop.description.trim()
        ? drop.description.trim().slice(0, 240)
        : undefined,
    amountCents,
    recipientUserId: profile.id,
    recipientUsername: profile.username?.trim() || undefined,
    recipientDisplayName: profile.display_name?.trim() || undefined,
  };
}

/** Resolve canonical Pay Drop details from Supabase; never trust checkout client values. */
export async function resolvePayDrop(
  payDropId: string,
  expectedRecipientUserId?: string
): Promise<ResolvedPayDrop | null> {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Payment storage is not configured.");

  let query = db
    .from("profiles")
    .select("id, username, display_name, board_style");

  if (expectedRecipientUserId) {
    query = query.eq("id", expectedRecipientUserId);
  } else {
    query = query.contains("board_style", { boardDrops: [{ id: payDropId }] });
  }

  const { data, error } = await query.limit(2);
  if (error) throw new Error(error.message);

  const matches = (data ?? [])
    .map((profile: ProfileRow) => {
      const drop = findDrop(profile.board_style, payDropId);
      return drop ? normalizePayDrop(drop, profile) : null;
    })
    .filter((drop: ResolvedPayDrop | null): drop is ResolvedPayDrop => Boolean(drop));

  return matches.length === 1 ? matches[0] : null;
}
