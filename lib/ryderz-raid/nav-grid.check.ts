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
console.log('nav grid ok');
