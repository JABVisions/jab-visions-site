import assert from 'node:assert/strict';
import { islandAlleys, islandBeacon, islandFloor, islandSpawn, sampleIsland } from './terrain';
import { emptySwim, shallowDirection, stepSwim } from './swim';

const spawn = sampleIsland(islandSpawn().x, islandSpawn().z);
assert.ok(spawn.floor > 0.5 && spawn.floor < 1.3 && spawn.depth === 0, 'the squad drops on dry sand');
const beacon = sampleIsland(islandBeacon().x, islandBeacon().z);
assert.ok(beacon.depth === 0 && beacon.floor > 0.4, 'the beacon stands on dry ground');

const ocean = sampleIsland(0, 700);
assert.ok(ocean.depth > 8, 'the open ocean is deep enough to dive');
const peak = islandFloor(-30, -170);
assert.ok(peak > 30, 'the mountain clears the jungle');
const lagoon = sampleIsland(-155, 36);
assert.ok(lagoon.depth > 2.5, 'the lagoon holds water');
const resort = sampleIsland(128, 96);
assert.ok(Math.abs(resort.floor - 1.65) < 0.05 && resort.depth === 0, 'the resort lawn is a flat dry pad');
const cave = sampleIsland(60, -128);
assert.ok(cave.floor < 4 && cave.floor > 1.5, 'the cave passage is a walkable floor under the hill');
const river = sampleIsland(-5, 40);
assert.ok(river.depth > 0.8, 'the river is deep enough to wade');

for (const alley of islandAlleys()) {
  const sample = sampleIsland(alley.x, alley.z);
  if (alley.aquatic) assert.ok(sample.depth > 1, `aquatic alley ${alley.x},${alley.z} is in the water`);
  else assert.ok(sample.depth < 0.4, `land alley ${alley.x},${alley.z} stays out of deep water`);
}

const dry = stepSwim(emptySwim(spawn.floor), spawn, {
  dt: 0.1,
  rise: false,
  dive: false,
  pitch: 0,
  moving: false,
  aheadFloor: spawn.floor,
  aheadDepth: 0,
});
assert.equal(dry.state.mode, 'land');
assert.equal(dry.speedScale, 1);

const wadeColumn = { floor: -0.6, surface: 0, depth: 0.6 };
const wading = stepSwim(emptySwim(0), wadeColumn, {
  dt: 0.1,
  rise: false,
  dive: false,
  pitch: 0,
  moving: true,
  aheadFloor: -0.6,
  aheadDepth: 0.6,
});
assert.equal(wading.state.mode, 'wade');
assert.ok(wading.speedScale < 1 && wading.speedScale > 0.5);

const sea = { floor: -8, surface: 0.1, depth: 8.1 };
let body = emptySwim(-8);
body = stepSwim(body, sea, { dt: 0.5, rise: false, dive: false, pitch: 0, moving: false, aheadFloor: -8, aheadDepth: 8 }).state;
assert.equal(body.mode, 'surface');
assert.ok(body.feetY > sea.surface - 1.3 && body.feetY < sea.surface, 'buoyancy holds the chest at the wave');

const diving = stepSwim(body, sea, { dt: 1, rise: false, dive: true, pitch: 0.2, moving: true, aheadFloor: -8, aheadDepth: 8 });
assert.equal(diving.state.mode, 'under');
assert.ok(diving.state.oxygen < 1, 'air is spent underwater');
assert.ok(diving.state.feetY > sea.floor, 'the dive stops at the seabed');

let empty = { ...diving.state, oxygen: 0, feetY: sea.floor + 0.2 };
const drowning = stepSwim(empty, sea, { dt: 0.5, rise: false, dive: true, pitch: 0, moving: false, aheadFloor: -8, aheadDepth: 8 });
assert.ok(drowning.hurt > 0 && drowning.hurt < 8, 'an empty tank hurts slowly');

const rising = stepSwim(diving.state, sea, { dt: 1.2, rise: true, dive: false, pitch: -0.2, moving: false, aheadFloor: -8, aheadDepth: 8 });
assert.ok(rising.state.feetY > diving.state.feetY, 'rise climbs toward the surface');

const shore = stepSwim(body, sea, { dt: 0.1, rise: true, dive: false, pitch: 0, moving: true, aheadFloor: 0.8, aheadDepth: 0 });
assert.equal(shore.exited, true);
assert.equal(shore.state.mode, 'land');
assert.equal(shore.state.feetY, 0.8);

const push = shallowDirection(0, 0, (x, z) => (z > 2 ? 0.1 : 4));
assert.ok(push && push.z > 0.5, 'terrestrial hosts are pointed toward the shallows');

console.log('island paradise ok');
