import { BOARD_ROOM_CATALOG } from "./catalog";
import { mergeCatalogWithRows } from "./server";
import type { Room } from "./types";

/** Official + Lobby rooms the hallway must show without a cached store. */
export const REQUIRED_HALLWAY_ROOM_IDS = [
  "jab-lit",
  "jab-comics",
  "music",
  "those-ryderz",
  "jab-visions",
  "lobby",
] as const;

export function catalogHallwayRooms(catalog: Room[] = BOARD_ROOM_CATALOG): Room[] {
  return catalog.filter((room) => room.isOfficial || room.kind === "board");
}

export function hallwayMissingRequiredIds(rooms: Room[] | null | undefined): string[] {
  const ids = new Set((rooms || []).map((room) => room.id));
  return REQUIRED_HALLWAY_ROOM_IDS.filter((id) => !ids.has(id));
}

/**
 * Hallway room list for every viewport and session state.
 * Catalog is the source of truth. Remote SQL overlays presence/live only.
 * An empty or partial remote list never blanks official + board rooms.
 */
export function publicHallwayRooms(remote?: Room[] | Array<Record<string, unknown>> | null): Room[] {
  const catalog = catalogHallwayRooms();
  const remoteList = Array.isArray(remote) ? remote : [];
  if (!remoteList.length) return catalog;

  const looksLikeRows = remoteList.some(
    (item) => item && typeof item === "object" && ("is_official" in item || "coming_soon" in item)
  );
  const merged = looksLikeRows
    ? mergeCatalogWithRows(remoteList as Array<Record<string, unknown>>)
    : mergeCatalogWithRows(
        (remoteList as Room[]).map((room) => ({
          id: room.id,
          slug: room.slug,
          name: room.name,
          icon: room.icon,
          description: room.description,
          chips: room.chips,
          kind: room.kind,
          is_official: room.isOfficial,
          coming_soon: room.comingSoon,
          color: room.color,
          accent: room.accent,
          state: room.state,
          member_count: room.memberCount,
          presence_count: room.presenceCount,
          last_activity_at: room.lastActivityAt,
        }))
      );

  if (!merged.length || hallwayMissingRequiredIds(merged).length) {
    const byId = new Map(catalog.map((room) => [room.id, room]));
    for (const room of merged) byId.set(room.id, { ...byId.get(room.id), ...room } as Room);
    return [...byId.values()];
  }
  return merged;
}

export function hallwayRoomsForClient(remote?: Room[] | null): Room[] {
  const next = publicHallwayRooms(remote);
  return next.length ? next : catalogHallwayRooms();
}
