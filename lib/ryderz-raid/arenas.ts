/**
 * Arena registry. The raid currently always builds the city block (see
 * world.ts); other arenas register here as they are built so the menu and the
 * engine can pick them up without further wiring.
 *
 * Each definition owns its fixed points: where the Ryder drops in and where
 * its single Ryder Beacon stands. The engine reads these when it loads an
 * arena, so there is exactly one Beacon per arena and nothing spawns at random.
 */
export type ArenaId = string;

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

export const DEFAULT_ARENA: ArenaId = 'block';

registerArena({
  id: DEFAULT_ARENA,
  name: 'The Block',
  setting: 'Downtown · night',
  description: 'A ring of towers around a plaza spire. Six alleys feed the hosts in; the crosswalks are kill lanes.',
  available: true,
  spawnPoint: { x: 9, z: 11 },
  // The pocket park on the south-west block: off the kill lanes, visible from the plaza.
  ryderBeaconPoint: { x: -18.5, z: 18 },
  beaconCooldown: DEFAULT_BEACON_COOLDOWN,
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
});
