import {
  BOARD_ROOM_CATALOG,
  catalogHallwayRooms,
  hallwayMissingRequiredIds,
  hallwayRoomsForClient,
  publicHallwayRooms,
  REQUIRED_HALLWAY_ROOM_IDS,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const emptyStorageRooms = publicHallwayRooms(null);
assert(emptyStorageRooms.length >= REQUIRED_HALLWAY_ROOM_IDS.length, "empty localStorage still has hallway rooms");
assert(
  hallwayMissingRequiredIds(emptyStorageRooms).length === 0,
  "official + Lobby rooms render without a cached store"
);
assert(
  ["JAB LIT", "JAB Comics", "Music", "Those Ryderz", "JAB Visions", "Lobby"].every((name) =>
    emptyStorageRooms.some((room) => room.name === name)
  ),
  "required hallway names are present without session"
);

assert(publicHallwayRooms([]).length === catalogHallwayRooms().length, "empty remote array does not blank the hallway");
assert(hallwayRoomsForClient([]).some((room) => room.id === "jab-lit"), "client merge keeps JAB LIT when API is empty");
assert(
  hallwayRoomsForClient(null).every((room) => BOARD_ROOM_CATALOG.some((catalog) => catalog.id === room.id)),
  "unauth hallway is the catalog, not a client-only list"
);

const partialSql = publicHallwayRooms([{ id: "music", name: "Music", kind: "official", isOfficial: true } as any]);
assert(partialSql.some((room) => room.id === "lobby"), "partial SQL overlay still keeps Lobby");
assert(partialSql.some((room) => room.id === "those-ryderz"), "partial SQL overlay still keeps Those Ryderz");

const unauthPayload = { ok: true, rooms: publicHallwayRooms([]) };
assert(Array.isArray(unauthPayload.rooms) && unauthPayload.rooms.length > 0, "unauth rooms payload is never an empty array");

console.log("forums public hallway checks passed");
