"use client";

// Pay Drop checkout — Stripe Connect destination charge.
// Posts to /api/paydrops/stripe/checkout and redirects the buyer to the
// Stripe-hosted Checkout page. Funds go to the recipient's connected account.

export type HostedCheckoutInput = {
  payDropId: string;
  title: string;
  description?: string;
  amountCents: number;
  /** Recipient's Stripe Connect account id (acct_…). Required to route funds. */
  destinationAccountId?: string;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
};

type CheckoutResponse =
  | { ok: true; url: string }
  | { ok: false; error?: string };

export async function openHostedPayDropCheckout(input: HostedCheckoutInput) {
  if (!input.amountCents || input.amountCents <= 0) {
    throw new Error("This Pay Drop is missing a valid price.");
  }

  const recipientLabel =
    input.recipientDisplayName || input.recipientUsername || undefined;

  const response = await fetch("/api/paydrops/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payDropId: input.payDropId,
      title: input.title,
      description: input.description,
      amountCents: input.amountCents,
      destinationAccountId: input.destinationAccountId,
      recipientLabel,
    }),
  });

  const data = (await response.json().catch(() => null)) as CheckoutResponse | null;

  if (!response.ok || !data?.ok) {
    throw new Error(
      data && "error" in data && data.error
        ? data.error
        : "Could not open Stripe checkout."
    );
  }

  // Redirect to the Stripe-hosted Checkout page.
  window.location.href = data.url;
  return data;
}
