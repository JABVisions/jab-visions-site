"use client";

export const BOARD_PROFILE_STORAGE_KEY = "jab_board_profile_v2";

const IMAGE_DATA_URL_RE = /^data:image\//i;
const ANY_DATA_URL_RE = /^data:/i;
const BOARD_KEY_RE = /^(jab_|board[.:_-])/i;
const LARGE_DATA_URL_MIN_LENGTH = 2000;

function isDataUrl(value: unknown) {
  return typeof value === "string" && ANY_DATA_URL_RE.test(value.trim());
}

function keepNonDataUrl(value: unknown) {
  return typeof value === "string" && !isDataUrl(value) ? value : undefined;
}

export function sanitizeProfileForStorage<T extends Record<string, any>>(profile: T): T {
  const next: Record<string, any> = { ...profile };
  const avatarFromDataUrl = isDataUrl(next.avatarUrl) ? undefined : next.avatarUrl;
  const avatarFromLegacy = keepNonDataUrl(next.avatarDataUrl);

  if (avatarFromDataUrl || avatarFromLegacy) {
    next.avatarUrl = avatarFromDataUrl || avatarFromLegacy;
  }

  delete next.avatarDataUrl;

  if (isDataUrl(next.coverDataUrl)) delete next.coverDataUrl;
  if (Array.isArray(next.visionSlots)) {
    next.visionSlots = next.visionSlots.map((slot: unknown) =>
      IMAGE_DATA_URL_RE.test(String(slot || "").trim()) ? null : slot
    );
  }

  return next as T;
}

export function sanitizeBoardOptionsForStorage<T extends Record<string, any>>(settings: T): T {
  const next: Record<string, any> = { ...settings };
  const avatarFromDataUrl = keepNonDataUrl(next.avatarDataUrl);

  if (!next.avatarUrl && avatarFromDataUrl) next.avatarUrl = avatarFromDataUrl;
  delete next.avatarDataUrl;

  if (isDataUrl(next.coverDataUrl)) delete next.coverDataUrl;
  if (Array.isArray(next.visionSlots)) {
    next.visionSlots = next.visionSlots.map((slot: unknown) =>
      isDataUrl(slot) ? null : slot
    );
  }

  return next as T;
}

export function writeLightweightLocalStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(value);
  window.localStorage.removeItem(key);
  window.localStorage.setItem(key, serialized);
}

export function cleanupStoredBoardProfile() {
  if (typeof window === "undefined") return;

  const keys = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === BOARD_PROFILE_STORAGE_KEY || key?.startsWith(`${BOARD_PROFILE_STORAGE_KEY}:`)) {
        keys.add(key);
      }
    }
  } catch {
    // Ignore optional identity cleanup.
  }

  keys.add(BOARD_PROFILE_STORAGE_KEY);

  for (const key of Array.from(keys)) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      const sanitized = sanitizeProfileForStorage(parsed);
      writeLightweightLocalStorage(key, sanitized);
    } catch {
      // If old profile JSON is malformed, leave it alone.
    }
  }
}

export function cleanupStoredBoardOptions(optionsStorageKey: string) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(optionsStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    writeLightweightLocalStorage(optionsStorageKey, sanitizeBoardOptionsForStorage(parsed));
  } catch {
    // Leave malformed settings alone; the next explicit save can repair defaults.
  }
}

function stripLargeDataUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return ANY_DATA_URL_RE.test(value.trim()) && value.length > LARGE_DATA_URL_MIN_LENGTH
      ? null
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripLargeDataUrls(item));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = stripLargeDataUrls(entry);
    }
    return next;
  }

  return value;
}

export function cleanupBoardLocalStorageMedia() {
  if (typeof window === "undefined") return;

  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && BOARD_KEY_RE.test(key)) keys.push(key);
    }
  } catch {
    return;
  }

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw || !raw.includes("data:")) continue;

      const parsed = JSON.parse(raw);
      const cleaned = stripLargeDataUrls(parsed);
      writeLightweightLocalStorage(key, cleaned);
    } catch {
      // Skip non-JSON or malformed Board cache entries.
    }
  }
}

export function isStorageQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; code?: number; message?: string };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014 ||
    /quota|exceeded|storage/i.test(err.message || "")
  );
}
