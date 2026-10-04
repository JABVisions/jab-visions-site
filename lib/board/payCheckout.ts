"use client";

export type HostedCheckoutInput = {
  payDropId: string;
  title?: string;
  description?: string;
  amountCents?: number;
  destinationAccountId?: string;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
};

type CheckoutResponse =
  | { ok: true; url: string }
  | { ok: false; error?: string };

export async function openHostedPayDropCheckout(input: HostedCheckoutInput) {
  if (!input.payDropId) {
    throw new Error("This Pay Drop is missing an id.");
  }

  const response = await fetch("/api/paydrops/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payDropId: input.payDropId,
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

  window.location.href = data.url;
  return data;
}

export async function registerPayDropOnServer(input: {
  id: string;
  title: string;
  description?: string;
  amountCents: number;
  provider: "stripe_connect" | "payment_link";
  status?: string;
}) {
  const response = await fetch("/api/paydrops/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "Could not save this Pay Drop to Banking.");
  }
}
