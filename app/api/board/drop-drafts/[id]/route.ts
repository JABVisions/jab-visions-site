import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFTS_TABLE = "board_drop_drafts";

const DRAFT_TYPES = ["photo", "video", "art", "voice", "descript", "dropbook"] as const;
type DraftType = (typeof DRAFT_TYPES)[number];

const DRAFT_STATUSES = ["sketching", "editing", "ready", "converted", "archived"] as const;
type DraftStatus = (typeof DRAFT_STATUSES)[number];

type DraftRow = {
  id: string;
  user_id: string;
  title: string | null;
  drop_type: DraftType;
  status: DraftStatus;
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
    message: error?.message || "Drafts could not sync.",
    hint: `Check that the Supabase table "${DRAFTS_TABLE}" exists and has RLS policies for authenticated users.`,
  };
}

function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function cleanStatus(value: unknown): DraftStatus | null {
  return typeof value === "string" && (DRAFT_STATUSES as readonly string[]).includes(value)
    ? (value as DraftStatus)
    : null;
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

async function requireUser(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error ? null : user;
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const supabase = supabaseServer();
  const user = await requireUser(supabase);
  if (!user) return json({ ok: false, message: "Log in to edit this draft." }, 401);

  const id = context.params.id;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Malformed request." }, 400);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = cleanTitle(body.title) || null;
  const status = cleanStatus(body.status);
  if (status) patch.status = status;

  const { data, error } = await supabase
    .from(DRAFTS_TABLE)
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, user_id, title, drop_type, status, preview_data_url, media_bucket, media_path, media_mime, editor_state, meta, version, created_at, updated_at"
    )
    .maybeSingle();

  if (error) return json(draftStorageError(error), isMissingTableError(error) ? 200 : 500);
  if (!data) return json({ ok: false, message: "Draft not found." }, 404);

  return json({ ok: true, draft: mapDraftRow(data as DraftRow) });
}

export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  const supabase = supabaseServer();
  const user = await requireUser(supabase);
  if (!user) return json({ ok: false, message: "Log in to delete this draft." }, 401);

  const { error } = await supabase
    .from(DRAFTS_TABLE)
    .delete()
    .eq("id", context.params.id)
    .eq("user_id", user.id);

  if (error) return json(draftStorageError(error), isMissingTableError(error) ? 200 : 500);
  return json({ ok: true });
}
