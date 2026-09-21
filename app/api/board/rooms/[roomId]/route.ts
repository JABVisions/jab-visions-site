import { supabaseServer } from "@/lib/supabase/server";
import { getRoomById, resolveRoomId } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json, mapRoomRow } from "@/lib/board/rooms/server";
import { ROOM_PRESENCE_TTL_MS } from "@/lib/board/rooms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  const catalog = roomId ? getRoomById(roomId) : null;
  if (!roomId || !catalog) {
    return json({ ok: false, message: "Room not found" }, 404);
  }

  try {
    const supabase = supabaseServer();
    const since = new Date(Date.now() - ROOM_PRESENCE_TTL_MS).toISOString();
    const [{ data: row, error }, { data: presence }, { data: sessions }, { count: memberCount }] =
      await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
        supabase
          .from("room_presence")
          .select("user_id, username, display_name, avatar_url, last_seen_at")
          .eq("room_id", roomId)
          .gte("last_seen_at", since),
        supabase
          .from("room_sessions")
          .select("*")
          .eq("room_id", roomId)
          .in("status", ["starting", "live"])
          .order("created_at", { ascending: false }),
        supabase
          .from("room_members")
          .select("*", { count: "exact", head: true })
          .eq("room_id", roomId)
          .in("status", ["joined", "following"]),
      ]);

    if (error && isMissingRoomsTable(error)) {
      return json({ ok: true, room: { ...catalog, title: catalog.name }, presence: [], sessions: [], setupRequired: true, source: "catalog" });
    }

    const mapped = mapRoomRow(row as Record<string, any>) || catalog;
    return json({
      ok: true,
      room: {
        ...mapped,
        title: mapped.name,
        memberCount: memberCount ?? mapped.memberCount,
        presenceCount: (presence || []).length,
      },
      presence: presence || [],
      sessions: sessions || [],
      source: row ? "db" : "catalog",
    });
  } catch {
    return json({ ok: true, room: { ...catalog, title: catalog.name }, presence: [], sessions: [], source: "catalog" });
  }
}
