import type { Obstacle } from '../world';
import {
  ENTRANCE_TRAIL,
  RIVERDALE,
  RIVERDALE_HALF_X,
  RIVERDALE_HALF_Z,
  SIDE_TRAIL,
  type TrailPoint,
} from './config';

/**
 * Ground, roof and solid layout of The Riverdale Party as plain functions, so
 * the picture, the footing, the nav grid and the checks all read one source.
 */

function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Mud hollows: shallow wet depressions where the runoff from the slab collects. */
export const MUD_HOLLOWS = [
  { x: -6, z: 15.5, r: 3.2, depth: 0.3 },
  { x: 30, z: 19, r: 4, depth: 0.35 },
  { x: -38, z: 12, r: 3, depth: 0.28 },
  { x: 8, z: 34, r: 3.5, depth: 0.4 },
];

function hollow(x: number, z: number) {
  let dip = 0;
  for (const m of MUD_HOLLOWS) {
    const d2 = ((x - m.x) ** 2 + (z - m.z) ** 2) / (m.r * m.r);
    if (d2 < 4) dip += m.depth * Math.exp(-d2 * 1.6);
  }
  return dip;
}

/** Dirt piled against the back wall on the right. */
function embankment(x: number, z: number) {
  const e = RIVERDALE.embankment;
  const across = smoothstep(e.x0, e.x0 + 7, x) * (1 - smoothstep(e.x1 + 2, e.x1 + 8, x));
  const toWall = smoothstep(e.z1, e.z0 + 1, z);
  return e.rise * across * toWall;
}

function insideLedge(x: number, z: number) {
  const l = RIVERDALE.ledge;
  return x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1;
}

/** Natural ground, without the concrete ledge. */
export function riverdaleDirt(x: number, z: number) {
  const back = smoothstep(14, -RIVERDALE_HALF_Z, z);
  let h = RIVERDALE.backRise * Math.pow(back, 1.4);
  const past = z - 12;
  h -= RIVERDALE.forestFall * (Math.sqrt(past * past + 9) + past) * 0.5;
  // The woods past both ends roll a little more than the floor under the slab.
  const outside = smoothstep(RIVERDALE_HALF_X - 2, RIVERDALE_HALF_X + 10, Math.abs(x));
  h += Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4) * (0.18 + 0.4 * outside);
  h += Math.sin(x * 0.53 + z * 0.41) * 0.08;
  h += embankment(x, z);
  h -= hollow(x, z);
  // Behind the back wall past the ends of the structure the hill climbs out of reach.
  h += Math.max(0, -RIVERDALE_HALF_Z - z) * 0.9;
  return h;
}

/** Top of the old loading ledge: one easy step up from the embankment in front of it. */
export function ledgeTop() {
  const l = RIVERDALE.ledge;
  return riverdaleDirt((l.x0 + l.x1) / 2, l.z1 + 0.4) + 0.45;
}

/** Walkable surface height. */
export function riverdaleGround(x: number, z: number) {
  if (insideLedge(x, z)) return ledgeTop();
  return riverdaleDirt(x, z);
}

export function underStructure(x: number, z: number, margin = 0) {
  return Math.abs(x) <= RIVERDALE_HALF_X + margin && z >= -RIVERDALE_HALF_Z - margin && z <= RIVERDALE_HALF_Z + margin;
}

/** Least gap between the dirt and the steel above it, so a Ryder walks under every strut. */
const STRUT_CLEARANCE = 2.95;
/** Steel never climbs into the downstand ribs under the slab. */
const STRUT_MAX = RIVERDALE.ceiling - 0.8;
const FIELD_PAD = 2;
const FIELD_W = Math.ceil(RIVERDALE_HALF_X + FIELD_PAD) * 2 + 1;
const FIELD_D = Math.ceil(RIVERDALE_HALF_Z + FIELD_PAD) * 2 + 1;
let strutField: Float32Array | null = null;

/** Strut height over each metre of floor: the base strut line, lifted where the dirt piles up within a bay's reach. */
function buildStrutField() {
  const field = new Float32Array(FIELD_W * FIELD_D);
  const x0 = -(FIELD_W - 1) / 2;
  const z0 = -(FIELD_D - 1) / 2;
  const reach = 5;
  const step = reach / 3;
  for (let iz = 0; iz < FIELD_D; iz += 1) {
    for (let ix = 0; ix < FIELD_W; ix += 1) {
      const x = x0 + ix;
      const z = z0 + iz;
      let high = -Infinity;
      for (let dz = -reach; dz <= reach + 1e-6; dz += step) {
        for (let dx = -reach; dx <= reach + 1e-6; dx += step) {
          if (dx * dx + dz * dz > reach * reach + 1e-6) continue;
          high = Math.max(high, riverdaleGround(x + dx, Math.max(z + dz, -RIVERDALE_HALF_Z)));
        }
      }
      field[iz * FIELD_W + ix] = Math.min(STRUT_MAX, Math.max(RIVERDALE.strutY, high + STRUT_CLEARANCE));
    }
  }
  return field;
}

/** Height of the steel struts above (x, z). */
export function strutHeight(x: number, z: number) {
  strutField ??= buildStrutField();
  const fx = Math.min(FIELD_W - 1.001, Math.max(0, x + (FIELD_W - 1) / 2));
  const fz = Math.min(FIELD_D - 1.001, Math.max(0, z + (FIELD_D - 1) / 2));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const at = (i: number, k: number) => strutField![(iz + k) * FIELD_W + ix + i];
  return (at(0, 0) * (1 - tx) + at(1, 0) * tx) * (1 - tz) + (at(0, 1) * (1 - tx) + at(1, 1) * tx) * tz;
}

/** A straight beam is hung at the highest strut line along its span. */
export function beamHeight(x0: number, z0: number, x1: number, z1: number) {
  let high = -Infinity;
  for (let s = 0; s <= 8; s += 1) {
    const t = s / 8;
    high = Math.max(high, strutHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t));
  }
  return high;
}

/**
 * Highest a body's crown may reach. Under the slab that is just below the
 * strut line, so flight, levitation and Giant Step stop short of the steel
 * instead of passing through it. Outside the structure the sky is open.
 */
export function riverdaleCeiling(x: number, z: number): number | null {
  return underStructure(x, z) ? strutHeight(x, z) - 0.55 : null;
}

/** Bottom of the downstand ribs, the lowest solid concrete overhead. */
export function riverdaleRoof(x: number, z: number): number | null {
  return underStructure(x, z, 0.3) ? RIVERDALE.ceiling - 0.42 : null;
}

export interface Column {
  x: number;
  z: number;
  row: number;
  /** Ground at the column foot. */
  base: number;
}

export function columnXs() {
  const xs: number[] = [];
  const count = Math.round(RIVERDALE.length / RIVERDALE.columnSpacingX);
  const start = -((count - 1) * RIVERDALE.columnSpacingX) / 2;
  for (let i = 0; i < count; i += 1) xs.push(start + i * RIVERDALE.columnSpacingX);
  return xs;
}

/** Inner rows skip their columns across the party bay; transfer girders carry the slab there. */
export function columnOmitted(x: number, row: number) {
  const inner = row === 1 || row === 2;
  return inner && Math.abs(x) < RIVERDALE.clearing.halfX - 0.5;
}

export function riverdaleColumns(): Column[] {
  const out: Column[] = [];
  RIVERDALE.columnRows.forEach((z, row) => {
    for (const x of columnXs()) {
      if (columnOmitted(x, row)) continue;
      out.push({ x, z, row, base: riverdaleGround(x, z) });
    }
  });
  return out;
}

/** Big party furniture that bodies walk around. Small debris has no collision. */
export const PARTY_SOLIDS: Obstacle[] = [
  // DJ table and its speaker stacks.
  { kind: 'box', minX: -2.1, maxX: 2.1, minZ: -9.9, maxZ: -8.7 },
  { kind: 'box', minX: -5.4, maxX: -3.8, minZ: -10.2, maxZ: -8.6 },
  { kind: 'box', minX: 3.8, maxX: 5.4, minZ: -10.2, maxZ: -8.6 },
  // Couches along the edges of the floor.
  { kind: 'box', minX: -18.6, maxX: -16.8, minZ: -4.2, maxZ: 0.2 },
  { kind: 'box', minX: 16.8, maxX: 18.6, minZ: 1.5, maxZ: 5.9 },
  { kind: 'box', minX: -9.6, maxX: -5.4, minZ: -12.9, maxZ: -11.3 },
  // Folding tables.
  { kind: 'box', minX: -13.4, maxX: -10.6, minZ: -7, maxZ: -5.8 },
  { kind: 'box', minX: 10.6, maxX: 13.4, minZ: 9.4, maxZ: 10.6 },
  // Crate stack hiding the supply cache.
  { kind: 'box', minX: 17.2, maxX: 21.8, minZ: -11.8, maxZ: -10.4 },
];

/** Graffiti pillars set close together on the back-left; the nook behind them holds a cache. */
export const NOOK_PILLARS = [
  { x: -38.4, z: -14.1, w: 1.3, d: 0.9 },
  { x: -34, z: -14.1, w: 1.3, d: 0.9 },
];

export function riverdaleObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const half = RIVERDALE.columnSize / 2 + 0.05;
  for (const c of riverdaleColumns()) {
    obstacles.push({ kind: 'box', minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
  }
  for (const p of NOOK_PILLARS) {
    obstacles.push({ kind: 'box', minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
  }
  // The retaining wall and the hill behind it along the full width of the arena.
  obstacles.push({ kind: 'box', minX: -RIVERDALE.bounds - 2, maxX: RIVERDALE.bounds + 2, minZ: -RIVERDALE.bounds - 2, maxZ: -RIVERDALE_HALF_Z + 0.3 });
  obstacles.push(...PARTY_SOLIDS);
  return obstacles;
}

/** Distance from a point to a polyline, in metres. */
export function distanceToPath(x: number, z: number, path: TrailPoint[]) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len = abx * abx + abz * abz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / len));
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < best) best = d;
  }
  return best;
}

export function trailDistance(x: number, z: number) {
  return Math.min(distanceToPath(x, z, ENTRANCE_TRAIL), distanceToPath(x, z, SIDE_TRAIL) + 0.4);
}
