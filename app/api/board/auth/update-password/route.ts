import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resetRedirect(
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
    const password = String(body?.password || "");
    const confirmPassword = String(body?.confirmPassword || "");

    if (!email) {
      if (isFormSubmission) {
        return resetRedirect(request, "error", "Enter your account email.");
      }
      return NextResponse.json(
        { ok: false, message: "Enter your account email." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      if (isFormSubmission) {
        return resetRedirect(
          request,
          "error",
          "Password must be at least 8 characters.",
          email
        );
      }
      return NextResponse.json(
        { ok: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (isFormSubmission && password !== confirmPassword) {
      return resetRedirect(request, "error", "Passwords do not match.", email);
    }

    const { supabase, applyCookies } = createSupabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (isFormSubmission) {
        return applyCookies(
          resetRedirect(
            request,
            "error",
            "This reset link is invalid or has expired. Request a new link.",
            email
          )
        );
      }
      return applyCookies(
        NextResponse.json(
          { ok: false, message: "This reset link is invalid or has expired." },
          { status: 401 }
        )
      );
    }

    if (!user.email || user.email.toLowerCase() !== email) {
      if (isFormSubmission) {
        return applyCookies(
          resetRedirect(
            request,
            "error",
            "That email does not match the account in this password reset link.",
            email
          )
        );
      }
      return applyCookies(
        NextResponse.json(
          {
            ok: false,
            message: "That email does not match this password reset account.",
          },
          { status: 400 }
        )
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (isFormSubmission) {
        return applyCookies(resetRedirect(request, "error", error.message, email));
      }
      return applyCookies(
        NextResponse.json(
          { ok: false, message: error.message },
          { status: error.status || 400 }
        )
      );
    }

    if (isFormSubmission) {
      return applyCookies(
        resetRedirect(
          request,
          "updated",
          "Your password has been updated. You can now log in with the new password."
        )
      );
    }

    return applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update password.";
    if (isFormSubmission) {
      return resetRedirect(request, "error", message);
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
