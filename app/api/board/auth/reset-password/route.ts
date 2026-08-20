import { NextRequest, NextResponse } from "next/server";
import {
  boardAuthErrorMessage,
  createSupabaseRouteClient,
} from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginRedirect(
  request: NextRequest,
  destination: string,
  key: "sent" | "error",
  message: string
) {
  const target = new URL(destination, request.nextUrl.origin);
  target.searchParams.set(key, message);
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
    const email = String(body?.email || "").trim();
    const requestedReturnTo = String(body?.returnTo || "");
    const returnTo = requestedReturnTo === "/board/forgot-password" ||
      requestedReturnTo === "/board/reset-password"
      ? requestedReturnTo
      : "/board/login";

    if (!email) {
      if (isFormSubmission) {
        return loginRedirect(
          request,
          returnTo,
          "error",
          "Enter your email first, then use Forgot password."
        );
      }
      return NextResponse.json(
        { ok: false, message: "Email is required." },
        { status: 400 }
      );
    }

    const { supabase, applyCookies } = createSupabaseRouteClient();
    // Recovery emails land inside the reset-password flow. The confirmation
    // route exchanges Supabase's one-time code, stores the recovery session,
    // and then forwards the user to the new-password form.
    const callback = new URL(
      "/board/reset-password/confirm",
      request.nextUrl.origin
    );

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callback.toString(),
    });

    if (error) {
      const message = boardAuthErrorMessage(error, "Could not send reset email.");
      if (isFormSubmission) {
        return loginRedirect(request, returnTo, "error", message);
      }
      return applyCookies(
        NextResponse.json(
          {
            ok: false,
            message,
          },
          { status: error.status || 400 }
        )
      );
    }

    if (isFormSubmission) {
      return applyCookies(
        loginRedirect(
          request,
          returnTo,
          "sent",
          "Password reset link sent. Check your email."
        )
      );
    }

    return applyCookies(
      NextResponse.json({
        ok: true,
        message: "Password reset link sent. Check your email.",
      })
    );
  } catch (error) {
    const message =
      boardAuthErrorMessage(error, "Could not send reset email.");
    if (isFormSubmission) {
      return loginRedirect(request, "/board/reset-password", "error", message);
    }
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}
