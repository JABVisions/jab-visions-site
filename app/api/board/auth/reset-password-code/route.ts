import { NextRequest, NextResponse } from "next/server";
import {
  boardAuthErrorMessage,
  createSupabaseRouteClient,
} from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resetRedirect(
  request: NextRequest,
  params: { step: "email" | "code" | "password"; email?: string; sent?: string; error?: string }
) {
  const target = new URL("/board/reset-password", request.nextUrl.origin);
  target.searchParams.set("step", params.step);
  if (params.email) target.searchParams.set("email", params.email);
  if (params.sent) target.searchParams.set("sent", params.sent);
  if (params.error) target.searchParams.set("error", params.error);
  return NextResponse.redirect(target, { status: 303 });
}

export async function POST(request: NextRequest) {
  const isFormSubmission = request.headers
    .get("content-type")
    ?.includes("application/x-www-form-urlencoded");

  try {
    const body = isFormSubmission
      ? Object.fromEntries(await request.formData())
      : await request.json();
    const action = String(body?.action || "send");
    const email = String(body?.email || "").trim().toLowerCase();
    const fail = (
      message: string,
      step: "email" | "code" = action === "verify" ? "code" : "email",
      status = 400
    ) => {
      if (isFormSubmission) {
        return resetRedirect(request, { step, email, error: message });
      }
      return NextResponse.json({ ok: false, message }, { status });
    };

    if (!email) return fail("Enter your Board email.", "email");

    const { supabase, applyCookies } = createSupabaseRouteClient(request);

    if (action === "send") {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        return fail(
          boardAuthErrorMessage(error, "Could not send a verification code."),
          "email",
          error.status || 400
        );
      }

      const message =
        "If a Board account uses this email, a verification code is on its way.";
      if (isFormSubmission) {
        return applyCookies(
          resetRedirect(request, { step: "code", email, sent: message })
        );
      }
      return applyCookies(NextResponse.json({ ok: true, message }));
    }

    if (action !== "verify") return fail("Choose a valid reset step.", "email");

    const token = String(body?.token || "").trim();
    if (!/^\d{6}$/.test(token)) {
      return fail("Enter the 6-digit code from your email.");
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });

    if (error || !data.user || !data.session) {
      return fail("That code is incorrect or expired. Request a new code.", "code", 401);
    }

    if (!data.user.email || data.user.email.toLowerCase() !== email) {
      return fail("That code does not match this email address.", "code", 401);
    }

    if (isFormSubmission) {
      return applyCookies(
        resetRedirect(request, { step: "password", email }),
        { keepSession: true, session: data.session }
      );
    }

    return applyCookies(NextResponse.json({ ok: true }), {
      keepSession: true,
      session: data.session,
    });
  } catch (error) {
    const message = boardAuthErrorMessage(
      error,
      "Could not continue password reset. Please try again."
    );
    if (isFormSubmission) {
      return resetRedirect(request, { step: "email", error: message });
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
