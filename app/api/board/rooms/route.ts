import { supabaseServer } from "@/lib/supabase/server";
import { BOARD_ROOM_CATALOG } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json, mergeCatalogWithRows } from "@/lib/board/rooms/server";
import { ROOM_PRESENCE_TTL_MS } from "@/lib/board/rooms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = BOARD_ROOM_CATALOG;
  try {
    const supabase = supabaseServer();
    const since = new Date(Date.now() - ROOM_PRESENCE_TTL_MS).toISOString();
    const [{ data: rooms, error: roomsError }, { data: presence }, { data: sessions }] = await Promise.all([
      supabase.from("rooms").select("*"),
      supabase.from("room_presence").select("room_id, user_id, last_seen_at").gte("last_seen_at", since),
      supabase
        .from("room_sessions")
        .select("room_id, kind, status, mode")
        .in("status", ["starting", "live"]),
    ]);

    if (roomsError && isMissingRoomsTable(roomsError)) {
      return json({
        ok: true,
        rooms: catalog.map((room) => ({ ...room, title: room.name })),
        liveRoomIds: [],
        setupRequired: true,
        source: "catalog",
      });
    }
    if (roomsError) {
      return json({
        ok: true,
        rooms: catalog.map((room) => ({ ...room, title: room.name })),
        liveRoomIds: [],
        source: "catalog",
        warning: roomsError.message,
      });
    }

    const merged = mergeCatalogWithRows(rooms as Array<Record<string, any>>);
    const presenceCounts = new Map<string, Set<string>>();
    for (const row of presence || []) {
      const roomId = String((row as any).room_id || "");
      const userId = String((row as any).user_id || "");
      if (!roomId || !userId) continue;
      const set = presenceCounts.get(roomId) ?? new Set<string>();
      set.add(userId);
      presenceCounts.set(roomId, set);
    }
    const liveRoomIds = [
      ...new Set(
        (sessions || [])
          .filter((row: any) => row.kind === "live")
          .map((row: any) => String(row.room_id))
      ),
    ];
    const roomsWithPresence = merged.map((room) => ({
      ...room,
      title: room.name,
      presenceCount: presenceCounts.get(room.id)?.size || 0,
      state:
        liveRoomIds.includes(room.id)
          ? (sessions || []).find((row: any) => row.room_id === room.id && row.mode === "STAGE")
            ? "STAGE"
            : "LIVE"
          : room.state,
    }));

    return json({ ok: true, rooms: roomsWithPresence, liveRoomIds, source: "db" });
  } catch (error: any) {
    return json({
      ok: true,
      rooms: catalog.map((room) => ({ ...room, title: room.name })),
      liveRoomIds: [],
      source: "catalog",
      warning: error?.message || "rooms catalog fallback",
    });
  }
}
