/**
 * Arena registry. The raid currently always builds the city block (see
 * world.ts); other arenas register here as they are built so the menu and the
 * engine can pick them up without further wiring.
 */
export type ArenaId = string;

export interface ArenaSpec {
  id: ArenaId;
  name: string;
  setting: string;
  description: string;
  /** False renders the arena as Coming Soon and refuses selection. */
  available: boolean;
}

const registry = new Map<ArenaId, ArenaSpec>();

export function registerArena(spec: ArenaSpec) {
  registry.set(spec.id, spec);
  return spec;
}

export function listArenas(): ArenaSpec[] {
  return [...registry.values()];
}

export function arenaSpec(id: ArenaId): ArenaSpec | undefined {
  return registry.get(id);
}

export const DEFAULT_ARENA: ArenaId = 'block';

registerArena({
  id: DEFAULT_ARENA,
  name: 'The Block',
  setting: 'Downtown · night',
  description: 'A ring of towers around a plaza spire. Six alleys feed the hosts in; the crosswalks are kill lanes.',
  available: true,
});

registerArena({
  id: 'training',
  name: 'Training Floor',
  setting: 'Signal lab',
  description: 'An empty practice space for testing decks and movement without a mob.',
  available: false,
});

registerArena({
  id: 'story',
  name: 'Story Locations',
  setting: 'Those Ryderz universe',
  description: 'Arenas lifted from the story. Unlock as chapters land.',
  available: false,
});
