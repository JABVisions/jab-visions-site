import assert from 'node:assert/strict';
import { allyFocusIndex, commitSteer, formUp, freshNav, pressTarget } from './nav';
import { steerVelocity } from './world';

const wall = (x: number, z: number) => x > 2 && x < 28 && z > -4 && z < 4;
const intoWall = steerVelocity(1.5, 0, 5, 0, 0.35, wall, 40, 0);
assert.ok(Math.hypot(intoWall.x, intoWall.z) > 1, 'a blocked heading slides instead of stopping');
assert.ok(Math.abs(intoWall.z) > Math.abs(intoWall.x), 'the slide runs along the wall');

const hint = freshNav();
let x = 0;
let z = 0;
for (let step = 0; step < 160; step += 1) {
  const steered = commitSteer(hint, x, z, 6, 0, 0.4, wall, 34, 0, 0.05);
  x += steered.x * 0.05;
  z += steered.z * 0.05;
}
assert.ok(x > 28, 'walking into a long wall still reaches the far side');

const player = { x: 0, z: 0 };
const hunt = allyFocusIndex({ x: 4, z: 0 }, player, [{ x: 26, z: 2, hp: 10 }], false);
assert.equal(hunt, 0, 'a teammate beside the player walks out to a nearby host');
const beside = allyFocusIndex({ x: 3, z: 1 }, player, [{ x: 80, z: 80, hp: 10 }], false);
assert.equal(beside, -1, 'a distant pack does not pull a teammate off the player');
const helping = allyFocusIndex({ x: 70, z: 0 }, player, [{ x: 4, z: 2, hp: 10 }], false);
assert.equal(helping, 0, 'a teammate crosses the map to a host that is on the player');
const contact = allyFocusIndex({ x: 40, z: 0 }, player, [{ x: 44, z: 1, hp: 10 }], false);
assert.equal(contact, 0, 'a host already in reach is fought');
const dropped = allyFocusIndex({ x: 60, z: 0 }, player, [{ x: 90, z: 0, hp: 10 }], false);
assert.equal(dropped, -1, 'a chase that leaves the squad is abandoned');
const held = allyFocusIndex({ x: 48, z: 0 }, player, [{ x: 70, z: 0, hp: 10 }], true);
assert.equal(held, 0, 'an ongoing chase may run farther than a new one');

const aim = pressTarget(
  0,
  0,
  [
    { x: 10, z: 0, vx: 4, vz: 0, hpRatio: 1, weight: 0.62 },
    { x: 8, z: 0, vx: 0, vz: 0, hpRatio: 1, weight: 1 },
  ],
  false,
);
assert.ok(aim.x > 10, 'the player is preferred and led');
const close = pressTarget(0, 0, [{ x: 1, z: 0, vx: -10, vz: 0, hpRatio: 1, weight: 1 }], false);
assert.equal(close.x, 1, 'close pursuit tracks the body instead of overshooting behind the host');
const distant = pressTarget(0, 0, [{ x: 150, z: -90, vx: 5, vz: 0, hpRatio: 1, weight: 1 }], false);
assert.ok(distant.x >= 150 && distant.z === -90, 'hostiles track a player across the map without a distance cutoff');
const spot = formUp(0, 0, 1);
assert.ok(Math.hypot(spot.x, spot.z) > 2, 'regrouping stands beside the player');

console.log('nav ok');
