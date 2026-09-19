import { createChunks, stringToBase64URL } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { supabaseAuthCookieName } from "@/lib/supabase/config";

export { isBoardAuthRoute, safeBoardNext } from "@/lib/supabase/boardPaths";

export type PendingAuthCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function isSecureRequest(request?: NextRequest | null) {
  if (!request) return false;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

function isDeleteCookie(cookie: PendingAuthCookie) {
  const maxAge = cookie.options?.maxAge;
  return !cookie.value || maxAge === 0 || maxAge === "0";
}

function isAuthTokenCookie(name: string) {
  return name.includes("-auth-token");
}

export function collapseAuthCookies(
  cookiesToSet: PendingAuthCookie[],
  options?: { keepSession?: boolean }
) {
  const byName = new Map<string, PendingAuthCookie>();

  for (const cookie of cookiesToSet) {
    const existing = byName.get(cookie.name);
    if (
      options?.keepSession &&
      existing &&
      !isDeleteCookie(existing) &&
      isDeleteCookie(cookie) &&
      isAuthTokenCookie(cookie.name)
    ) {
      continue;
    }
    byName.set(cookie.name, cookie);
  }

  if (options?.keepSession) {
    for (const [name, cookie] of byName) {
      if (isAuthTokenCookie(name) && isDeleteCookie(cookie)) {
        byName.delete(name);
      }
    }
  }

  return [...byName.values()];
}

export function cookiesFromSession(
  supabaseUrl: string,
  session: unknown
): PendingAuthCookie[] {
  const name = supabaseAuthCookieName(supabaseUrl);
  const encoded = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  return createChunks(name, encoded).map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    options: {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: AUTH_COOKIE_MAX_AGE,
    },
  }));
}

export function nextCookieOptions(
  options: Record<string, unknown> | undefined,
  request?: NextRequest | null
) {
  const maxAge =
    typeof options?.maxAge === "number" ? options.maxAge : AUTH_COOKIE_MAX_AGE;

  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false,
    secure: isSecureRequest(request),
    maxAge,
  };
}

export function applyAuthCookies(
  response: NextResponse,
  cookiesToSet: PendingAuthCookie[],
  request?: NextRequest | null,
  extras?: { keepSession?: boolean; session?: unknown; supabaseUrl?: string }
) {
  let cookies = collapseAuthCookies(cookiesToSet, {
    keepSession: extras?.keepSession,
  });

  const hasSessionCookie = cookies.some(
    (cookie) => isAuthTokenCookie(cookie.name) && !isDeleteCookie(cookie)
  );

  if (
    extras?.keepSession &&
    extras.session &&
    extras.supabaseUrl &&
    !hasSessionCookie
  ) {
    cookies = [
      ...cookies.filter((cookie) => !isAuthTokenCookie(cookie.name)),
      ...cookiesFromSession(extras.supabaseUrl, extras.session),
    ];
  }

  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, nextCookieOptions(options, request));
  });

  return response;
}

export function withPrivateAuthHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
