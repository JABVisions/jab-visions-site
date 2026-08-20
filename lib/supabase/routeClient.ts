import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export function createSupabaseRouteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  const cookieStore = cookies();
  const pendingCookies: PendingCookie[] = [];
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

  function applyCookies(response: NextResponse) {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  return { supabase, applyCookies };
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
