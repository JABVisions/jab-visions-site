import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMENTS_TABLE = "board_drop_comments";

type DropCommentRow = {
  id: string;
  drop_id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
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
    message.includes(COMMENTS_TABLE) ||
    message.includes("schema cache")
  );
}

function commentStorageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Drop comments are not installed in Supabase yet. Run supabase/sql/board_drop_comments.sql in the Supabase SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${COMMENTS_TABLE}".`,
    };
  }

  return {
    ok: false,
    message: error?.message || "Drop comments could not sync.",
    hint: `Check that the Supabase table "${COMMENTS_TABLE}" exists and has RLS policies for authenticated users.`,
  };
}

function cleanDropId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function cleanDropIds(value: unknown) {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => cleanDropId(item))
        .filter(Boolean)
    )
  ).slice(0, 80);
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function mapComment(row: DropCommentRow) {
  return {
    id: row.id,
    remoteId: row.id,
    dropId: row.drop_id,
    userId: row.user_id ?? undefined,
    username: row.username || "board",
    displayName: row.display_name || undefined,
    avatarUrl: row.avatar_url || undefined,
    body: row.body,
    createdAt: row.created_at,
  };
}

function countByDrop(rows: DropCommentRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.drop_id] = (acc[row.drop_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to load drop comments." }, 401);
  }

  const { searchParams } = new URL(req.url);
  const dropId = cleanDropId(searchParams.get("dropId"));
  const dropIds = cleanDropIds(searchParams.get("dropIds"));
  const ids = dropId ? [dropId] : dropIds;

  if (!ids.length) {
    return json({ ok: false, message: "Missing dropId." }, 400);
  }

  let query = supabase
    .from(COMMENTS_TABLE)
    .select("id, drop_id, user_id, username, display_name, avatar_url, body, created_at")
    .order("created_at", { ascending: true })
    .limit(600);

  query = ids.length === 1 ? query.eq("drop_id", ids[0]) : query.in("drop_id", ids);

  const { data, error } = await query;

  if (error) {
    return json(commentStorageError(error), 500);
  }

  const rows = (data || []) as DropCommentRow[];

  return json({
    ok: true,
    comments: rows.map(mapComment),
    counts: countByDrop(rows),
  });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to comment on drops." }, 401);
  }

  try {
    const body = await req.json();
    const dropId = cleanDropId(body?.dropId);
    const text = cleanText(body?.body);
    const username = cleanText(body?.username, "board").replace(/^@+/, "").toLowerCase();
    const displayName = cleanText(body?.displayName, "Board User");
    const avatarUrl = cleanText(body?.avatarUrl);

    if (!dropId) {
      return json({ ok: false, message: "Missing dropId." }, 400);
    }

    if (!text) {
      return json({ ok: false, message: "Comment cannot be blank." }, 400);
    }

    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .insert({
        drop_id: dropId,
        user_id: user.id,
        username,
        display_name: displayName,
        avatar_url: avatarUrl || null,
        body: text,
      })
      .select("id, drop_id, user_id, username, display_name, avatar_url, body, created_at")
      .single();

    if (error) {
      return json(commentStorageError(error), 500);
    }

    return json({ ok: true, comment: mapComment(data as DropCommentRow) });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not save drop comment.",
      },
      500
    );
  }
}
