import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseDropStudioV5Snapshot } from "@/lib/board/dropStudioV5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "board_drop_drafts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function missingTable(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST205" || error?.code === "42P01" || message.includes(TABLE);
}

export async function GET(request: NextRequest) {
  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return json({ ok: false, message: "Sign in to open Drafts Deck." }, 401);

  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  let query = supabase.from(TABLE).select("id, drop_type, editor_state, updated_at").eq("user_id", userId);
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(40);
  if (error) {
    if (missingTable(error)) {
      return json({
        ok: false,
        setupRequired: true,
        drafts: [],
        message: "Drafts Deck is not installed yet. Local drafts still work.",
      });
    }
    return json({ ok: false, drafts: [], message: error.message }, 500);
  }
  return json({ ok: true, drafts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return json({ ok: false, message: "Sign in to sync Drafts Deck." }, 401);

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    dropType?: string;
    editorState?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id.trim().slice(0, 120) : "";
  const editorState = parseDropStudioV5Snapshot(body?.editorState);
  if (!id || !editorState) return json({ ok: false, message: "Draft state is incomplete." }, 400);

  const { error } = await supabase.from(TABLE).upsert(
    {
      id,
      user_id: userId,
      drop_type: body?.dropType === "image" ? "image" : "video",
      editor_state: editorState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    if (missingTable(error)) {
      return json({
        ok: false,
        setupRequired: true,
        message: "Drafts Deck is not installed yet. Local drafts still work.",
      });
    }
    return json({ ok: false, message: error.message }, 500);
  }
  return json({ ok: true, id });
}
