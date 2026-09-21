import { ROOM_PRESENCE_TTL_MS, type RoomPresence } from "./types";

export function isPresenceEvent(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "entered" || raw === "left" || raw === "presence" || raw === "heartbeat";
}

export function isLivePresence(row: Pick<RoomPresence, "lastSeenAt">, now = Date.now()) {
  const seen = new Date(row.lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return false;
  return now - seen <= ROOM_PRESENCE_TTL_MS;
}

export function livePresence(rows: RoomPresence[], now = Date.now()) {
  const byUser = new Map<string, RoomPresence>();
  for (const row of rows) {
    if (!row?.userId || !isLivePresence(row, now)) continue;
    const existing = byUser.get(row.userId);
    if (!existing || existing.lastSeenAt < row.lastSeenAt) byUser.set(row.userId, row);
  }
  return [...byUser.values()].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

export function presenceLabel(count: number) {
  if (count <= 0) return "Quiet inside";
  if (count === 1) return "1 inside";
  return `${count} inside`;
}

export function presenceSentence(count: number) {
  if (count <= 0) return "The room is waiting.";
  if (count === 1) return "1 person is here";
  return `${count} people are here`;
}

export function upsertPresence(
  rows: RoomPresence[],
  next: RoomPresence
): RoomPresence[] {
  const filtered = rows.filter(
    (row) => !(row.roomId === next.roomId && row.userId === next.userId)
  );
  return [next, ...filtered];
}
