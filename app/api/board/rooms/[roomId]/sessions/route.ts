import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";
import { permissionsForRole } from "@/lib/board/rooms/permissions";
import type { RoomBroadcastState, RoomRole, RoomSessionKind } from "@/lib/board/rooms/types";

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
  const { data: membership, error: membershipError } = await supabase
    .from("room_members")
    .select("role, status")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError && isMissingRoomsTable(membershipError)) {
    return json({ ok: false, message: "Rooms are not configured for live sessions yet." }, 503);
  }
  if (membershipError) return json({ ok: false, message: membershipError.message }, 500);
  if (!membership || membership.status !== "joined") {
    return json({ ok: false, message: "Join the Room before starting a session." }, 403);
  }
  const role = membership.role as RoomRole;
  const permissions = permissionsForRole(role, room);

  if (action === "end") {
    const sessionId = String(body.sessionId || "");
    const { data: existing, error: existingError } = await supabase
      .from("room_sessions")
      .select("started_by")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();
    if (existingError) return json({ ok: false, message: existingError.message }, 500);
    if (!existing) return json({ ok: false, message: "Session not found" }, 404);
    if (existing.started_by !== user.id && !permissions.moderate) {
      return json({ ok: false, message: "Only the starter or a moderator can end this session." }, 403);
    }
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

  if (kind === "call" && !permissions.startCall) {
    return json({ ok: false, message: "You do not have permission to start a call in this Room." }, 403);
  }
  if (kind === "live" && !permissions.goLive) {
    return json({ ok: false, message: "Only Room hosts can go live." }, 403);
  }

  const row = {
    room_id: roomId,
    kind,
    status: "live",
    mode,
    provider: "livekit",
    started_by: user.id,
    started_at: new Date().toISOString(),
    metadata: { vendor: "livekit" },
  };

  const { data, error } = await supabase.from("room_sessions").insert(row).select("*").maybeSingle();
  if (error && isMissingRoomsTable(error)) {
    return json({
      ok: true,
      persisted: "local",
      session: { ...row, id: `local_${kind}_${Date.now()}` },
      placeholder: false,
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
      metadata: { roomId, roomName: room.name, actorName, provider: "livekit" },
      groupKey: roomActivityGroupKey(activityType, roomId),
    }).catch(() => undefined);
  }

  return json({ ok: true, persisted: "db", session: data || row, placeholder: false });
}
