import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isMissingNotificationsError } from "@/lib/board/createNotification";
import { loadLegacyNotifications } from "@/lib/board/legacyNotifications";
import {
  mapNotificationRow,
  matchesActivityFilter,
  mergeNotificationLists,
  type ActivityFilter,
  type BoardNotification,
} from "@/lib/board/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "board_notifications";
const PAGE_SIZE = 40;
const MAX_PAGE = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingNotificationsError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Activity Channel is not installed in Supabase yet. Run supabase/sql/board_notifications.sql in the SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${TABLE}".`,
    };
  }
  return {
    ok: false,
    message: error?.message || "Activity Channel could not sync.",
    hint: `Check that "${TABLE}" exists and recipients can select/update their own rows.`,
  };
}

function cleanFilter(value: unknown): ActivityFilter {
  const raw = String(value || "").trim();
  if (
    raw === "signals" ||
    raw === "social" ||
    raw === "messages" ||
    raw === "comments" ||
    raw === "requests"
  ) {
    return raw;
  }
  return "all";
}

function typesForFilter(filter: ActivityFilter) {
  if (filter === "signals") return ["signal", "drop", "work_board"];
  if (filter === "social") return ["wave", "friendzone_connected", "reaction"];
  if (filter === "messages") return ["dm"];
  if (filter === "comments") return ["comment", "comment_reply", "mention"];
  if (filter === "requests") return ["friendzone_request"];
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to load Activity Channel." }, 401);
  }

  const { searchParams } = new URL(req.url);
  const filter = cleanFilter(searchParams.get("filter"));
  const before = String(searchParams.get("before") || "").trim();
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, Number(searchParams.get("limit") || PAGE_SIZE) || PAGE_SIZE)
  );
  const types = typesForFilter(filter);

  try {
    await supabase.rpc("backfill_my_board_notifications");
  } catch {
    // Inbox still loads from live rows + legacy comments/DMs.
  }

  let query = supabase
    .from(TABLE)
    .select(
      "id, recipient_id, actor_id, activity_type, entity_type, entity_id, drop_id, comment_id, conversation_id, friendzone_request_id, signal_id, message, preview, href, image_url, metadata, priority, action_required, group_key, created_at, read_at, seen_at"
    )
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (types) query = query.in("activity_type", types);
  if (before) query = query.lt("created_at", before);

  const [{ data, error }, unread] = await Promise.all([
    query,
    supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
  ]);

  if (error) return json(storageError(error), 500);

  const persisted = (data || [])
    .map((row) => mapNotificationRow(row as Record<string, unknown>))
    .filter((row): row is BoardNotification => Boolean(row));

  let legacy: BoardNotification[] = [];
  try {
    legacy = (await loadLegacyNotifications(supabase, user.id)).filter((item) =>
      matchesActivityFilter(item, filter)
    );
  } catch {
    legacy = [];
  }

  const merged = mergeNotificationLists(legacy, persisted).filter((item) =>
    !before ? true : item.createdAt < before
  );
  const items = merged.slice(0, limit);
  const extraUnread = legacy.filter((item) => {
    if (item.readAt) return false;
    const key = String(item.metadata?.legacyKey || "");
    return !persisted.some(
      (row) => row.id === item.id || (key && key === String(row.metadata?.legacyKey || ""))
    );
  }).length;

  return json({
    ok: true,
    items,
    unreadCount: (unread.count ?? persisted.filter((item) => !item.readAt).length) + extraUnread,
    nextCursor:
      persisted.length === limit || merged.length > limit
        ? items[items.length - 1]?.createdAt ?? null
        : null,
    setupRequired: false,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to update Activity Channel." }, 401);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "read").trim();
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean).slice(0, 80)
      : [];
    const persistedIds = ids.filter((id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    );
    const all = Boolean(body?.all);
    const now = new Date().toISOString();

    const patch =
      action === "seen"
        ? { seen_at: now }
        : action === "unread"
          ? { read_at: null, seen_at: null }
          : { read_at: now, seen_at: now };

    let query = supabase.from(TABLE).update(patch).eq("recipient_id", user.id);
    if (!all) {
      if (!ids.length) return json({ ok: false, message: "Missing notification ids." }, 400);
      if (!persistedIds.length) return json({ ok: true, action, ids, all });
      query = query.in("id", persistedIds);
    }

    const { error } = await query;
    if (error) return json(storageError(error), 500);

    return json({ ok: true, action, ids, all });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not update Activity Channel.",
      },
      500
    );
  }
}
