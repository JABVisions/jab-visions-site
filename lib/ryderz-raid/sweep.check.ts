import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveCircle, sweepCircle, type Obstacle } from './world';

const RADIUS = 0.45;
// A fence 0.3 m thick across the path at x = 5.
const fence: Obstacle = { kind: 'box', minX: 5, maxX: 5.3, minZ: -20, maxZ: 20 };
const post: Obstacle = { kind: 'circle', x: 5.15, z: 30, r: 0.2 };
const obstacles = [fence, post];

const oneShot = (fromX: number, z: number, dx: number) => {
  const pos = new THREE.Vector3(fromX + dx, 0, z);
  resolveCircle(pos, RADIUS, obstacles);
  return pos;
};
const swept = (fromX: number, z: number, dx: number, dz = 0) => {
  const pos = new THREE.Vector3(fromX, 0, z);
  const steps = sweepCircle(pos, dx, dz, RADIUS, obstacles);
  return { pos, steps };
};

// A dodge (15 m/s) on a 50 ms frame from against the fence: 0.75 m in one move.
const start = 5 - RADIUS;
assert.ok(oneShot(start, 0, 0.75).x > 5.3, 'a single resolve leaves the body on the far side');
const dodge = swept(start, 0, 0.75);
assert.ok(Math.abs(dodge.pos.x - start) < 1e-6, 'the swept move stops at the fence');
assert.ok(dodge.steps > 1, 'a long move is taken in strides');

// A launch (30 m/s) on the same frame clears the fence entirely in one shot. Swept, it does not.
assert.ok(oneShot(start - 0.2, 0, 1.5).x > 5.3 + RADIUS - 1e-6);
assert.ok(swept(start - 0.2, 0, 1.5).pos.x <= start + 1e-6);
// And the same for the thin post.
assert.ok(oneShot(4.2, 30, 1.6).x > 5.35);
assert.ok(swept(4.2, 30, 1.6).pos.x < 5.15, 'a post is not skipped either');

// An ordinary run is one stride and lands exactly where the single resolve does.
for (const dx of [0.05, 0.143, 0.3]) {
  const a = oneShot(2, 3, dx);
  const b = swept(2, 3, dx);
  assert.equal(b.steps, 1);
  assert.ok(Math.abs(a.x - b.pos.x) < 1e-12 && Math.abs(a.z - b.pos.z) < 1e-12, 'short moves are unchanged');
}

// Sliding: a diagonal move into the fence keeps its motion along it.
const slide = swept(start, 0, 0.75, 0.75);
assert.ok(Math.abs(slide.pos.x - start) < 1e-6 && Math.abs(slide.pos.z - 0.75) < 1e-6, 'the body slides along the wall');

// The arena edge holds along the way.
const edge = new THREE.Vector3(9.8, 0, 0);
sweepCircle(edge, 3, 0, RADIUS, [], 10);
assert.equal(edge.x, 10);

// Open ground costs no extra distance.
const open = new THREE.Vector3(-30, 0, 0);
sweepCircle(open, 2.5, -1.5, RADIUS, obstacles);
assert.ok(Math.abs(open.x + 27.5) < 1e-9 && Math.abs(open.z + 1.5) < 1e-9);

console.log('sweep checks passed');
