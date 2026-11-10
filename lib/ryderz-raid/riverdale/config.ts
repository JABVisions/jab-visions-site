/**
 * The Riverdale Party: the open ground floor under a concrete building in
 * Riverdale Park, Bronx, as filmed for THOSE RYDERZ. Every measurement the
 * build reads lives here so the blockout can be refined against the location
 * photographs without touching the builders.
 *
 * Layout (metres, +X runs the length of the structure, +Z points out of the
 * open side into the woods):
 *
 *   - The structure spans |x| <= LENGTH/2 and |z| <= WIDTH/2.
 *   - The back (−Z) is a graffiti-covered retaining wall that meets the slab.
 *     Behind it is the building's foundation, so nothing walks there.
 *   - The front (+Z) and both ends are open to the forest. The ground slopes
 *     up under the slab toward the back wall and falls away into the woods.
 *   - Columns stand on a regular grid. The middle two rows are carried on
 *     transfer girders across the central bay, which leaves the party floor
 *     open for a crowd.
 *   - The entrance trail winds out of the woods on the front-left and enters
 *     between the front columns.
 */

export const RIVERDALE = {
  /** Length of the covered structure along X. */
  length: 100,
  /** Depth from the open side to the back wall along Z. */
  width: 35,
  /** Underside of the slab above the lowest ground under it. */
  ceiling: 9,
  /** Height of the horizontal steel struts that tie the columns together. */
  strutY: 6.3,
  /** Column grid. */
  columnSpacingX: 9,
  columnRows: [-13.5, -4.5, 4.5, 13.5] as const,
  columnSize: 0.55,
  /** Central party bay: the two inner rows skip their columns across this span. */
  clearing: { halfX: 22.5, minZ: -13.5, maxZ: 13.5 },
  /** Playable square. The forest fills everything past the structure out to here. */
  bounds: 74,
  /** Rise of the dirt from the open side to the back wall. */
  backRise: 3.0,
  /** Fall of the forest floor per metre past the open side. */
  forestFall: 0.11,
  /** Right-side embankment (spawn zone C) piled against the back wall. */
  embankment: { x0: 33, x1: 49, z0: -17.5, z1: -3, rise: 1.8 },
  /** Old concrete loading ledge on top of the embankment. */
  ledge: { x0: 39, x1: 47, z0: -17.5, z1: -14.6 },
  /** Atmosphere preset. 'dusk' is the default: evening turning to night. */
  timeOfDay: 'dusk' as RiverdaleTime,
};

export type RiverdaleTime = 'day' | 'dusk' | 'night';

export const RIVERDALE_HALF_X = RIVERDALE.length / 2;
export const RIVERDALE_HALF_Z = RIVERDALE.width / 2;

export interface TrailPoint {
  x: number;
  z: number;
}

/** The entrance trail, from the forest arrival to the party floor. */
export const ENTRANCE_TRAIL: TrailPoint[] = [
  { x: -30, z: 62 },
  { x: -26, z: 52 },
  { x: -19, z: 43 },
  { x: -15, z: 33 },
  { x: -9, z: 24 },
  { x: -5, z: 16 },
  { x: -1, z: 8 },
];

/** Wooded side path off the trail; it ends at a stump with a cache. */
export const SIDE_TRAIL: TrailPoint[] = [
  { x: -19, z: 43 },
  { x: -29, z: 39 },
  { x: -38, z: 33 },
  { x: -45, z: 27 },
];

export const RIVERDALE_SPAWN = { x: -26, z: 52 };
export const RIVERDALE_BEACON = { x: -18, z: 9.5 };

export type SpawnZoneId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface SpawnZone {
  id: SpawnZoneId;
  label: string;
  x: number;
  z: number;
  /** Direction the crowd walks in from, toward the party. */
  toward: { x: number; z: number };
  /** Spread of the entry points across the zone. */
  spread: number;
}

export const SPAWN_ZONES: SpawnZone[] = [
  { id: 'A', label: 'Deep interior', x: -44, z: -6, toward: { x: 1, z: 0 }, spread: 6 },
  { id: 'B', label: 'Forest entrance', x: -22, z: 46, toward: { x: 0.4, z: -1 }, spread: 4 },
  { id: 'C', label: 'Right embankment', x: 41, z: -9, toward: { x: -1, z: 0.2 }, spread: 4 },
  { id: 'D', label: 'Behind the rear pillars', x: 14, z: -16, toward: { x: -0.2, z: 1 }, spread: 6 },
  { id: 'E', label: 'Outer woodland trail', x: -42, z: 30, toward: { x: 1, z: -0.6 }, spread: 4 },
  { id: 'F', label: 'Far end of the structure', x: 47, z: 8, toward: { x: -1, z: 0 }, spread: 5 },
];

/** A spawn point closer than this to the Ryder is only used when it is behind them. */
export const SPAWN_CLEAR = 18;

export interface RiverdaleCache {
  id: string;
  label: string;
  x: number;
  z: number;
  /** Signal Points the cache spills as orbs. */
  reward: number;
}

/** Optional exploration rewards. Each pays once per raid through the Signal Orb drop. */
export const RIVERDALE_CACHES: RiverdaleCache[] = [
  { id: 'pillar-nook', label: 'Behind the graffiti pillars', x: -36, z: -15.6, reward: 40 },
  { id: 'brush-gap', label: 'Gap in the brush', x: 26, z: 27, reward: 30 },
  { id: 'crate-stack', label: 'Behind the stacked crates', x: 19.5, z: -12.6, reward: 30 },
  { id: 'side-stump', label: 'End of the side path', x: -45.5, z: 26, reward: 40 },
  { id: 'ledge', label: 'Up on the embankment ledge', x: 43, z: -16, reward: 50 },
];

export type StoryTriggerId =
  | 'forest-arrival'
  | 'first-view'
  | 'party-entry'
  | 'main-gathering'
  | 'initial-conflict'
  | 'major-combat'
  | 'exit';

export interface StoryTriggerRegion {
  id: StoryTriggerId;
  /** Circle (r) or axis-aligned box (halfX/halfZ) on the ground. */
  x: number;
  z: number;
  r?: number;
  halfX?: number;
  halfZ?: number;
}

/**
 * Narrative hooks for Story Mode chapter one. They are dormant: nothing
 * listens until a story controller activates them, and no dialogue or events
 * are attached here.
 */
export const STORY_TRIGGERS: StoryTriggerRegion[] = [
  { id: 'forest-arrival', x: RIVERDALE_SPAWN.x, z: RIVERDALE_SPAWN.z, r: 8 },
  { id: 'first-view', x: -15, z: 33, r: 6 },
  { id: 'party-entry', x: -5, z: 16.5, halfX: 6, halfZ: 2 },
  { id: 'main-gathering', x: 0, z: 0, r: 10 },
  { id: 'initial-conflict', x: 0, z: 0, halfX: 22, halfZ: 13 },
  { id: 'major-combat', x: 0, z: 0, halfX: RIVERDALE_HALF_X, halfZ: RIVERDALE_HALF_Z },
  { id: 'exit', x: RIVERDALE_HALF_X + 2, z: 2, r: 6 },
];
