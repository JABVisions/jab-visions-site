import { stringFromBase64URL } from "@supabase/ssr";
import { supabaseAuthCookieName } from "@/lib/supabase/config";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const BOARD_UPLOAD_SESSION_TIMEOUT_MS = 4_000;
const SESSION_STILL_VALID_MS = 5_000;
const SESSION_REFRESH_SOON_MS = 60_000;

export type BoardUploadSession = {
  access_token: string;
  user: { id: string };
  expires_at?: number;
  refresh_token?: string;
};

export class BoardUploadSessionError extends Error {
  constructor(message: string, readonly code = "auth") {
    super(message);
    this.name = "BoardUploadSessionError";
  }
}

let cachedSession: BoardUploadSession | null = null;

export function rememberBoardUploadSession(session: unknown): BoardUploadSession | null {
  const parsed = coerceUploadSession(session);
  if (!parsed) return cachedSession;
  cachedSession = parsed;
  return parsed;
}

export function peekBoardUploadSession(): BoardUploadSession | null {
  return cachedSession;
}

export function clearBoardUploadSession() {
  cachedSession = null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function coerceUploadSession(value: unknown): BoardUploadSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested =
    record.currentSession && typeof record.currentSession === "object"
      ? (record.currentSession as Record<string, unknown>)
      : record.session && typeof record.session === "object"
        ? (record.session as Record<string, unknown>)
        : record;
  const userRaw = nested.user && typeof nested.user === "object" ? (nested.user as Record<string, unknown>) : null;
  const id = String(userRaw?.id || nested.user_id || "").trim();
  const access_token = String(nested.access_token || nested.accessToken || "").trim();
  if (!id || !access_token) return null;
  const expires_at =
    typeof nested.expires_at === "number"
      ? nested.expires_at
      : typeof nested.expiresAt === "number"
        ? nested.expiresAt
        : undefined;
  const refresh_token = String(nested.refresh_token || nested.refreshToken || "").trim() || undefined;
  return {
    access_token,
    user: { id },
    ...(typeof expires_at === "number" ? { expires_at } : {}),
    ...(refresh_token ? { refresh_token } : {}),
  };
}

/**
 * A session can upload when it still has a user id + JWT.
 * Near-expiry tokens are usable; we refresh in the background instead of
 * blocking iPhone studio on `refreshSession()` (that is what mapped to
 * "must be signed in" while the user was already in a logged-in room).
 */
export function isUsableUploadSession(
  session: unknown,
  now = Date.now(),
  opts?: { minValidityMs?: number }
): session is BoardUploadSession {
  const parsed = coerceUploadSession(session);
  if (!parsed) return false;
  const minValidityMs =
    typeof opts?.minValidityMs === "number" && Number.isFinite(opts.minValidityMs)
      ? opts.minValidityMs
      : SESSION_STILL_VALID_MS;
  const expiresAtMs = parsed.expires_at ? parsed.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs <= now + minValidityMs) return false;
  return true;
}

export function parseStoredAuthSession(raw: string): BoardUploadSession | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  let payload = trimmed;
  if (payload.startsWith("base64-")) {
    try {
      payload = stringFromBase64URL(payload.slice("base64-".length));
    } catch {
      return null;
    }
  }
  try {
    return coerceUploadSession(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const cut = part.indexOf("=");
    if (cut <= 0) continue;
    const name = part.slice(0, cut).trim();
    const value = part.slice(cut + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function parseBoardAuthCookies(
  cookieHeader: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
): BoardUploadSession | null {
  const cookies = parseCookieHeader(cookieHeader);
  const prefix = supabaseAuthCookieName(supabaseUrl);
  const direct = cookies[prefix];
  if (direct) return parseStoredAuthSession(direct);
  const chunks: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const part = cookies[`${prefix}.${i}`];
    if (!part) break;
    chunks.push(part);
  }
  if (!chunks.length) {
    for (const [name, value] of Object.entries(cookies)) {
      if (name.includes("-auth-token") && !name.endsWith(".0") && value) {
        const parsed = parseStoredAuthSession(value);
        if (parsed) return parsed;
      }
    }
    return null;
  }
  return parseStoredAuthSession(chunks.join(""));
}

export function readBrowserStoredSession(): BoardUploadSession | null {
  if (typeof document !== "undefined" && document.cookie) {
    const fromCookie = parseBoardAuthCookies(document.cookie);
    if (fromCookie) return fromCookie;
  }
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return null;
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = supabaseAuthCookieName(url);
    const raw = window.localStorage.getItem(key) || window.localStorage.getItem(`${key}-code-verifier`);
    if (raw) return parseStoredAuthSession(raw);
  } catch {
    return null;
  }
  return null;
}

export type ResolveBoardUploadSessionDeps = {
  getSession?: () => Promise<{ data: { session: unknown } }>;
  refreshSession?: () => Promise<{ data: { session: unknown } }>;
  readStoredSession?: () => BoardUploadSession | null;
  now?: number;
  timeoutMs?: number;
};

async function refreshAndRemember(
  refreshSession: ResolveBoardUploadSessionDeps["refreshSession"],
  timeoutMs: number
): Promise<BoardUploadSession | null> {
  if (!refreshSession) return null;
  try {
    const { data } = await withTimeout(
      refreshSession(),
      timeoutMs,
      "Sign-in check timed out."
    );
    if (isUsableUploadSession(data.session, Date.now(), { minValidityMs: 0 })) {
      return rememberBoardUploadSession(data.session);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the Board storage JWT for a user who is already in a logged-in room.
 * Never wait on a hung auth lock long enough to stall a video PUT, and never
 * treat a timed-out `getSession()` as signed-out when cookies still hold a JWT.
 */
export async function resolveBoardUploadSession(
  deps?: ResolveBoardUploadSessionDeps
): Promise<BoardUploadSession> {
  const now = deps?.now ?? Date.now();
  const timeoutMs = deps?.timeoutMs ?? BOARD_UPLOAD_SESSION_TIMEOUT_MS;
  const cached = peekBoardUploadSession();
  if (isUsableUploadSession(cached, now, { minValidityMs: SESSION_STILL_VALID_MS })) {
    if (!isUsableUploadSession(cached, now, { minValidityMs: SESSION_REFRESH_SOON_MS })) {
      const refresh =
        deps?.refreshSession ||
        (() => Promise.resolve(supabaseBrowser().auth.refreshSession()));
      void refreshAndRemember(refresh, timeoutMs);
    }
    return cached;
  }

  const getSession =
    deps?.getSession ||
    (() => Promise.resolve(supabaseBrowser().auth.getSession()));
  const refreshSession =
    deps?.refreshSession ||
    (() => Promise.resolve(supabaseBrowser().auth.refreshSession()));
  const readStored = deps?.readStoredSession || readBrowserStoredSession;

  let live: unknown = null;
  try {
    const { data } = await withTimeout(getSession(), timeoutMs, "Sign-in check timed out.");
    live = data?.session;
  } catch {
    live = null;
  }

  if (isUsableUploadSession(live, now, { minValidityMs: SESSION_STILL_VALID_MS })) {
    rememberBoardUploadSession(live);
    return live;
  }

  const stored = readStored();
  if (isUsableUploadSession(stored, now, { minValidityMs: SESSION_STILL_VALID_MS })) {
    rememberBoardUploadSession(stored);
    return stored;
  }

  const candidate = coerceUploadSession(live) || stored || cached;
  const refreshed = await refreshAndRemember(refreshSession, timeoutMs);
  if (refreshed) return refreshed;

  if (isUsableUploadSession(candidate, now, { minValidityMs: 0 })) {
    rememberBoardUploadSession(candidate);
    return candidate;
  }

  throw new BoardUploadSessionError("Sign in to upload this video.", "auth");
}
