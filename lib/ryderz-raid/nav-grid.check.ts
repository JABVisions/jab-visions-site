import assert from 'node:assert/strict';
import { NavGrid, sealCrevices } from './nav-grid';
import { pointBlocked, type Obstacle } from './world';

const LIMIT = 20;

// A wall across the middle with a door at the north end.
const wall: Obstacle[] = [{ kind: 'box', minX: -1, maxX: 1, minZ: -20, maxZ: 12 }];
const grid = new NavGrid(wall, LIMIT);
assert.equal(grid.routeTo(-8, 0, -8, 6), null, 'an open straight line needs no route');
const hop = grid.routeTo(-8, 0, 8, 0, 0.5);
assert.ok(hop, 'a walled-off goal gets a waypoint');
assert.ok(hop!.z > 4, `the waypoint heads for the door (z=${hop!.z.toFixed(1)})`);
assert.ok(!pointBlocked(hop!.x, hop!.z, 0.4, wall), 'the waypoint is standing room');
assert.ok(grid.pathLength(-8, 0, 8, 0) > 30, 'the path goes round the wall');

// Walk a body along the route: it reaches the far side.
let x = -8;
let z = 0;
for (let i = 0; i < 400 && Math.hypot(8 - x, -z) > 1; i += 1) {
  const next = grid.routeTo(x, z, 8, 0, 0.5) ?? { x: 8, z: 0 };
  const d = Math.hypot(next.x - x, next.z - z) || 1;
  x += ((next.x - x) / d) * 0.2;
  z += ((next.z - z) / d) * 0.2;
  assert.ok(!pointBlocked(x, z, 0.3, wall), `the walk stays out of the wall at ${x.toFixed(1)}, ${z.toFixed(1)}`);
}
assert.ok(Math.hypot(8 - x, -z) <= 1, 'the walk arrives');

// A boxed-in nook (dead end, 1.2 m wide) is sealed; a 2.4 m lane between two streets stays open.
const nook: Obstacle[] = [
  { kind: 'box', minX: -10, maxX: -6, minZ: -4, maxZ: -2 },
  { kind: 'box', minX: -10, maxX: -6, minZ: -0.8, maxZ: 1 },
  { kind: 'box', minX: -12, maxX: -10, minZ: -4, maxZ: 1 },
];
const lane: Obstacle[] = [
  { kind: 'box', minX: 4, maxX: 10, minZ: -6, maxZ: -1.2 },
  { kind: 'box', minX: 4, maxX: 10, minZ: 1.2, maxZ: 6 },
];
const seals = sealCrevices([...nook, ...lane], LIMIT);
const sealed = (px: number, pz: number) => pointBlocked(px, pz, 0.05, seals);
assert.ok(sealed(-8, -1.4), 'the dead-end nook is filled');
assert.ok(!sealed(7, 0), 'the lane between two streets is left open');
assert.ok(!sealed(0, 0) && !sealed(-15, 10), 'open street is never touched');
assert.equal(sealCrevices([...nook, ...lane, ...seals], LIMIT).length, 0, 'sealing is complete in one pass');

// --- Fields grown on demand give the same answers as fields flooded to the map edge ---
let seed = 99;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
const CITY = 60;
const city: Obstacle[] = [];
for (let i = 0; i < 70; i += 1) {
  const cx = (rand() - 0.5) * CITY * 1.8;
  const cz = (rand() - 0.5) * CITY * 1.8;
  const w = 1 + rand() * 9;
  const d = 1 + rand() * 9;
  city.push({ kind: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}
for (let i = 0; i < 25; i += 1) city.push({ kind: 'circle', x: (rand() - 0.5) * CITY * 1.8, z: (rand() - 0.5) * CITY * 1.8, r: 0.3 + rand() * 1.2 });
const lazy = new NavGrid(city, CITY);
const full = new NavGrid(city, CITY, { eager: true });
let routed = 0;
// A crowd around a player who keeps moving: many bodies, few goals at a time, goals drifting.
// More distinct goals than the grid keeps, so fields are recycled along the way.
let px = -40;
let pz = -35;
for (let step = 0; step < 60; step += 1) {
  px += 1.7;
  pz += 1.3 * Math.sin(step / 5) + 0.9;
  for (let body = 0; body < 12; body += 1) {
    const fx = px + (rand() - 0.5) * 50;
    const fz = pz + (rand() - 0.5) * 50;
    const tx = px + (rand() - 0.5) * 4;
    const tz = pz + (rand() - 0.5) * 4;
    const radius = [0.4, 0.5, 0.8, 1.2][body % 4];
    const a = lazy.routeTo(fx, fz, tx, tz, radius);
    const b = full.routeTo(fx, fz, tx, tz, radius);
    assert.deepEqual(a, b, `route ${step}/${body} matches the full flood`);
    if (a) routed += 1;
    assert.equal(lazy.pathLength(fx, fz, tx, tz, radius), full.pathLength(fx, fz, tx, tz, radius), `length ${step}/${body} matches`);
  }
}
assert.ok(routed > 100, `the city blocks enough straight lines to exercise routing (${routed})`);
assert.ok(lazy.expanded < full.expanded * 0.6, `grown fields settle fewer cells (${lazy.expanded} against ${full.expanded})`);
// The same question again costs nothing more.
const settled = lazy.expanded;
lazy.routeTo(px + 20, pz - 15, px, pz, 0.5);
const once = lazy.expanded;
lazy.routeTo(px + 20, pz - 15, px, pz, 0.5);
assert.equal(lazy.expanded, once, 'a repeated query reuses the settled field');
assert.ok(once >= settled);
// Unreachable: a goal boxed in on all sides answers null from both, and stays null.
const cage: Obstacle[] = [
  { kind: 'box', minX: -6, maxX: 6, minZ: -6, maxZ: -4 },
  { kind: 'box', minX: -6, maxX: 6, minZ: 4, maxZ: 6 },
  { kind: 'box', minX: -6, maxX: -4, minZ: -6, maxZ: 6 },
  { kind: 'box', minX: 4, maxX: 6, minZ: -6, maxZ: 6 },
];
const caged = new NavGrid(cage, LIMIT);
assert.equal(caged.routeTo(-15, 0, 0, 0, 0.5), null, 'no way into a sealed room');
assert.equal(caged.pathLength(-15, 0, 0, 0, 0.5), Infinity);
assert.equal(caged.routeTo(-15, 0, 0, 0, 0.5), null);

console.log(`nav grid ok (${lazy.expanded} cells grown, ${full.expanded} flooded)`);
