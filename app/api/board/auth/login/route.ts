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

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    const { supabase, applyCookies } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return applyCookies(
        NextResponse.json(
          { ok: false, message: boardAuthErrorMessage(error, "Login failed.") },
          { status: 401 }
        )
      );
    }

    // getUser() waits out the GoTrue initialize/SIGNED_OUT race so the
    // session cookie is not wiped before we copy it onto the response.
    await supabase.auth.getUser().catch(() => undefined);

    return applyCookies(
      NextResponse.json({
        ok: true,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
      { keepSession: true, session: data.session }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Login failed.",
      },
      { status: 500 }
    );
  }
}
