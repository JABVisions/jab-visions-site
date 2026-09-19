import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  applyAuthCookies,
  type PendingAuthCookie,
  withPrivateAuthHeaders,
} from "@/lib/supabase/authCookies";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createSupabaseRouteClient(request?: NextRequest) {
  const { url, key } = getSupabasePublicConfig();

  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  const cookieStore = cookies();
  const pendingCookies: PendingAuthCookie[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  function applyCookies(
    response: NextResponse,
    extras?: { keepSession?: boolean; session?: unknown }
  ) {
    applyAuthCookies(response, pendingCookies, request, {
      keepSession: extras?.keepSession,
      session: extras?.session,
      supabaseUrl: url,
    });
    return withPrivateAuthHeaders(response);
  }

  return { supabase, applyCookies, supabaseUrl: url };
}

export function boardAuthErrorMessage(error: unknown, fallback: string) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message || "")
      : "";

  if (message.toLowerCase().includes("captcha")) {
    return "CAPTCHA protection is enabled in Supabase, but no CAPTCHA widget is configured on Board. Disable CAPTCHA in Supabase Auth settings for local beta testing, then try again.";
  }

  if (message.toLowerCase().includes("rate limit")) {
    return "Supabase's email sending limit has been reached. Do not keep retrying. Wait for the limit to reset, or configure custom SMTP in Supabase and raise the Auth email rate limit.";
  }

  return message || fallback;
}
