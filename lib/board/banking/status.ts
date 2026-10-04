export type BankingAccountState =
  | "not_connected"
  | "setup_incomplete"
  | "verification_required"
  | "connected"
  | "payouts_enabled"
  | "payouts_restricted";

export type BankingSnapshot = {
  state: BankingAccountState;
  label: string;
  message: string;
  readyForPayDrops: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  stripeAccountId: string | null;
  availableCents: number;
  pendingCents: number;
  lifetimeCents: number;
  payoutInterval: string | null;
  nextPayoutHint: string | null;
  requirementsDue: string[];
};

export type PayDropBankingSettings = {
  defaultAmountCents: number;
  payDropsEnabled: boolean;
  showOnProfile: boolean;
  showOnWorkBoard: boolean;
  directRequestsEnabled: boolean;
  paymentLinkPreferred: boolean;
  notifyOnPayDrop: boolean;
};

export const DEFAULT_PAY_DROP_BANKING_SETTINGS: PayDropBankingSettings = {
  defaultAmountCents: 2500,
  payDropsEnabled: true,
  showOnProfile: true,
  showOnWorkBoard: true,
  directRequestsEnabled: true,
  paymentLinkPreferred: false,
  notifyOnPayDrop: true,
};

export function classifyBankingState(input: {
  stripeAccountId?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: string[];
  disabledReason?: string | null;
}): BankingAccountState {
  if (!input.stripeAccountId) return "not_connected";
  if (input.disabledReason) return "payouts_restricted";
  if ((input.requirementsDue?.length ?? 0) > 0 && !input.payoutsEnabled) {
    return "verification_required";
  }
  if (input.payoutsEnabled && input.chargesEnabled) return "payouts_enabled";
  if (input.detailsSubmitted && input.chargesEnabled) return "connected";
  if (!input.detailsSubmitted) return "setup_incomplete";
  return "setup_incomplete";
}

export function bankingCopy(state: BankingAccountState): { label: string; message: string } {
  switch (state) {
    case "payouts_enabled":
      return {
        label: "Payouts Enabled",
        message: "Your Banking is ready to receive Pay Drops.",
      };
    case "connected":
      return {
        label: "Connected",
        message: "Your Banking is ready to receive Pay Drops.",
      };
    case "verification_required":
      return {
        label: "Verification Required",
        message: "Additional information is needed before payouts can be enabled.",
      };
    case "payouts_restricted":
      return {
        label: "Payouts Restricted",
        message: "Payouts are restricted. Open Manage Banking to finish review.",
      };
    case "setup_incomplete":
      return {
        label: "Setup Incomplete",
        message: "Finish Banking setup before receiving Pay Drop payments.",
      };
    default:
      return {
        label: "Not Connected",
        message: "Finish Banking setup before receiving Pay Drop payments.",
      };
  }
}

export function isBankingReadyForPayDrops(state: BankingAccountState) {
  return state === "connected" || state === "payouts_enabled";
}

export function parseAmountToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollars, cents = ""] = trimmed.split(".");
  const whole = Number(dollars);
  if (!Number.isFinite(whole) || whole < 0) return null;
  const frac = (cents + "00").slice(0, 2);
  return whole * 100 + Number(frac);
}

export function formatUsdFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safe / 100);
}

export function normalizeBankingSettings(raw: unknown): PayDropBankingSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const amount = Number(value.defaultAmountCents ?? value.default_amount_cents ?? 2500);
  return {
    defaultAmountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 2500,
    payDropsEnabled: value.payDropsEnabled !== false,
    showOnProfile: value.showOnProfile !== false,
    showOnWorkBoard: value.showOnWorkBoard !== false,
    directRequestsEnabled: value.directRequestsEnabled !== false,
    paymentLinkPreferred: value.paymentLinkPreferred === true,
    notifyOnPayDrop: value.notifyOnPayDrop !== false,
  };
}
