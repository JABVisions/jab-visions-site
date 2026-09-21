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
      .from("room_posts")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error && isMissingRoomsTable(error)) return json({ ok: true, posts: [], setupRequired: true });
    if (error) return json({ ok: true, posts: [], warning: error.message });
    return json({ ok: true, posts: data || [] });
  } catch {
    return json({ ok: true, posts: [] });
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

  const kind = String(body.kind || "conversation");
  const title = String(body.title || "").trim();
  const postBody = String(body.body || "").trim();
  if (!postBody) return json({ ok: false, message: "body is required" }, 400);

  const row = {
    room_id: roomId,
    author_id: user.id,
    parent_id: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
    kind: ["conversation", "text_post", "reply", "announcement"].includes(kind) ? kind : "text_post",
    title: title || null,
    body: postBody,
    official: body.official === true,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const { data, error } = await supabase.from("room_posts").insert(row).select("*").maybeSingle();
  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", post: { ...row, id: `local_${Date.now()}` } });
  }
  if (error) return json({ ok: false, message: error.message }, 500);

  if (kind === "reply" || kind === "announcement") {
    const activityType = kind === "announcement" ? "room_announcement" : "room_reply";
    const actorName = String(body.displayName || "Someone");
    const mentionIds = Array.isArray(body.mentionUserIds) ? body.mentionUserIds.map(String) : [];
    const recipientIds = new Set<string>(mentionIds);
    if (typeof body.notifyUserId === "string") recipientIds.add(body.notifyUserId);

    for (const recipientId of recipientIds) {
      if (!recipientId || recipientId === user.id) continue;
      await createBoardNotification(supabase, {
        recipientId,
        actorId: user.id,
        activityType: mentionIds.includes(recipientId) ? "room_mention" : activityType,
        entityType: "room",
        entityId: roomId,
        href: `/board/forums/${roomId}`,
        message: describeRoomActivity(
          mentionIds.includes(recipientId) ? "room_mention" : activityType,
          actorName,
          room.name
        ),
        metadata: { roomId, roomName: room.name, actorName },
        groupKey: roomActivityGroupKey(
          mentionIds.includes(recipientId) ? "room_mention" : activityType,
          roomId
        ),
      }).catch(() => undefined);
    }
  }

  return json({ ok: true, persisted: "db", post: data || row });
}
