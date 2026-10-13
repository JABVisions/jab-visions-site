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

/** A sheet of water dropping from a cliff lip into a pool. */
export interface IslandFall {
  lipX: number;
  lipZ: number;
  poolX: number;
  poolZ: number;
  halfWidth: number;
  /** Height the cliff is carved down from. The natural summit can be taller. */
  lip: number;
  pool: number;
}

/**
 * Main plunge off the north summit, a step in the jungle river, and a
 * sea cliff on the west coast.
 */
export const ISLAND_FALLS: IslandFall[] = [
  { lipX: -20, lipZ: -122, poolX: -18, poolZ: -96, halfWidth: 8, lip: 62, pool: -1.15 },
  { lipX: -12, lipZ: -28, poolX: -8, poolZ: -8, halfWidth: 6, lip: 16, pool: -1.05 },
  { lipX: -248, lipZ: -14, poolX: -286, poolZ: -14, halfWidth: 7, lip: 30, pool: -0.7 },
];

/** Hill cave. The mouth faces south. A second room sits behind the main fall. */
export const ISLAND_CAVE = {
  minX: 30,
  maxX: 56,
  minZ: -128,
  maxZ: -74,
  floor: 2.2,
};
export const ISLAND_GROTTO = {
  minX: -30,
  maxX: -8,
  minZ: -148,
  maxZ: -126,
  floor: 1.7,
};

function smooth(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Rainforest basin south of the peaks. 1 at the middle, 0 outside the stand. */
export function rainforestMask(x: number, z: number) {
  const dx = (x + 48) / 155;
  const dz = (z - 125) / 78;
  const e = dx * dx + dz * dz;
  if (e >= 1) return 0;
  return smooth(1 - e);
}

/**
 * Sharp summit with spurs and benches. The crest itself is the high point;
 * the slope dips into gullies, then climbs again.
 */
function peakHeight(x: number, z: number, cx: number, cz: number, radius: number, crest: number, power: number) {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  const edge = 1 - t;
  const ang = Math.atan2(dz, dx);
  const spur = 1 - edge * (0.34 * (0.5 - 0.5 * Math.sin(ang * 5 + cx * 0.02)));
  const profile = Math.pow(t, power) * crest * spur;
  // Terraces swing the slope up and down. They fade out at the crest and the foot.
  const terrace = Math.sin(dist * 0.09 + ang * 0.6) * Math.sin(Math.PI * t);
  const gully = Math.min(0, Math.sin(ang * 3 + dist * 0.04)) * edge * t;
  const cut = terrace * 22 + gully * crest * 0.16;
  return Math.max(profile * 0.48, profile + cut);
}

export interface IslandStream {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  bed: number;
}

/** Creeks off the peaks and through the rainforest. Highland reaches stay dry gullies. */
export const ISLAND_STREAMS: IslandStream[] = [
  { ax: -62, az: -160, bx: -24, bz: -108, half: 7, bed: -1.1 },
  { ax: 78, az: -48, bx: -14, bz: -16, half: 6, bed: -1.05 },
  { ax: -110, az: 72, bx: -36, bz: 128, half: 7, bed: -1.3 },
  { ax: -36, az: 128, bx: 6, bz: 186, half: 6, bed: -1.15 },
  { ax: -128, az: 18, bx: -200, bz: -6, half: 5, bed: -0.55 },
];

function carveStream(height: number, x: number, z: number, stream: IslandStream) {
  const dist = distToSegment(x, z, stream.ax, stream.az, stream.bx, stream.bz);
  if (dist >= stream.half) return height;
  const along = 1 - dist / stream.half;
  if (height > 14) return height - along * Math.min(10, 3.2 + height * 0.06);
  return Math.min(height, stream.bed + dist * 0.22);
}

/** Banks falling toward the main river, so the channel sits in a valley. */
function carveValley(height: number, x: number, z: number) {
  if (Math.hypot(x - 8, z - 48) < 28) return height;
  if (Math.abs(x - 128) < 48 && Math.abs(z - 96) < 40) return height;
  const dist = distToSegment(x, z, -18, -96, 12, 210);
  if (dist < 11 || dist >= 24 || z < -70 || z > 210 || height >= 22) return height;
  const side = (dist - 11) / 13;
  return Math.min(height, 0.85 + side * 8);
}

function carveFall(height: number, x: number, z: number, fall: IslandFall) {
  const dist = distToSegment(x, z, fall.lipX, fall.lipZ, fall.poolX, fall.poolZ);
  if (dist > fall.halfWidth) return height;
  const abx = fall.poolX - fall.lipX;
  const abz = fall.poolZ - fall.lipZ;
  const t = Math.max(0, Math.min(1, ((x - fall.lipX) * abx + (z - fall.lipZ) * abz) / (abx * abx + abz * abz || 1)));
  if (t < 0.14) return height;
  const u = Math.min(1, (t - 0.14) / 0.48);
  return Math.min(height, fall.pool + (1 - u) * (fall.lip - fall.pool));
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

  const beach = inland / 36;
  const jungle = beach < 1 ? 0 : Math.min(1, (beach - 1) / 2.5);
  const broad = (fbm(x * 0.011, z * 0.011) - 0.42) * 16;
  const folds = Math.sin(x * 0.034 + z * 0.02) * 6 + Math.sin(x * 0.08 - z * 0.055) * 2.4;
  let height = beach < 1 ? beach * beach * 1.4 : 1.5 + jungle * (10 + broad + folds);

  // The mid-island ridge rises and falls, instead of one smooth hump.
  const rise = beach < 1 ? 0 : Math.min(1, (beach - 1) / 2.4);
  const ridgeSaddle = 0.62 + 0.38 * Math.sin(x * 0.045);
  height += Math.exp(-Math.pow((z + 16) / 78, 2)) * Math.exp(-Math.pow(x / 150, 2)) * 22 * rise * ridgeSaddle;

  const forest = rainforestMask(x, z);
  if (forest > 0 && beach >= 1) {
    const roll =
      6 +
      (fbm(x * 0.028 + 3, z * 0.028 - 1) - 0.38) * 7 +
      Math.sin(x * 0.055 + z * 0.027) * 2.6 +
      Math.min(0, fbm(x * 0.09 + 4, z * 0.08) - 0.6) * 8;
    height = height * (1 - forest) + roll * forest;
  }

  if (beach > 1.25) height = Math.max(height, 0.9);

  // West sea cliff. The notch through it is carved with the waterfalls below.
  if (inland < 52 && x < -165 && Math.abs(z + 8) < 100) {
    const crest = smooth((52 - inland) / 34) * smooth(inland / 8);
    height = Math.max(height, 5 + crest * 32);
  }

  height = Math.max(height, peakHeight(x, z, -48, -178, 175, 120, 1.05));
  height = Math.max(height, peakHeight(x, z, 62, -88, 115, 78, 1.15));
  height = Math.max(height, peakHeight(x, z, -100, -55, 70, 48, 1.15));
  height = Math.max(height, peakHeight(x, z, -90, 36, 48, 22, 1.35));

  // The pass between the two north summits is high ground, but far below either crest.
  const pass = Math.hypot((x + 10) / 42, (z + 150) / 26);
  if (pass < 1) {
    const gate = smooth(1 - pass);
    height = height * (1 - gate) + Math.min(height, 24) * gate;
  }

  // Keep the resort shelf and the south beach from climbing into those hills.
  const shelf = smooth((x - 50) / 80) * Math.max(smooth((z - 30) / 80), smooth((x - 90) / 50));
  if (shelf > 0) height = height * (1 - shelf) + Math.min(height, 2.5) * shelf;

  const lagoon = Math.hypot(x + 155, z - 36);
  if (lagoon < 34) height = Math.min(height, -3.4 + lagoon * 0.04);
  else if (lagoon < 52) height = Math.max(height, 3.2 + (52 - lagoon) * 0.12);

  if (Math.abs(x - 128) < 40 && Math.abs(z - 96) < 32) height = 1.65;

  const clearing = Math.hypot(x - 8, z - 48);
  if (clearing < 24) height = 3.1 + clearing * 0.01;

  for (const fall of ISLAND_FALLS) height = carveFall(height, x, z, fall);

  const river = distToSegment(x, z, -18, -96, 12, 250);
  if (river < 11) height = Math.min(height, -1.35 + river * 0.16);
  height = carveValley(height, x, z);
  for (const stream of ISLAND_STREAMS) height = carveStream(height, x, z, stream);

  const caveMidX = (ISLAND_CAVE.minX + ISLAND_CAVE.maxX) / 2;
  const caveHalf = (ISLAND_CAVE.maxX - ISLAND_CAVE.minX) / 2;
  const inCave = x > ISLAND_CAVE.minX && x < ISLAND_CAVE.maxX && z > ISLAND_CAVE.minZ && z < ISLAND_CAVE.maxZ;
  const caveMouth = x > ISLAND_CAVE.minX && x < ISLAND_CAVE.maxX && z >= ISLAND_CAVE.maxZ && z < ISLAND_CAVE.maxZ + 24;
  const nearCave =
    x > ISLAND_CAVE.minX - 16 &&
    x < ISLAND_CAVE.maxX + 16 &&
    z > ISLAND_CAVE.minZ - 8 &&
    z < ISLAND_CAVE.maxZ + 20;
  if (nearCave && !inCave && !caveMouth) height = Math.max(height, 16);
  if (inCave) height = Math.min(height, ISLAND_CAVE.floor + Math.pow(Math.abs(x - caveMidX) / caveHalf, 2) * 1.6);
  if (caveMouth) {
    const ramp = (z - ISLAND_CAVE.maxZ) / 24;
    const eased = ramp * ramp * (3 - 2 * ramp);
    height = ISLAND_CAVE.floor + (height - ISLAND_CAVE.floor) * eased;
  }

  const inGrotto =
    x > ISLAND_GROTTO.minX && x < ISLAND_GROTTO.maxX && z > ISLAND_GROTTO.minZ && z < ISLAND_GROTTO.maxZ;
  if (inGrotto) height = Math.min(height, ISLAND_GROTTO.floor);

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
    { x: 43, z: -62, ix: 0, iz: -1 },
    { x: -140, z: 28, ix: 1, iz: 0, aquatic: true },
  ];
}
