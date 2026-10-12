/**
 * Island Paradise height field. The playable ocean is ISLAND_SPAN metres
 * across (1.6 km). Raise ISLAND_HALF to reach a full 2 km if a device can
 * carry the denser mesh; gameplay queries stay on this function either way.
 *
 * +X east, +Z south. Water waves around y = 0. Dry ground is above the
 * surface. The seabed, lagoon, and river sit below it.
 */

export const ISLAND_HALF = 800;
export const ISLAND_SPAN = ISLAND_HALF * 2;

export interface IslandSample {
  floor: number;
  surface: number;
  depth: number;
}

function hash(ix: number, iz: number) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x: number, z: number) {
  return valueNoise(x, z) * 0.65 + valueNoise(x * 2.1 + 4, z * 2.1 - 3) * 0.35;
}

/** Visual and gameplay wave. Kept small so the shoreline stays readable. */
export function islandSurface(x: number, z: number, time = 0) {
  const deep = Math.min(1, Math.max(0, -islandFloor(x, z, 0)) / 4);
  const amp = 0.08 + deep * 0.2;
  return Math.sin(x * 0.045 + time * 1.15) * amp + Math.sin(z * 0.07 - time * 0.82 + x * 0.01) * amp * 0.65;
}

function coastRadius(x: number, z: number) {
  const ang = Math.atan2(z, x);
  return 292 + Math.sin(ang * 3) * 28 + Math.sin(ang * 7 + 1.4) * 14 + (fbm(x * 0.012, z * 0.012) - 0.5) * 36;
}

function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq));
  const px = ax + abx * t - x;
  const pz = az + abz * t - z;
  return Math.hypot(px, pz);
}

/** Walkable floor, including the seabed. Independent of the wave so tests stay stable. */
export function islandFloor(x: number, z: number, _time = 0) {
  const dist = Math.hypot(x, z);
  const coast = coastRadius(x, z);
  const inland = coast - dist;

  if (inland <= 0) {
    const shelf = Math.min(1, (dist - coast) / 420);
    let bed = -3.2 - shelf * 14;
    bed += (fbm(x * 0.02, z * 0.02) - 0.45) * 5.5;
    const ridge = fbm(x * 0.007 + 9, z * 0.007 - 2);
    if (ridge > 0.62) bed += (ridge - 0.62) * 28;
    return Math.max(-22, bed);
  }

  const beach = inland / 38;
  let height = beach < 1 ? beach * beach * 1.35 : 1.35 + (beach - 1) * 0.55 + (fbm(x * 0.028, z * 0.028) - 0.35) * 5.2;

  const mdx = x + 30;
  const mdz = z + 170;
  const mountain = Math.hypot(mdx, mdz);
  if (mountain < 150) {
    const peak = 1 - mountain / 150;
    height = Math.max(height, peak * peak * 48);
  }

  const lagoon = Math.hypot(x + 155, z - 36);
  if (lagoon < 34) height = Math.min(height, -3.4 + lagoon * 0.04);
  else if (lagoon < 48) height = Math.max(height, 2.4 + (48 - lagoon) * 0.08);

  if (Math.abs(x - 128) < 40 && Math.abs(z - 96) < 32) height = 1.65;

  const clearing = Math.hypot(x - 8, z - 48);
  if (clearing < 24) height = 3.1 + clearing * 0.01;

  const river = distToSegment(x, z, -20, -120, 10, 250);
  if (river < 12) height = Math.min(height, -1.45 + river * 0.2);

  const fall = distToSegment(x, z, -28, -150, -16, -118);
  if (fall < 7) height = Math.min(height, 6 + (z + 150) * 0.22);

  const caveU = x - 48;
  const caveV = z + 128;
  if (caveU > -6 && caveU < 46 && Math.abs(caveV) < 7) {
    const walls = Math.abs(caveV) / 7;
    height = Math.min(height, 2.15 + walls * walls * 1.4);
  }

  return height;
}

export function sampleIsland(x: number, z: number, time = 0): IslandSample {
  const floor = islandFloor(x, z, time);
  const surface = islandSurface(x, z, time);
  return { floor, surface, depth: Math.max(0, surface - floor) };
}

/** South beach, on dry sand a few steps above the wash. */
export function islandSpawn() {
  return { x: -76, z: 248 };
}

export function islandBeacon() {
  return { x: -62, z: 232 };
}

export interface IslandAlley {
  x: number;
  z: number;
  ix: number;
  iz: number;
  aquatic?: boolean;
}

/** Beaches, jungle paths, the resort lawn, and the lagoon shallows. */
export function islandAlleys(): IslandAlley[] {
  return [
    { x: -76, z: 236, ix: 0, iz: -1 },
    { x: -30, z: 242, ix: 0, iz: -1 },
    { x: 24, z: 230, ix: 0, iz: -1 },
    { x: 128, z: 78, ix: 0, iz: -1 },
    { x: 8, z: 48, ix: 0, iz: 1 },
    { x: -40, z: -16, ix: 1, iz: 0.2 },
    { x: 70, z: -108, ix: 0, iz: 1 },
    { x: -140, z: 28, ix: 1, iz: 0, aquatic: true },
  ];
}
