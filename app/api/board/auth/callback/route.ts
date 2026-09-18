import { NextRequest, NextResponse } from "next/server";
import { safeBoardNext } from "@/lib/supabase/boardPaths";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type") || "email";
  const next = safeBoardNext(request.nextUrl.searchParams.get("next"), "/board/profile");

  try {
    if (!code && !tokenHash) throw new Error("Confirmation token is missing.");

    const { supabase, applyCookies } = createSupabaseRouteClient(request);
    const allowedTypes = ["email", "signup", "invite", "magiclink"] as const;
    const type = allowedTypes.includes(requestedType as (typeof allowedTypes)[number])
      ? requestedType as (typeof allowedTypes)[number]
      : "email";
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (error) throw error;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return applyCookies(
      NextResponse.redirect(new URL(next, request.nextUrl.origin)),
      { keepSession: true, session }
    );
  } catch (error) {
    const destination = next === "/board/reset-password"
      ? "/board/reset-password"
      : "/board/signup";
    const fallback = new URL(destination, request.nextUrl.origin);
    fallback.searchParams.set(
      "error",
      error instanceof Error && error.message.toLowerCase().includes("expired")
        ? "This confirmation link has expired or was already used. Create the account again or request a new confirmation email."
        : error instanceof Error ? error.message : "Confirmation failed."
    );
    return NextResponse.redirect(fallback);
  }
}
