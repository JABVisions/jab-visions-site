import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";
import type { RoomBroadcastState, RoomSessionKind } from "@/lib/board/rooms/types";

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
      .from("room_sessions")
      .select("*")
      .eq("room_id", roomId)
      .in("status", ["starting", "live"])
      .order("created_at", { ascending: false });
    if (error && isMissingRoomsTable(error)) return json({ ok: true, sessions: [], setupRequired: true });
    if (error) return json({ ok: true, sessions: [], warning: error.message });
    return json({ ok: true, sessions: data || [] });
  } catch {
    return json({ ok: true, sessions: [] });
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

  const kind = (body.kind === "live" ? "live" : "call") as RoomSessionKind;
  const mode = (body.mode === "STAGE" || body.mode === "LIVE" || body.mode === "ROOM"
    ? body.mode
    : kind === "live"
      ? "LIVE"
      : "ROOM") as RoomBroadcastState;
  const action = String(body.action || "start").toLowerCase();

  if (action === "end") {
    const sessionId = String(body.sessionId || "");
    const { error } = await supabase
      .from("room_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString(), mode: "ROOM" })
      .eq("id", sessionId)
      .eq("room_id", roomId);
    if (error && isMissingRoomsTable(error)) return json({ ok: true, persisted: "local", ended: true });
    if (error) return json({ ok: false, message: error.message }, 500);
    await supabase.from("rooms").update({ state: "ROOM" }).eq("id", roomId).then(() => undefined, () => undefined);
    return json({ ok: true, ended: true });
  }

  const row = {
    room_id: roomId,
    kind,
    status: "live",
    mode,
    provider: "none",
    started_by: user.id,
    started_at: new Date().toISOString(),
    metadata: { placeholder: true, vendor: "none" },
  };

  const { data, error } = await supabase.from("room_sessions").insert(row).select("*").maybeSingle();
  if (error && isMissingRoomsTable(error)) {
    return json({
      ok: true,
      persisted: "local",
      session: { ...row, id: `local_${kind}_${Date.now()}` },
      placeholder: true,
    });
  }
  if (error) return json({ ok: false, message: error.message }, 500);

  await supabase
    .from("rooms")
    .update({ state: kind === "live" ? mode : "ROOM" })
    .eq("id", roomId)
    .then(() => undefined, () => undefined);

  const activityType = kind === "live" ? "room_live_started" : "room_call_started";
  const actorName = String(body.displayName || "Someone");
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
      activityType,
      entityType: "room",
      entityId: roomId,
      href: `/board/forums/${roomId}`,
      message: describeRoomActivity(activityType, actorName, room.name),
      metadata: { roomId, roomName: room.name, actorName, placeholder: true },
      groupKey: roomActivityGroupKey(activityType, roomId),
    }).catch(() => undefined);
  }

  return json({ ok: true, persisted: "db", session: data || row, placeholder: true });
}
