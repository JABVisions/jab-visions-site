import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseDropStudioV5Snapshot } from "@/lib/board/dropStudioV5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "board_drop_drafts";
const MEDIA_BUCKET = "board-media";

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

function isCloudDraftState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.type === "media") {
    return typeof state.fileName === "string" &&
      typeof state.mimeType === "string" &&
      typeof state.storagePath === "string" &&
      (!state.bucket || state.bucket === MEDIA_BUCKET);
  }
  if (state.type === "voice-project") {
    return Boolean(state.snapshot && typeof state.snapshot === "object") &&
      Array.isArray(state.files) &&
      state.files.length <= 100 &&
      state.files.every((file) =>
        file && typeof file === "object" &&
        typeof (file as Record<string, unknown>).key === "string" &&
        typeof (file as Record<string, unknown>).storagePath === "string"
      );
  }
  return false;
}

async function signedEditorState(supabase: ReturnType<typeof supabaseServer>, raw: unknown) {
  if (!isCloudDraftState(raw)) return raw;
  const state = { ...raw };
  if (state.type === "media") {
    const path = String(state.storagePath);
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24);
    return { ...state, signedUrl: data?.signedUrl || "" };
  }
  const files = await Promise.all(
    (state.files as Array<Record<string, unknown>>).map(async (file) => {
      const { data } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(String(file.storagePath), 60 * 60 * 24);
      return { ...file, signedUrl: data?.signedUrl || "" };
    })
  );
  return { ...state, files };
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
  const visibleDrafts = (data ?? []).filter((draft) => {
    const state = draft.editor_state as Record<string, unknown> | null;
    return state?.type !== "deleted";
  });
  const drafts = await Promise.all(visibleDrafts.map(async (draft) => ({
    ...draft,
    editor_state: await signedEditorState(supabase, draft.editor_state),
  })));
  return json({ ok: true, drafts });
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
  const v5State = parseDropStudioV5Snapshot(body?.editorState);
  const cloudState = isCloudDraftState(body?.editorState) ? body?.editorState : null;
  const editorState = v5State || cloudState;
  if (!id || !editorState) return json({ ok: false, message: "Draft state is incomplete." }, 400);

  const dropType =
    body?.dropType === "image" || body?.dropType === "video" || body?.dropType === "audio"
      ? body.dropType
      : "video";
  // Voice Booth autosaves also write the selected audio file as a media draft.
  // Keep the richer editable session if those two asynchronous saves race.
  if (dropType === "audio" && cloudState?.type === "media") {
    const { data: existing } = await supabase
      .from(TABLE)
      .select("editor_state")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    const existingState = existing?.editor_state as Record<string, unknown> | undefined;
    if (existingState?.type === "voice-project") return json({ ok: true, id });
  }

  const { error } = await supabase.from(TABLE).upsert(
    {
      id,
      user_id: userId,
      drop_type: dropType,
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

export async function DELETE(request: NextRequest) {
  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return json({ ok: false, message: "Sign in to delete this draft." }, 401);

  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) return json({ ok: false, message: "Draft id is required." }, 400);
  const { data: draft, error: readError } = await supabase
    .from(TABLE)
    .select("editor_state")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (readError) return json({ ok: false, message: readError.message }, 500);

  // The Drafts table grants users update access but may not have DELETE enabled.
  // A tombstone keeps deletion reliable without requiring a schema/policy change.
  const { error } = await supabase
    .from(TABLE)
    .update({ editor_state: { type: "deleted" }, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) return json({ ok: false, message: error.message }, 500);

  const state = draft?.editor_state as Record<string, unknown> | undefined;
  const paths = state?.type === "media" && typeof state.storagePath === "string"
    ? [state.storagePath]
    : state?.type === "voice-project" && Array.isArray(state.files)
      ? state.files
          .map((file) => file && typeof file === "object" ? (file as Record<string, unknown>).storagePath : null)
          .filter((path): path is string => typeof path === "string" && path.startsWith(`${userId}/`))
      : [];
  if (paths.length) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => undefined);
  }
  return json({ ok: true, id });
}
