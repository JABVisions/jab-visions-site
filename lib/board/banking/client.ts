export async function fetchBankingReady(): Promise<{
  ready: boolean;
  message: string;
  stripeAccountId: string | null;
  defaultAmountCents: number | null;
}> {
  const res = await fetch("/api/paydrops/banking", { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    return {
      ready: false,
      message: data?.error || "Finish Banking setup before receiving Pay Drop payments.",
      stripeAccountId: null,
      defaultAmountCents: null,
    };
  }
  return {
    ready: !!data.banking?.readyForPayDrops,
    message:
      data.banking?.message || "Finish Banking setup before receiving Pay Drop payments.",
    stripeAccountId: data.banking?.stripeAccountId ?? null,
    defaultAmountCents: data.settings?.defaultAmountCents ?? null,
  };
}
