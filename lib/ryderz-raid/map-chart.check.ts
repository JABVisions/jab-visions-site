import assert from 'node:assert/strict';
import { chartBlocks } from './map-chart';
import type { Obstacle } from './world';

const obstacles: Obstacle[] = [
  { kind: 'circle', x: 1, z: 2, r: 0.25 },
  { kind: 'circle', x: -11, z: 4, r: 0.2 },
  { kind: 'circle', x: -21, z: 21, r: 0.55 },
  { kind: 'circle', x: 0, z: 0, r: 3.5 },
  { kind: 'box', minX: 0, maxX: 5.6, minZ: 0, maxZ: 0.14 },
  { kind: 'box', minX: 10, maxX: 10.28, minZ: -3.5, maxZ: 3.5 },
  { kind: 'box', minX: -9, maxX: 9, minZ: -6, maxZ: 6 },
  { kind: 'box', minX: 12.6, maxX: 14.4, minZ: 12.6, maxZ: 14.4 },
];

const blocks = chartBlocks(obstacles);
assert.equal(blocks.length, 5);
assert.equal(blocks.filter((block) => block.kind === 'circle').length, 2);
assert.equal(blocks.filter((block) => block.kind === 'box').length, 3);
const wall = blocks.find((block) => block.kind === 'box' && block.maxX - block.minX < 1);
assert.ok(wall && wall.kind === 'box');
assert.ok(wall.maxZ - wall.minZ > 6);

console.log('map chart ok');
