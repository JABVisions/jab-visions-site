import { NextRequest, NextResponse } from "next/server";
import {
  boardAuthErrorMessage,
  createSupabaseRouteClient,
} from "@/lib/supabase/routeClient";

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

    const { supabase, applyCookies } = createSupabaseRouteClient();
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

    const callback = new URL("/api/board/auth/callback", request.nextUrl.origin);
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

    return applyCookies(
      NextResponse.json({ ok: true, hasSession: Boolean(data.session) })
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
