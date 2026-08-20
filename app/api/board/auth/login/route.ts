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

    const { supabase, applyCookies } = createSupabaseRouteClient();
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

    return applyCookies(NextResponse.json({ ok: true }));
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
