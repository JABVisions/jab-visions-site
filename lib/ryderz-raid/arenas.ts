/**
 * Arena registry. The raid currently always builds the city block (see
 * world.ts); other arenas register here as they are built so the menu and the
 * engine can pick them up without further wiring.
 *
 * Each definition owns its fixed points: where the Ryder drops in and where
 * its single Ryder Beacon stands. The engine reads these when it loads an
 * arena, so there is exactly one Beacon per arena and nothing spawns at random.
 */
import { BOUNDARY, HOME_DISTRICT } from './config';
import { ISLAND_HALF, islandBeacon, islandSpawn } from './island/terrain';
import { RIVERDALE, RIVERDALE_BEACON, RIVERDALE_SPAWN } from './riverdale/config';

export type ArenaId = string;

/** Solo raid, co-op raid lobby, and Ryder-versus-Ryder. */
export type ArenaMode = 'solo' | 'raid' | 'pvp';

export interface ArenaPoint {
  x: number;
  z: number;
}

export interface ArenaDefinition {
  id: ArenaId;
  name: string;
  setting: string;
  description: string;
  /** False renders the arena as Coming Soon and refuses selection. */
  available: boolean;
  /** Where the player stands when the raid starts. */
  spawnPoint: ArenaPoint;
  /** Where this arena's one Ryder Beacon is placed. */
  ryderBeaconPoint: ArenaPoint;
  /** Seconds the Beacon needs to recharge after restoring a Ryder. */
  beaconCooldown: number;
  /** Which built world the engine shows. Omitted arenas stay on the city block. */
  worldKey?: 'block' | 'pad' | 'island' | 'riverdale';
  /** Modes that may pick this arena. Omitted means every mode. */
  modes?: readonly ArenaMode[];
  /** How big the floor is, in words a player can compare. */
  size: ArenaSize;
  /** In-game photograph shown on the map select screen. */
  picture?: string;
}

/** A floor's playable span. Metres are edge to edge. */
export interface ArenaSize {
  label: 'Compact' | 'City' | 'Vast';
  metres: number;
  /** What that span feels like once you are on the ground. */
  guide: string;
}

/** "188 m across" or "1.6 km across". */
export function formatSpan(metres: number) {
  if (metres >= 1000) {
    const km = metres / 1000;
    const text = km >= 10 ? km.toFixed(0) : km.toFixed(1).replace(/\.0$/, '');
    return `${text} km across`;
  }
  return `${Math.round(metres)} m across`;
}

/** @deprecated Use ArenaDefinition. */
export type ArenaSpec = ArenaDefinition;

/** Default recharge time for a Beacon when an arena does not override it. */
export const DEFAULT_BEACON_COOLDOWN = 45;

const registry = new Map<ArenaId, ArenaDefinition>();

export function registerArena(spec: ArenaDefinition) {
  registry.set(spec.id, spec);
  return spec;
}

export function listArenas(): ArenaDefinition[] {
  return [...registry.values()];
}

export function arenaSpec(id: ArenaId): ArenaDefinition | undefined {
  return registry.get(id);
}

export function arenaAllows(arena: ArenaDefinition, mode: ArenaMode) {
  return !arena.modes || arena.modes.includes(mode);
}

export const DEFAULT_ARENA: ArenaId = 'block';

registerArena({
  id: DEFAULT_ARENA,
  name: 'The Block',
  setting: 'Downtown · night',
  description: 'Four city blocks. Alleys feed the hosts in; the crosswalks are kill lanes.',
  available: true,
  spawnPoint: { x: 9 + HOME_DISTRICT, z: 11 + HOME_DISTRICT },
  // The pocket park on the southwest block: off the kill lanes, visible from that plaza.
  ryderBeaconPoint: { x: -18.5 + HOME_DISTRICT, z: 18 + HOME_DISTRICT },
  beaconCooldown: DEFAULT_BEACON_COOLDOWN,
  size: {
    label: 'City',
    metres: BOUNDARY * 2,
    guide: 'A sprint crosses one block. The whole city is four of them, and the crosswalks run the length of each.',
  },
  picture: '/assets/those-ryderz/maps/block.webp?v=1',
});

registerArena({
  id: 'training',
  name: 'Training Floor',
  setting: 'Signal lab',
  description: 'An empty practice space for testing decks and movement without a mob.',
  available: false,
  spawnPoint: { x: 0, z: 6 },
  ryderBeaconPoint: { x: 0, z: -6 },
  beaconCooldown: 10,
  size: {
    label: 'Compact',
    metres: 40,
    guide: 'One empty room. Not open yet.',
  },
});

registerArena({
  id: 'training-pad',
  name: 'P.A.D. Lab',
  setting: 'Paranormal Activity Division',
  description: 'A circular P.A.D. facility. Stairs reach the balcony, and the east corridor stays on the floor.',
  available: true,
  worldKey: 'pad',
  spawnPoint: { x: 0, z: 8 },
  ryderBeaconPoint: { x: -8, z: -4 },
  beaconCooldown: 12,
  size: {
    label: 'Compact',
    // Lab hall west edge is about −68 m; Containment Bay sits near +28 m.
    metres: 96,
    guide: 'The round chamber is 32 m across. The whole floor runs about 100 m from the lab hall to containment.',
  },
  picture: '/assets/those-ryderz/maps/training-pad.webp?v=1',
});

registerArena({
  id: 'island-paradise',
  name: 'Island Paradise',
  setting: 'Tropical ocean',
  description: 'A swimmable island. Beaches, jungle, a beachfront resort, and open water.',
  available: true,
  worldKey: 'island',
  spawnPoint: islandSpawn(),
  ryderBeaconPoint: islandBeacon(),
  beaconCooldown: DEFAULT_BEACON_COOLDOWN,
  size: {
    label: 'Vast',
    metres: (ISLAND_HALF - 6) * 2,
    guide: 'Open water on every side. The beach, the jungle, and the resort are a long run apart.',
  },
  picture: '/assets/those-ryderz/maps/island-paradise.webp?v=1',
});

registerArena({
  id: 'riverdale_party',
  name: 'The Riverdale Party',
  setting: 'Urban / Woodland · Riverdale Park, Bronx',
  description: 'A secret party beneath an abandoned concrete structure deep in the woods. When the celebration turns into chaos, the Ryderz must survive.',
  available: true,
  worldKey: 'riverdale',
  modes: ['solo', 'raid'],
  spawnPoint: RIVERDALE_SPAWN,
  ryderBeaconPoint: RIVERDALE_BEACON,
  beaconCooldown: DEFAULT_BEACON_COOLDOWN,
  size: {
    label: 'City',
    metres: RIVERDALE.bounds * 2,
    guide: 'The structure is 100 m end to end. The trail in from the woods is a long jog; the party floor is a few strides across.',
  },
  picture: '/assets/those-ryderz/maps/riverdale-party.webp?v=1',
});

registerArena({
  id: 'story',
  name: 'Story Locations',
  setting: 'Those Ryderz universe',
  description: 'Arenas lifted from the story. Unlock as chapters land.',
  available: false,
  spawnPoint: { x: 0, z: 0 },
  ryderBeaconPoint: { x: 0, z: -8 },
  beaconCooldown: DEFAULT_BEACON_COOLDOWN,
  size: {
    label: 'City',
    metres: 200,
    guide: 'Each chapter brings its own floor. Not open yet.',
  },
});
