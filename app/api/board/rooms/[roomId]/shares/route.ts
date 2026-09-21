import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";

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
    return json({ ok: true, shares: data || [] });
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
  const row = {
    room_id: roomId,
    drop_id: dropId,
    shared_by: user.id,
    activity_id: typeof body.activityId === "string" ? body.activityId : null,
    snapshot,
  };

  const { data, error } = await supabase
    .from("room_drop_shares")
    .upsert(row, { onConflict: "room_id,drop_id,shared_by" })
    .select("*")
    .maybeSingle();

  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", share: { ...row, id: `local_${dropId}` } });
  }
  if (error) return json({ ok: false, message: error.message }, 500);

  const actorName = String(body.displayName || snapshot.authorName || "Someone");
  const dropTitle = String(snapshot.title || "a Drop");
  const { data: followers } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("following", true);

  for (const follower of followers || []) {
    const recipientId = String((follower as any).user_id || "");
    if (!recipientId || recipientId === user.id) continue;
    await createBoardNotification(supabase, {
      recipientId,
      actorId: user.id,
      activityType: "room_drop_shared",
      entityType: "room",
      entityId: roomId,
      dropId,
      href: `/board/forums/${roomId}`,
      message: describeRoomActivity("room_drop_shared", actorName, room.name, { dropTitle }),
      metadata: { roomId, roomName: room.name, actorName, dropTitle },
      groupKey: roomActivityGroupKey("room_drop_shared", roomId),
    }).catch(() => undefined);
  }

  await supabase.from("room_notifications").insert({
    room_id: roomId,
    actor_id: user.id,
    event_type: "drop_shared",
    entity_type: "drop",
    entity_id: dropId,
    drop_id: dropId,
    message: describeRoomActivity("room_drop_shared", actorName, room.name, { dropTitle }),
    href: `/board/forums/${roomId}`,
  }).then(() => undefined, () => undefined);

  return json({ ok: true, persisted: "db", share: data || row });
}
