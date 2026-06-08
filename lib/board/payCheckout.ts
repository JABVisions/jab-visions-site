"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

export type HostedCheckoutInput = {
  payDropId: string;
  title: string;
  description?: string;
  amountCents: number;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
};

const PAYMENT_PROFILE_STORAGE_KEY = "jab_board_authnet_customer_profile_v1";

type HostedTokenResponse =
  | {
      ok: true;
      token: string;
      hostedPaymentUrl: string;
      environment: "sandbox" | "production";
      paymentId?: string;
      ledgerStatus?: "persisted" | "unpersisted";
      recipient?: {
        userId: string;
        username?: string | null;
        displayName?: string | null;
      };
    }
  | {
      ok: false;
      error?: string;
      details?: unknown;
    };

type CustomerProfileResponse =
  | {
      ok: true;
      customerProfileId: string;
      environment: "sandbox" | "production";
      reused?: boolean;
    }
  | {
      ok: false;
      error?: string;
      details?: unknown;
    };

type StoredCustomerProfile = {
  customerProfileId: string;
  email?: string;
  savedAt: number;
};

function readStoredCustomerProfile(): StoredCustomerProfile | null {
  try {
    const raw = window.localStorage.getItem(PAYMENT_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const customerProfileId = String(parsed.customerProfileId ?? "").trim();
    if (!customerProfileId) return null;
    return {
      customerProfileId,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      savedAt: Number(parsed.savedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function writeStoredCustomerProfile(profile: StoredCustomerProfile) {
  window.localStorage.setItem(PAYMENT_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getCurrentCustomerIdentity() {
  try {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    const id = user?.id ? `board_${user.id.replace(/[^a-z0-9]/gi, "").slice(0, 14)}` : "";
    return {
      customerId: id,
      email: user?.email ?? "",
    };
  } catch {
    return {
      customerId: `board_guest_${Date.now().toString().slice(-10)}`,
      email: "",
    };
  }
}

async function ensureCustomerProfile() {
  const stored = readStoredCustomerProfile();
  if (stored?.customerProfileId) return stored;

  const identity = await getCurrentCustomerIdentity();
  const response = await fetch("/api/paydrops/authorize-net/customer-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerId: identity.customerId,
      email: identity.email,
      description: "BOARD Pay Drop customer",
    }),
  });

  const data = (await response.json().catch(() => null)) as CustomerProfileResponse | null;

  if (!response.ok || !data?.ok) {
    throw new Error(
      data && "error" in data && data.error
        ? data.error
        : "Could not create a secure saved-card profile."
    );
  }

  const next = {
    customerProfileId: data.customerProfileId,
    email: identity.email || undefined,
    savedAt: Date.now(),
  };
  writeStoredCustomerProfile(next);
  return next;
}

function submitHostedPaymentForm(
  hostedPaymentUrl: string,
  token: string,
  payDropId: string,
  recipientLabel: string | undefined,
  savePaymentProfile: boolean
) {
  const targetName = `board_paydrop_${payDropId.replace(/[^a-z0-9_-]/gi, "_")}`;
  const existing = document.getElementById("board-paydrop-checkout");
  existing?.remove();

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "board-paydrop-checkout";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Pay Drop checkout");
  overlay.innerHTML = `
    <div class="board-paydrop-scrim" data-close="true"></div>
    <div class="board-paydrop-window">
      <div class="board-paydrop-top">
        <div>
          <div class="board-paydrop-kicker">Secure Pay Drop</div>
          <div class="board-paydrop-title">National Bankcard Checkout</div>
          ${
            recipientLabel
              ? `<div class="board-paydrop-recipient">Paying ${escapeHtml(recipientLabel)}</div>`
              : ""
          }
          ${
            savePaymentProfile
              ? '<div class="board-paydrop-subtitle">Authorize.Net will save this card securely for faster future Pay Drops.</div>'
              : ""
          }
        </div>
        <button class="board-paydrop-close" type="button" aria-label="Close checkout">×</button>
      </div>
      <div class="board-paydrop-frame-wrap">
        <div class="board-paydrop-loading">Opening secure payment window...</div>
        <div class="board-paydrop-scale-stage">
          <iframe
            class="board-paydrop-frame"
            name="${targetName}"
            title="National Bankcard checkout"
            allow="payment *"
          ></iframe>
        </div>
      </div>
    </div>
    <style>
      #board-paydrop-checkout {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 18px;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .board-paydrop-scrim {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 25% 18%, rgba(210, 255, 70, 0.20), transparent 28%),
          radial-gradient(circle at 72% 20%, rgba(255, 0, 190, 0.18), transparent 30%),
          rgba(0, 0, 0, 0.64);
        backdrop-filter: blur(10px);
      }
      .board-paydrop-window {
        position: relative;
        --checkout-scale: 0.84;
        width: min(760px, calc(100vw - 36px));
        height: min(760px, calc(100vh - 32px));
        display: grid;
        grid-template-rows: auto 1fr;
        overflow: hidden;
        border-radius: 26px;
        border: 1px solid rgba(218, 255, 106, 0.52);
        background:
          linear-gradient(145deg, rgba(255, 255, 225, 0.94), rgba(205, 255, 228, 0.88)),
          rgba(255, 255, 255, 0.92);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.55) inset,
          0 0 38px rgba(207, 255, 56, 0.25),
          0 0 80px rgba(255, 0, 190, 0.18),
          0 28px 90px rgba(0, 0, 0, 0.42);
      }
      .board-paydrop-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.10);
        background: rgba(255, 255, 255, 0.62);
      }
      .board-paydrop-kicker {
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.20em;
        text-transform: uppercase;
        color: rgba(255, 0, 190, 0.78);
      }
      .board-paydrop-title {
        margin-top: 3px;
        font-size: 14px;
        font-weight: 950;
        color: rgba(0, 0, 0, 0.74);
      }
      .board-paydrop-subtitle {
        margin-top: 4px;
        max-width: 560px;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.35;
        color: rgba(0, 0, 0, 0.52);
      }
      .board-paydrop-recipient {
        margin-top: 4px;
        width: fit-content;
        max-width: 560px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.10);
        background: rgba(255, 255, 255, 0.72);
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 900;
        color: rgba(48, 143, 74, 0.92);
      }
      .board-paydrop-close {
        width: 38px;
        height: 38px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.14);
        background: rgba(255, 255, 255, 0.82);
        color: rgba(0, 0, 0, 0.68);
        font-size: 24px;
        line-height: 1;
        font-weight: 800;
        cursor: pointer;
      }
      .board-paydrop-frame-wrap {
        position: relative;
        min-height: 0;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.78);
      }
      .board-paydrop-loading {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        color: rgba(0, 0, 0, 0.58);
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }
      .board-paydrop-frame {
        width: calc(100% / var(--checkout-scale));
        height: calc(100% / var(--checkout-scale));
        display: block;
        border: 0;
        background: white;
        transform: scale(var(--checkout-scale));
        transform-origin: top left;
      }
      .board-paydrop-scale-stage {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      @media (max-width: 820px) {
        .board-paydrop-window {
          --checkout-scale: 0.78;
          width: calc(100vw - 20px);
          height: calc(100vh - 20px);
          border-radius: 22px;
        }
        .board-paydrop-top {
          padding: 10px 12px;
        }
      }
      @media (max-height: 720px) {
        .board-paydrop-window {
          --checkout-scale: 0.76;
          height: calc(100vh - 20px);
        }
      }
    </style>
  `;

  const close = () => {
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", onKeyDown);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.dataset.close === "true" || target?.classList.contains("board-paydrop-close")) {
      close();
    }
  });
  window.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);

  const iframe = overlay.querySelector<HTMLIFrameElement>(".board-paydrop-frame");
  iframe?.addEventListener("load", () => {
    overlay.querySelector(".board-paydrop-loading")?.remove();
  });

  const form = document.createElement("form");
  form.method = "POST";
  form.action = hostedPaymentUrl;
  form.target = targetName;
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "token";
  input.value = token;

  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export async function openHostedPayDropCheckout(input: HostedCheckoutInput) {
  if (!input.amountCents || input.amountCents <= 0) {
    throw new Error("This Pay Drop is missing a valid price.");
  }

  const savePaymentProfile = window.confirm(
    "Save this card securely with Authorize.Net for faster future Pay Drops? Board will not store the card number."
  );
  const customerProfile = savePaymentProfile ? await ensureCustomerProfile() : null;

  const response = await fetch("/api/paydrops/authorize-net/hosted-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      customerEmail: customerProfile?.email,
      customerProfileId: customerProfile?.customerProfileId,
      savePaymentProfile,
    }),
  });

  const data = (await response.json().catch(() => null)) as HostedTokenResponse | null;

  if (!response.ok || !data?.ok) {
    throw new Error(
      data && "error" in data && data.error
        ? data.error
        : "Could not open National Bankcard checkout."
    );
  }

  submitHostedPaymentForm(
    data.hostedPaymentUrl,
    data.token,
    input.payDropId,
    data.ok
      ? data.recipient?.displayName ||
          data.recipient?.username ||
          input.recipientDisplayName ||
          input.recipientUsername
      : input.recipientDisplayName || input.recipientUsername,
    savePaymentProfile
  );
  return data;
}
