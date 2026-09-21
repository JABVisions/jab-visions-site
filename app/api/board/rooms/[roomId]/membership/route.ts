import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey, shouldEmitRoomActivity } from "@/lib/board/rooms/activity";
import { getRoomById } from "@/lib/board/rooms/catalog";
import { createBoardNotification } from "@/lib/board/createNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const action = String(body.action || "join").toLowerCase();
  const following = action === "follow" || action === "join" ? true : action === "unfollow" ? false : undefined;
  const status =
    action === "leave"
      ? "left"
      : action === "follow"
        ? "following"
        : "joined";
  const role = action === "follow" ? "viewer" : "member";

  const row = {
    room_id: roomId,
    user_id: user.id,
    role,
    status,
    following: following ?? action !== "leave",
    last_entered_at: action === "leave" ? null : new Date().toISOString(),
  };

  const { error } = await supabase.from("room_members").upsert(row, { onConflict: "room_id,user_id" });
  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", membership: row, firstJoin: action === "join" });
  }
  if (error) return json({ ok: false, message: error.message }, 500);

  const firstJoin = action === "join";
  if (firstJoin && shouldEmitRoomActivity("room_joined")) {
    const { data: hosts } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId)
      .in("role", ["owner", "host", "moderator"])
      .eq("status", "joined");

    const actorName = String(body.displayName || "Someone");
    for (const host of hosts || []) {
      const recipientId = String((host as any).user_id || "");
      if (!recipientId || recipientId === user.id) continue;
      await createBoardNotification(supabase, {
        recipientId,
        actorId: user.id,
        activityType: "room_joined",
        entityType: "room",
        entityId: roomId,
        href: `/board/forums/${roomId}`,
        message: describeRoomActivity("room_joined", actorName, room.name),
        metadata: { roomId, roomName: room.name, actorName },
        groupKey: roomActivityGroupKey("room_joined", roomId, user.id),
      }).catch(() => undefined);
    }
  }

  return json({ ok: true, persisted: "db", membership: row, firstJoin });
}
