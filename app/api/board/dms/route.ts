import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DM_TABLE = "board_direct_messages";

type DirectMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
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
    message.includes("board_direct_messages") ||
    message.includes("schema cache")
  );
}

function dmStorageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Direct messages are not installed in Supabase yet. Run supabase/sql/board_direct_messages.sql in the Supabase SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${DM_TABLE}".`,
    };
  }

  return {
    ok: false,
    message: error?.message || "Direct messages could not sync.",
    hint: `Check that the Supabase table "${DM_TABLE}" exists and has RLS policies for sender/recipient access.`,
  };
}

function cleanRecipientId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUsername(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^@+/, "").toLowerCase() : "";
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveRecipientId(
  supabase: ReturnType<typeof supabaseServer>,
  recipientId: string,
  username: string
) {
  if (looksLikeUuid(recipientId)) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", recipientId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (!username) return "";

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  return data?.id ? String(data.id) : "";
}

function mapMessage(row: DirectMessageRow, currentUserId: string) {
  return {
    id: row.id,
    remoteId: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    from: row.sender_id === currentUserId ? "me" : "them",
    text: row.body,
    at: new Date(row.created_at).getTime(),
    createdAt: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to load direct messages." }, 401);
  }

  const { searchParams } = new URL(req.url);
  const friendId = await resolveRecipientId(
    supabase,
    cleanRecipientId(searchParams.get("friendId")),
    cleanUsername(searchParams.get("username"))
  );

  if (!friendId) {
    return json({ ok: false, message: "Missing friendId." }, 400);
  }

  const { data, error } = await supabase
    .from(DM_TABLE)
    .select("id, sender_id, recipient_id, body, created_at")
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${user.id})`
    )
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return json(dmStorageError(error), 500);
  }

  return json({
    ok: true,
    messages: (data || []).map((row) => mapMessage(row as DirectMessageRow, user.id)),
  });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to send direct messages." }, 401);
  }

  try {
    const body = await req.json();
    const recipientId = await resolveRecipientId(
      supabase,
      cleanRecipientId(body?.recipientId),
      cleanUsername(body?.recipientUsername)
    );
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!recipientId) {
      return json({ ok: false, message: "Missing recipientId." }, 400);
    }

    if (!text) {
      return json({ ok: false, message: "Message cannot be blank." }, 400);
    }

    if (recipientId === user.id) {
      return json({ ok: false, message: "You cannot DM yourself from Friend Zone." }, 400);
    }

    const { data, error } = await supabase
      .from(DM_TABLE)
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        body: text,
      })
      .select("id, sender_id, recipient_id, body, created_at")
      .single();

    if (error) {
      return json(dmStorageError(error), 500);
    }

    return json({ ok: true, message: mapMessage(data as DirectMessageRow, user.id) });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not send direct message.",
      },
      500
    );
  }
}
