import { supabaseServer } from "@/lib/supabase/server";
import { getRoomById, resolveRoomId } from "@/lib/board/rooms/catalog";
import { json } from "@/lib/board/rooms/server";
import { linkDropActivityToRoom } from "@/lib/board/rooms/dropActivityLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Silent, side-effect-free backfill: point a Drop's Feed activity back at a
 * Room it was already shared into / replied with locally, before the Rooms
 * tables existed in production. Unlike POST .../shares or .../posts, this
 * never inserts a room_drop_shares/room_posts row and never notifies anyone
 * — it only patches board_activity.meta so the "Open Room" link reappears.
 */
export async function POST(req: Request) {
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

  const roomId = resolveRoomId(String(body.roomId || ""));
  const room = roomId ? getRoomById(roomId) : null;
  const dropId = String(body.dropId || "").trim();
  if (!roomId || !room || !dropId) {
    return json({ ok: false, message: "roomId and dropId are required" }, 400);
  }

  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : null;
  const conversationTitle =
    typeof body.conversationTitle === "string" && body.conversationTitle.trim()
      ? body.conversationTitle.trim()
      : null;

  await linkDropActivityToRoom(supabase, {
    dropId,
    roomId,
    roomName: room.name,
    roomIcon: room.icon,
    conversationId,
    conversationTitle,
    userId: user.id,
  });

  return json({ ok: true });
}
