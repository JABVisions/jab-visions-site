"use client";

export const PAY_DROPS_STORAGE_KEY = "jab_board_pay_drops_v2";
export const PAY_DROPS_UPDATED_EVENT = "board:paydrops:updated";
const LEGACY_DROPS_KEY = "jab_board_drops_v2";

function scopedStorageKey(base: string, userId?: string | null) {
  return userId ? `${base}:${userId}` : null;
}

export type PayDropProvider =
  | "payment_link"
  | "stripe_connect"
  // Legacy — kept so previously-saved Pay Drops still parse. New Drops use stripe_connect.
  | "authorize_net_accept_hosted";

export type PayDropStatus =
  | "draft"
  | "active"
  | "gateway_setup_required"
  | "archived";

export type PayDrop = {
  id: string;
  title: string;
  description?: string;
  amountCents: number;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
  provider: PayDropProvider;
  status: PayDropStatus;
  checkoutMode: "external_link" | "embedded_hosted";
  checkoutUrl?: string;
  paymentRequestType?: "direct" | "link";
  paymentLink?: string;
  gatewayLabel?: string;
  merchantLabel?: string;
  bucket?: string;
  storagePath?: string;
  mediaKind?: "image" | "video";
  mediaSource?: "upload" | "capture";
  legacySource?: boolean;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emitUpdated(userId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAY_DROPS_UPDATED_EVENT));
  window.dispatchEvent(
    new StorageEvent("storage", { key: scopedStorageKey(PAY_DROPS_STORAGE_KEY, userId) ?? PAY_DROPS_STORAGE_KEY })
  );
}

function normalizeStoredPayDrop(value: any): PayDrop | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id ?? "").trim();
  const title = String(value.title ?? "").trim();
  const amountCents = Number(value.amountCents ?? 0);
  if (!id || !title || !Number.isFinite(amountCents) || amountCents <= 0) return null;

  const checkoutUrl =
    typeof value.checkoutUrl === "string" && value.checkoutUrl.trim()
      ? value.checkoutUrl
      : undefined;
  // External payment links stay links; everything else routes through Stripe
  // Connect now (legacy Authorize.Net drops migrate forward to stripe_connect).
  const provider: PayDropProvider =
    value.provider === "payment_link" && checkoutUrl
      ? "payment_link"
      : "stripe_connect";

  const status: PayDropStatus =
    value.status === "draft" ||
    value.status === "active" ||
    value.status === "archived" ||
    value.status === "gateway_setup_required"
      ? value.status
      : provider === "stripe_connect"
        ? "gateway_setup_required"
        : "active";

  return {
    id,
    title,
    description:
      typeof value.description === "string" ? value.description : undefined,
    amountCents,
    recipientUserId:
      typeof value.recipientUserId === "string" && value.recipientUserId.trim()
        ? value.recipientUserId.trim()
        : undefined,
    recipientUsername:
      typeof value.recipientUsername === "string" && value.recipientUsername.trim()
        ? value.recipientUsername.trim().toLowerCase()
        : undefined,
    recipientDisplayName:
      typeof value.recipientDisplayName === "string" && value.recipientDisplayName.trim()
        ? value.recipientDisplayName.trim()
        : undefined,
    createdAt: Number(value.createdAt ?? Date.now()),
    updatedAt: Number(value.updatedAt ?? value.createdAt ?? Date.now()),
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    bucket: typeof value.bucket === "string" ? value.bucket : undefined,
    storagePath: typeof value.storagePath === "string" ? value.storagePath : undefined,
    mediaKind: value.mediaKind === "video" ? "video" : value.mediaKind === "image" ? "image" : undefined,
    mediaSource:
      value.mediaSource === "capture" || value.mediaSource === "upload"
        ? value.mediaSource
        : undefined,
    provider,
    status,
    checkoutMode:
      provider === "stripe_connect" || value.checkoutMode === "embedded_hosted"
        ? "embedded_hosted"
        : "external_link",
    checkoutUrl,
    paymentRequestType:
      value.paymentRequestType === "link" || provider === "payment_link"
        ? "link"
        : "direct",
    paymentLink:
      typeof value.paymentLink === "string" && value.paymentLink.trim()
        ? value.paymentLink.trim()
        : checkoutUrl,
    gatewayLabel:
      typeof value.gatewayLabel === "string" && value.gatewayLabel.trim()
        ? value.gatewayLabel
        : provider === "stripe_connect"
          ? "Stripe"
          : undefined,
    merchantLabel:
      typeof value.merchantLabel === "string" ? value.merchantLabel : undefined,
    legacySource: !!value.legacySource,
  };
}

function readLegacyPayDrops(userId?: string | null, includeGlobalLegacy = false): PayDrop[] {
  if (typeof window === "undefined") return [];

  const key = scopedStorageKey(LEGACY_DROPS_KEY, userId);
  const parsed = safeParse<any[]>(
    key
      ? window.localStorage.getItem(key)
      : includeGlobalLegacy
        ? window.localStorage.getItem(LEGACY_DROPS_KEY)
        : null,
    []
  );
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((value) => value && typeof value === "object")
    .filter((value) => String(value.type ?? "").toLowerCase() === "pay")
    .map((value): PayDrop | null => {
      const id = String(value.id ?? "").trim();
      const title = String(value.title ?? "").trim();
      const amountCents = Number(value.priceCents ?? 0);
      if (!id || !title || !Number.isFinite(amountCents) || amountCents <= 0) return null;

      const checkoutUrl =
        typeof value.linkUrl === "string" && value.linkUrl.trim()
          ? value.linkUrl
          : undefined;
      const provider: PayDropProvider = checkoutUrl
        ? "payment_link"
        : "stripe_connect";

      return {
        id,
        title,
        description:
          typeof value.description === "string" ? value.description : undefined,
        amountCents,
        recipientUserId:
          typeof value.recipientUserId === "string" && value.recipientUserId.trim()
            ? value.recipientUserId.trim()
            : undefined,
        recipientUsername:
          typeof value.recipientUsername === "string" && value.recipientUsername.trim()
            ? value.recipientUsername.trim().toLowerCase()
            : undefined,
        recipientDisplayName:
          typeof value.recipientDisplayName === "string" && value.recipientDisplayName.trim()
            ? value.recipientDisplayName.trim()
            : undefined,
        createdAt: Number(value.createdAt ?? Date.now()),
        updatedAt: Number(value.createdAt ?? Date.now()),
        provider,
        status: checkoutUrl ? "active" : "gateway_setup_required",
        checkoutMode: checkoutUrl ? "external_link" : "embedded_hosted",
        checkoutUrl,
        paymentRequestType: checkoutUrl ? "link" : "direct",
        paymentLink: checkoutUrl,
        gatewayLabel: checkoutUrl ? "Legacy Pay Link" : "Stripe",
        bucket: typeof value.bucket === "string" ? value.bucket : undefined,
        storagePath: typeof value.storagePath === "string" ? value.storagePath : undefined,
        mediaKind: value.mediaKind === "video" ? "video" : value.mediaKind === "image" ? "image" : undefined,
        mediaSource:
          value.mediaSource === "capture" || value.mediaSource === "upload"
            ? value.mediaSource
            : undefined,
        legacySource: true,
      };
    })
    .filter((value): value is PayDrop => Boolean(value))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function readPayDrops(userId?: string | null, includeGlobalLegacy = false): PayDrop[] {
  if (typeof window === "undefined") return [];
  const key = scopedStorageKey(PAY_DROPS_STORAGE_KEY, userId);
  if (!key && !includeGlobalLegacy) return [];

  const scopedStored = safeParse<any[]>(
    key ? window.localStorage.getItem(key) : window.localStorage.getItem(PAY_DROPS_STORAGE_KEY),
    []
  )
    .map(normalizeStoredPayDrop)
    .filter((value): value is PayDrop => Boolean(value));
  const globalStored = includeGlobalLegacy && key
    ? safeParse<any[]>(window.localStorage.getItem(PAY_DROPS_STORAGE_KEY), [])
        .map(normalizeStoredPayDrop)
        .filter((value): value is PayDrop => Boolean(value))
    : [];

  const merged = new Map<string, PayDrop>();
  for (const drop of globalStored) merged.set(drop.id, drop);
  for (const drop of scopedStored) merged.set(drop.id, drop);
  for (const legacy of readLegacyPayDrops(userId, includeGlobalLegacy)) {
    const existing = merged.get(legacy.id);
    if (!existing) {
      merged.set(legacy.id, legacy);
      continue;
    }
    merged.set(legacy.id, {
      ...legacy,
      ...existing,
      imageUrl: existing.imageUrl ?? legacy.imageUrl,
      bucket: existing.bucket ?? legacy.bucket,
      storagePath: existing.storagePath ?? legacy.storagePath,
      mediaKind: existing.mediaKind ?? legacy.mediaKind,
      mediaSource: existing.mediaSource ?? legacy.mediaSource,
      paymentRequestType: existing.paymentRequestType ?? legacy.paymentRequestType,
      paymentLink: existing.paymentLink ?? legacy.paymentLink,
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function writePayDrops(items: PayDrop[], userId?: string | null) {
  if (typeof window === "undefined") return false;
  const key = scopedStorageKey(PAY_DROPS_STORAGE_KEY, userId);
  if (!key) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    emitUpdated(userId);
    return true;
  } catch {
    return false;
  }
}

export function upsertPayDrop(drop: PayDrop, userId?: string | null) {
  const current = readPayDrops(userId).filter((item) => item.id !== drop.id);
  const next = [{ ...drop, updatedAt: Date.now() }, ...current].slice(0, 250);
  writePayDrops(next, userId);
  return next;
}

export function removePayDrop(id: string, userId?: string | null) {
  const current = readPayDrops(userId);
  const next = current.filter((item) => item.id !== id);
  writePayDrops(next, userId);
  return next;
}
