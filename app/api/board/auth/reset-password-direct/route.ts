import { NextRequest, NextResponse } from "next/server";
import {
  boardAuthErrorMessage,
  createSupabaseRouteClient,
} from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToResetPage(
  request: NextRequest,
  key: "updated" | "error",
  message: string,
  email = ""
) {
  const target = new URL("/board/reset-password", request.nextUrl.origin);
  target.searchParams.set(key, message);
  if (email) target.searchParams.set("email", email);
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
    const email = String(body?.email || "").trim().toLowerCase();
    const currentPassword = String(body?.currentPassword || "");
    const password = String(body?.password || "");
    const confirmPassword = String(body?.confirmPassword || "");

    const fail = (message: string, status = 400) => {
      if (isFormSubmission) {
        return redirectToResetPage(request, "error", message, email);
      }
      return NextResponse.json({ ok: false, message }, { status });
    };

    if (!email || !currentPassword) {
      return fail("Enter your email and current password.");
    }
    if (password.length < 8) {
      return fail("New password must be at least 8 characters.");
    }
    if (isFormSubmission && password !== confirmPassword) {
      return fail("New passwords do not match.");
    }
    if (password === currentPassword) {
      return fail("Choose a new password that differs from your current one.");
    }

    const { supabase, applyCookies } = createSupabaseRouteClient(request);
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

    if (signInError || !signInData.session) {
      return fail(
        "We couldn’t verify that email and current password. Check them and try again.",
        401
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      const message = boardAuthErrorMessage(
        updateError,
        "Could not update your password. Please try again."
      );
      if (isFormSubmission) {
        return applyCookies(redirectToResetPage(request, "error", message, email), {
          keepSession: true,
          session: signInData.session,
        });
      }
      return applyCookies(
        NextResponse.json({ ok: false, message }, { status: updateError.status || 400 }),
        { keepSession: true, session: signInData.session }
      );
    }

    await supabase.auth.getUser().catch(() => undefined);

    if (isFormSubmission) {
      return applyCookies(
        redirectToResetPage(
          request,
          "updated",
          "Your password has been updated. You can now log in with the new password."
        ),
        { keepSession: true, session: signInData.session }
      );
    }

    return applyCookies(NextResponse.json({ ok: true }), {
      keepSession: true,
      session: signInData.session,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update your password.";
    if (isFormSubmission) {
      return redirectToResetPage(request, "error", message);
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
