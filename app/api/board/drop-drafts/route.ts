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

function cleanDropType(value: unknown): DraftType | null {
  return typeof value === "string" && (DRAFT_TYPES as readonly string[]).includes(value)
    ? (value as DraftType)
    : null;
}

function cleanStatus(value: unknown): DraftStatus {
  return typeof value === "string" && (DRAFT_STATUSES as readonly string[]).includes(value)
    ? (value as DraftStatus)
    : "editing";
}

function cleanDataUrl(value: unknown) {
  if (typeof value !== "string") return null;
  if (!/^data:/.test(value)) return null;
  // Preview thumbnails only; keep the table lean.
  return value.length > 400_000 ? null : value;
}

function cleanJson(value: unknown) {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value;
  return {};
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

export async function GET() {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, message: "Log in to load Drafts Deck." }, 401);
  }

  const { data, error } = await supabase
    .from(DRAFTS_TABLE)
    .select(
      "id, user_id, title, drop_type, status, preview_data_url, media_bucket, media_path, media_mime, editor_state, meta, version, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return json(draftStorageError(error), isMissingTableError(error) ? 200 : 500);
  }

  return json({ ok: true, drafts: (data || []).map((row) => mapDraftRow(row as DraftRow)) });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, message: "Log in to save to Drafts Deck." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Malformed draft payload." }, 400);
  }

  const dropType = cleanDropType(body.dropType);
  if (!dropType) {
    return json({ ok: false, message: "Unknown draft type." }, 400);
  }

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const row: Record<string, unknown> = {
    id,
    user_id: user.id,
    title: cleanTitle(body.title) || null,
    drop_type: dropType,
    status: cleanStatus(body.status),
    preview_data_url: cleanDataUrl(body.previewDataUrl),
    media_bucket: typeof body.mediaBucket === "string" ? body.mediaBucket : null,
    media_path: typeof body.mediaPath === "string" ? body.mediaPath : null,
    media_mime: typeof body.mediaMime === "string" ? body.mediaMime : null,
    editor_state: cleanJson(body.editorState),
    meta: cleanJson(body.meta),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(DRAFTS_TABLE)
    .upsert(row, { onConflict: "id" })
    .eq("user_id", user.id)
    .select(
      "id, user_id, title, drop_type, status, preview_data_url, media_bucket, media_path, media_mime, editor_state, meta, version, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    return json(draftStorageError(error), isMissingTableError(error) ? 200 : 500);
  }
  if (!data) {
    return json({ ok: false, message: "Draft could not be saved." }, 404);
  }

  return json({ ok: true, draft: mapDraftRow(data as DraftRow) });
}
