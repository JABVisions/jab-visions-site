import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById, roomHref } from "@/lib/board/rooms/catalog";
import { hydrateAuthorRows } from "@/lib/board/rooms/authors";
import { isMissingRoomsTable, json, roomMembershipGate } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("room_drop_shares")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error && isMissingRoomsTable(error)) return json({ ok: true, shares: [], setupRequired: true });
    if (error) return json({ ok: true, shares: [], warning: error.message });
    const shares = await hydrateAuthorRows(
      supabase,
      (data || []) as Record<string, unknown>[],
      "shared_by"
    );
    return json({ ok: true, shares });
  } catch {
    return json({ ok: true, shares: [] });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  const room = roomId ? getRoomById(roomId) : null;
  if (!roomId || !room) return json({ ok: false, message: "Room not found" }, 404);

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const gate = await roomMembershipGate(supabase, roomId, user.id);
  if (!gate.ok) return json({ ok: false, message: gate.message }, gate.status);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const dropId = String(body.dropId || "").trim();
  if (!dropId) return json({ ok: false, message: "dropId is required" }, 400);

  const snapshot =
    body.snapshot && typeof body.snapshot === "object" ? (body.snapshot as Record<string, unknown>) : {};
  const originRaw = String(body.origin || "share");
  const origin =
    originRaw === "create" || originRaw === "conversation" || originRaw === "share" ? originRaw : "share";
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : null;
  const row = {
    room_id: roomId,
    drop_id: dropId,
    shared_by: user.id,
    activity_id: typeof body.activityId === "string" ? body.activityId : null,
    snapshot,
    origin,
    conversation_id: conversationId,
  };

  const { data, error } = await supabase
    .from("room_drop_shares")
    .upsert(row, { onConflict: "room_id,drop_id,shared_by" })
    .select("*")
    .maybeSingle();

  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", share: { ...row, id: `local_${dropId}` } });
  }
  if (error) {
    const fallback = { ...row };
    delete (fallback as { origin?: string }).origin;
    delete (fallback as { conversation_id?: string | null }).conversation_id;
    const retry = await supabase
      .from("room_drop_shares")
      .upsert(fallback, { onConflict: "room_id,drop_id,shared_by" })
      .select("*")
      .maybeSingle();
    if (retry.error) return json({ ok: false, message: retry.error.message }, 500);
    return finishShare({
      supabase,
      userId: user.id,
      room,
      roomId,
      dropId,
      actorName: pickBoardDisplayName(body.displayName, snapshot.authorName) || "Someone",
      dropTitle: String(snapshot.title || "a Drop"),
      conversationTitle: typeof body.conversationTitle === "string" ? body.conversationTitle : "",
      conversationId,
      origin,
      share: retry.data || fallback,
    });
  }

  return finishShare({
    supabase,
    userId: user.id,
    room,
    roomId,
    dropId,
    actorName: pickBoardDisplayName(body.displayName, snapshot.authorName) || "Someone",
    dropTitle: String(snapshot.title || "a Drop"),
    conversationTitle: typeof body.conversationTitle === "string" ? body.conversationTitle : "",
    conversationId,
    origin,
    share: data || row,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const url = new URL(req.url);
  let dropId = String(url.searchParams.get("dropId") || "").trim();
  let shareId = String(url.searchParams.get("shareId") || "").trim();
  if (!dropId && !shareId) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      dropId = String(body.dropId || "").trim();
      shareId = String(body.shareId || "").trim();
    } catch {
      // query only
    }
  }
  if (!dropId && !shareId) return json({ ok: false, message: "dropId is required" }, 400);

  let query = supabase.from("room_drop_shares").delete().eq("room_id", roomId);
  if (shareId) query = query.eq("id", shareId);
  else query = query.eq("drop_id", dropId);

  const { error } = await query;
  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", removed: true });
  }
  if (error) return json({ ok: false, message: error.message }, 500);
  return json({ ok: true, persisted: "db", removed: true });
}

async function finishShare(input: {
  supabase: ReturnType<typeof supabaseServer>;
  userId: string;
  room: { name: string };
  roomId: string;
  dropId: string;
  actorName: string;
  dropTitle: string;
  conversationTitle: string;
  conversationId?: string | null;
  origin: string;
  share: unknown;
}) {
  const extras = {
    dropTitle: input.dropTitle,
    conversationTitle: input.origin === "conversation" ? input.conversationTitle : undefined,
  };
  const href = roomHref(
    input.roomId,
    input.origin === "conversation" && input.conversationId
      ? { conversation: input.conversationId }
      : undefined
  );
  const { data: followers } = await input.supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", input.roomId)
    .eq("following", true);

  for (const follower of followers || []) {
    const recipientId = String((follower as { user_id?: string }).user_id || "");
    if (!recipientId || recipientId === input.userId) continue;
    await createBoardNotification(input.supabase, {
      recipientId,
      actorId: input.userId,
      activityType: "room_drop_shared",
      entityType: "room",
      entityId: input.roomId,
      dropId: input.dropId,
      href,
      message: describeRoomActivity("room_drop_shared", input.actorName, input.room.name, extras),
      metadata: {
        roomId: input.roomId,
        roomName: input.room.name,
        actorName: input.actorName,
        dropTitle: input.dropTitle,
        conversationTitle: extras.conversationTitle,
      },
      groupKey: roomActivityGroupKey("room_drop_shared", input.roomId),
    }).catch(() => undefined);
  }

  await input.supabase
    .from("room_notifications")
    .insert({
      room_id: input.roomId,
      actor_id: input.userId,
      event_type: "drop_shared",
      entity_type: "drop",
      entity_id: input.dropId,
      drop_id: input.dropId,
      message: describeRoomActivity("room_drop_shared", input.actorName, input.room.name, extras),
      href,
    })
    .then(
      () => undefined,
      () => undefined
    );

  return json({ ok: true, persisted: "db", share: input.share });
}
