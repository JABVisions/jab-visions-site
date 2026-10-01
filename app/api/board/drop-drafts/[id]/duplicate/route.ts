import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFTS_TABLE = "board_drop_drafts";

type DraftRow = {
  id: string;
  user_id: string;
  title: string | null;
  drop_type: string;
  status: string;
  preview_data_url: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_mime: string | null;
  editor_state: unknown;
  meta: unknown;
  version: number;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes(DRAFTS_TABLE) ||
    message.includes("schema cache")
  );
}

function draftStorageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Drafts Deck is not installed in Supabase yet. Run supabase/sql/board_drop_drafts.sql in the Supabase SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${DRAFTS_TABLE}".`,
    };
  }
  return {
    ok: false,
    message: error?.message || "Draft could not be duplicated.",
    hint: `Check that the Supabase table "${DRAFTS_TABLE}" exists and has RLS policies for authenticated users.`,
  };
}

function mapDraftRow(row: DraftRow) {
  return {
    id: row.id,
    title: row.title || "",
    dropType: row.drop_type,
    status: row.status,
    previewDataUrl: row.preview_data_url || undefined,
    mediaBucket: row.media_bucket || undefined,
    mediaPath: row.media_path || undefined,
    mediaMime: row.media_mime || undefined,
    editorState: row.editor_state ?? {},
    meta: row.meta ?? {},
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function POST(_req: NextRequest, context: { params: { id: string } }) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, message: "Log in to duplicate this draft." }, 401);
  }

  const { data: original, error: readError } = await supabase
    .from(DRAFTS_TABLE)
    .select(
      "id, user_id, title, drop_type, status, preview_data_url, media_bucket, media_path, media_mime, editor_state, meta, version, created_at, updated_at"
    )
    .eq("id", context.params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return json(draftStorageError(readError), isMissingTableError(readError) ? 200 : 500);
  if (!original) return json({ ok: false, message: "Draft not found." }, 404);

  const row = original as DraftRow;
  let mediaPath = row.media_path;

  if (row.media_bucket && row.media_path) {
    const ext = row.media_path.includes(".") ? row.media_path.split(".").pop() : "";
    const copyPath = row.media_path.replace(
      /(\/[^/]+)$/,
      `-copy-${Date.now()}${ext ? `.${ext}` : ""}`
    );
    const { error: copyError } = await supabase.storage
      .from(row.media_bucket)
      .copy(row.media_path, copyPath);
    if (!copyError) {
      mediaPath = copyPath;
    }
    // If copy fails (older storage API or permissions), fall back to sharing
    // the original object rather than blocking the duplicate entirely.
  }

  const { data, error } = await supabase
    .from(DRAFTS_TABLE)
    .insert({
      user_id: user.id,
      title: row.title ? `${row.title} copy` : "Untitled copy",
      drop_type: row.drop_type,
      status: row.status,
      preview_data_url: row.preview_data_url,
      media_bucket: row.media_bucket,
      media_path: mediaPath,
      media_mime: row.media_mime,
      editor_state: row.editor_state,
      meta: row.meta,
    })
    .select(
      "id, user_id, title, drop_type, status, preview_data_url, media_bucket, media_path, media_mime, editor_state, meta, version, created_at, updated_at"
    )
    .maybeSingle();

  if (error) return json(draftStorageError(error), isMissingTableError(error) ? 200 : 500);
  if (!data) return json({ ok: false, message: "Draft could not be duplicated." }, 500);

  return json({ ok: true, draft: mapDraftRow(data as DraftRow) });
}
