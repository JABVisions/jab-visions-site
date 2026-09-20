import { NextRequest, NextResponse } from "next/server";
import { ensureBoardMediaFileSizeLimit } from "@/lib/board/ensureBoardMediaLimits";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return applyCookies(NextResponse.json({ ok: false, message: "Sign in to upload Board media." }, { status: 401 }));
  }

  const rpc = await supabase.rpc("ensure_board_media_file_size_limit");
  if (!rpc.error) {
    return applyCookies(
      NextResponse.json({
        ok: true,
        limit: typeof rpc.data === "number" ? rpc.data : 4294967296,
        buckets: ["board-media", "board-docs"],
      })
    );
  }

  const result = await ensureBoardMediaFileSizeLimit();
  return applyCookies(
    NextResponse.json({
      ok: result.ok,
      limit: result.limit,
      buckets: result.buckets,
      message: result.error || undefined,
    })
  );
}
