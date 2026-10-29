import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  boardAuthErrorMessage,
  createSupabaseRouteClient,
} from "@/lib/supabase/routeClient";
import { boardAuthUrl } from "@/lib/supabase/boardAuthUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const metadata =
      body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const username = String(metadata.username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);

    if (!email || password.length < 8 || username.length < 3) {
      return NextResponse.json(
        { ok: false, message: "Valid signup details are required." },
        { status: 400 }
      );
    }

    const { supabase, applyCookies, supabaseUrl } = createSupabaseRouteClient(request);
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingProfile?.id) {
      return NextResponse.json(
        { ok: false, message: "That username is already taken. Try another one." },
        { status: 409 }
      );
    }

    const callback = boardAuthUrl("/api/board/auth/callback");
    callback.searchParams.set("next", "/board/profile");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callback.toString(),
        data: { ...metadata, username },
      },
    });

    if (error) {
      return applyCookies(
        NextResponse.json(
          { ok: false, message: boardAuthErrorMessage(error, "Signup failed.") },
          { status: error.status || 400 }
        )
      );
    }

    let session = data.session;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    // Keep sending the real confirmation email, while allowing the user to
    // enter Board immediately. This privileged operation stays server-side.
    if (!session && data.user && serviceRole) {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: confirmError } = await admin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });

      if (confirmError) {
        return applyCookies(
          NextResponse.json(
            {
              ok: false,
              message: "Your account was created, but Board could not finish sign-in. Try logging in.",
            },
            { status: 500 }
          )
        );
      }

      const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !signedIn.session) {
        return applyCookies(
          NextResponse.json(
            {
              ok: false,
              message: boardAuthErrorMessage(
                signInError,
                "Account created. Please log in to continue."
              ),
            },
            { status: 401 }
        );
      }
      session = signedIn.session;
    }

    return applyCookies(
      NextResponse.json({
        ok: true,
        hasSession: Boolean(session),
        access_token: session?.access_token || null,
        refresh_token: session?.refresh_token || null,
      }),
      { keepSession: Boolean(session), session }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Signup failed.",
      },
      { status: 500 }
    );
  }
}
