import assert from 'node:assert/strict';
import { ledgeDrop, resolveFooting, slopeBlocks } from '../footing';
import { ISLAND_LANDMARKS, ISLAND_VALLEY, islandAlleys, islandBeacon, islandFloor, islandSpawn, islandZone, sampleIsland } from './terrain';
import { emptySwim, shallowDirection, stepSwim } from './swim';

const spawn = sampleIsland(islandSpawn().x, islandSpawn().z);
assert.ok(spawn.floor > 0.5 && spawn.floor < 1.3 && spawn.depth === 0, 'the squad drops on dry sand');
const beacon = sampleIsland(islandBeacon().x, islandBeacon().z);
assert.ok(beacon.depth === 0 && beacon.floor > 0.4, 'the beacon stands on dry ground');

const ocean = sampleIsland(0, 700);
assert.ok(ocean.depth > 8, 'the open ocean is deep enough to dive');
const peak = islandFloor(-48, -178);
assert.ok(peak > 80, 'the north summit is a mountain');
const second = islandFloor(62, -88);
assert.ok(second > 45, 'a second summit stands east of the first');
const lip = islandFloor(-20, -122);
const plunge = islandFloor(-18, -100);
assert.ok(lip > plunge + 25, 'the main waterfall drops off a cliff');
const cliff = islandFloor(-230, -40);
assert.ok(cliff > 12, 'the west coast rises into a cliff');
const lagoon = sampleIsland(-155, 36);
assert.ok(lagoon.depth > 2.5, 'the lagoon holds water');
const resort = sampleIsland(128, 96);
assert.ok(Math.abs(resort.floor - 1.65) < 0.05 && resort.depth === 0, 'the resort lawn is a flat dry pad');
const cave = sampleIsland(43, -100);
const caveHill = islandFloor(18, -100);
assert.ok(cave.floor < 4 && cave.floor > 1.5, 'the cave passage is a walkable floor');
assert.ok(caveHill > cave.floor + 8, 'the cave sits under a hill');
const grotto = islandFloor(-19, -136);
const grottoRoof = islandFloor(-42, -136);
assert.ok(grotto < 3 && grottoRoof > grotto + 20, 'a grotto opens in the cliff behind the waterfall');
const river = sampleIsland(-5, 40);
assert.ok(river.depth > 0.8, 'the river is deep enough to wade');

const crest = islandFloor(-48, -178);
const forest = islandFloor(-70, 140);
assert.ok(forest > 0.8 && forest < 16, 'the rainforest rolls just above the creeks');
assert.ok(crest > forest + 50, 'the summit stands far above the rainforest');
assert.ok(crest > spawn.floor + 60, 'climbing the mountain leaves the beach far below');
const pass = islandFloor(-10, -150);
assert.ok(pass > 12 && pass < crest - 40 && pass < second - 20, 'the pass is high ground below both summits');

let shoulderHi = 0;
let shoulderLo = 999;
for (let i = 0; i < 12; i += 1) {
  const ang = -Math.PI / 2 + (i / 11 - 0.5) * 1.4;
  const h = islandFloor(-48 + Math.cos(ang) * 70, -178 + Math.sin(ang) * 70);
  if (h > shoulderHi) shoulderHi = h;
  if (h < shoulderLo) shoulderLo = h;
}
assert.ok(shoulderHi - shoulderLo > 8, 'a lap around the mountain climbs and drops');
assert.ok(crest > shoulderLo + 20, 'the crest is higher than the dips on its own slope');
const westSummit = islandFloor(-100, -55);
const westFoot = islandFloor(-100, 20);
assert.ok(westSummit > 30 && sampleIsland(-100, -55).depth === 0, 'the west summit is dry high ground');
assert.ok(westSummit > westFoot + 12, 'the west summit is above the slope below it');

const creek = sampleIsland(-73, 100);
const creekBank = islandFloor(-84, 108);
assert.ok(creek.depth > 0.5, 'a rainforest stream holds water');
assert.ok(creekBank > creek.floor + 1.2, 'the stream sits in a dip below its bank');

assert.ok(slopeBlocks(8, 0.4, 0.7), 'a cliff face blocks a step');
assert.equal(slopeBlocks(1.2, 2, 0.7), false, 'a trail is walkable');
const cliffStep = { x: -20, z: -115 };
resolveFooting(islandFloor, cliffStep, -20, -102, islandFloor(-20, -102), 0.7);
assert.ok(Math.abs(cliffStep.z + 102) < 0.2, 'a step into the waterfall cliff is pushed back');
const trail = { x: -48, z: -168 };
const trailFrom = islandFloor(-48, -166);
resolveFooting(islandFloor, trail, -48, -166, trailFrom, 0.7);
assert.ok(Math.abs(trail.z + 168) < 0.05, 'the mountain trail accepts a short climb');
assert.ok(ledgeDrop(64, -1, 0.4), 'walking off the lip starts a fall');
assert.equal(ledgeDrop(10, 9.2, 0.4), false, 'a small dip stays on the ground');

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

assert.equal(islandZone(islandSpawn().x, islandSpawn().z), 'beach');
assert.equal(islandZone(-70, 140), 'jungle');
assert.equal(islandZone(-48, -178), 'summit');
assert.equal(islandZone(ISLAND_VALLEY.x, ISLAND_VALLEY.z), 'valley');
const valley = sampleIsland(ISLAND_VALLEY.x, ISLAND_VALLEY.z);
assert.ok(valley.depth === 0 && valley.floor > 6 && valley.floor < 14, 'the hidden valley is dry grass');
assert.equal(islandZone(-8, -66), 'basin');
assert.equal(islandZone(-100, -8), 'highlands');
const landmarkZone: Record<string, string> = {
  Beach: 'beach',
  Jungle: 'jungle',
  Valley: 'valley',
  Highlands: 'highlands',
  Falls: 'basin',
  Summit: 'summit',
};
for (const mark of ISLAND_LANDMARKS) {
  const expect = landmarkZone[mark.name];
  if (expect) assert.equal(islandZone(mark.x, mark.z), expect, `${mark.name} sits in its zone`);
}

function canWalk(tx: number, tz: number) {
  let x = islandSpawn().x;
  let z = islandSpawn().z;
  let floor = islandFloor(x, z);
  for (let i = 0; i < 900; i += 1) {
    if (Math.hypot(tx - x, tz - z) < 8) return true;
    const heading = Math.atan2(tx - x, tz - z);
    let moved = false;
    for (const bias of [0, 0.35, -0.35, 0.8, -0.8, 1.3, -1.3, 2.1, -2.1]) {
      const angle = heading + bias;
      const pos = { x: x + Math.sin(angle) * 2.2, z: z + Math.cos(angle) * 2.2 };
      const next = resolveFooting(islandFloor, pos, x, z, floor, 0.7);
      if (Math.hypot(pos.x - x, pos.z - z) < 0.45) continue;
      const progress = Math.hypot(tx - x, tz - z) - Math.hypot(tx - pos.x, tz - pos.z);
      if (bias !== 0 && progress < 0.2) continue;
      x = pos.x;
      z = pos.z;
      floor = next;
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return false;
}

assert.ok(canWalk(ISLAND_VALLEY.x, ISLAND_VALLEY.z), 'the hidden valley is reachable from the beach');
assert.ok(canWalk(40, -48), 'the cave approach is a graded path');
assert.ok(canWalk(-100, -8), 'the west ridge can be climbed');
assert.ok(canWalk(-48, -178), 'the summit is still a walk from the beach');

console.log('island paradise ok');
