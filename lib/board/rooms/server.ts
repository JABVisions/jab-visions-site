import type { Room, RoomBroadcastState, RoomKind } from "./types";
import { BOARD_ROOM_CATALOG, getRoomById, resolveRoomId } from "./catalog";

export function isMissingRoomsTable(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    error?.code === "PGRST202" ||
    message.includes("schema cache") ||
    ((message.includes("rooms") || message.includes("room_")) &&
      (message.includes("does not exist") || message.includes("not find")))
  );
}

export function mapRoomRow(row: Record<string, any> | null | undefined): Room | null {
  if (!row || typeof row !== "object") return null;
  const id = resolveRoomId(row.id || row.slug) || String(row.id || "").trim();
  if (!id) return null;
  const catalog = getRoomById(id);
  const kind = (row.kind === "official" || row.kind === "reserved" || row.kind === "board"
    ? row.kind
    : catalog?.kind || "board") as RoomKind;
  const state = (row.state === "LIVE" || row.state === "STAGE" || row.state === "ROOM"
    ? row.state
    : catalog?.state || "ROOM") as RoomBroadcastState;
  return {
    id,
    slug: String(row.slug || id),
    name: String(row.name || catalog?.name || id),
    icon: String(row.icon || catalog?.icon || "◈"),
    description: String(row.description || catalog?.description || ""),
    chips: Array.isArray(row.chips) ? row.chips.map(String) : catalog?.chips || [],
    kind,
    isOfficial: row.is_official === true || catalog?.isOfficial === true,
    comingSoon: row.coming_soon === true || catalog?.comingSoon === true,
    color: String(row.color || catalog?.color || "#A78BFA"),
    accent: String(row.accent || catalog?.accent || "#DDD6FE"),
    imageryUrl: typeof row.imagery_url === "string" ? row.imagery_url : catalog?.imageryUrl,
    state,
    memberCount: Number(row.member_count || catalog?.memberCount || 0),
    presenceCount: Number(row.presence_count || 0),
    lastActivityAt: row.last_activity_at
      ? new Date(row.last_activity_at).getTime()
      : catalog?.lastActivityAt ?? null,
    aliases: catalog?.aliases,
  };
}

export function mergeCatalogWithRows(rows: Array<Record<string, any>> | null | undefined): Room[] {
  const byId = new Map<string, Room>();
  for (const room of BOARD_ROOM_CATALOG) byId.set(room.id, room);
  for (const row of rows || []) {
    const mapped = mapRoomRow(row);
    if (!mapped) continue;
    const current = byId.get(mapped.id);
    byId.set(mapped.id, current ? { ...current, ...mapped, chips: mapped.chips.length ? mapped.chips : current.chips } : mapped);
  }
  return [...byId.values()];
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
