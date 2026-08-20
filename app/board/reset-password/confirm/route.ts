import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");

  try {
    if (!code && !tokenHash) {
      throw new Error("The password reset link is missing its confirmation token.");
    }

    const { supabase, applyCookies } = createSupabaseRouteClient();
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (error) throw error;

    return applyCookies(
      NextResponse.redirect(
        new URL("/board/reset-password", request.nextUrl.origin)
      )
    );
  } catch (error) {
    const resetPassword = new URL(
      "/board/reset-password",
      request.nextUrl.origin
    );
    const rawMessage =
      error instanceof Error ? error.message : "This password reset link is invalid or has expired.";
    const message = rawMessage.toLowerCase().includes("code verifier")
      ? "This older reset email cannot be verified. Request a new Board reset link below, then open the newest email."
      : rawMessage;
    resetPassword.searchParams.set(
      "error",
      message
    );
    return NextResponse.redirect(resetPassword);
  }
}
