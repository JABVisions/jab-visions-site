import assert from 'node:assert/strict';
import { cameraRelativeVelocity } from './camera';
import { pointBlocked } from './world';
import { buildPadWorld, padHeight, padRoute } from './world-pad';

assert.equal(padHeight(0, 8), 0, 'the chamber floor stays at ground level');
assert.equal(padHeight(-8, -4), 0, 'the Beacon stays on the chamber floor');
assert.ok(padHeight(-17.4, 0) > 4, 'the west stair still reaches the balcony');
assert.equal(padHeight(20, 0), 0, 'the east corridor stays on the ground');
assert.equal(padHeight(0, 20), 4.4, 'the north balcony stays the upper ring');

let prev = 0;
for (let x = -12; x >= -30; x -= 0.25) {
  const height = padHeight(x, 0);
  assert.ok(height + 0.05 >= prev, `the west route does not drop at x ${x}`);
  prev = height;
}
assert.equal(prev, 4.4, 'the observation deck is the upper floor');
assert.equal(padHeight(-55, 1), 4.4, 'the laboratory hall is connected at the same height');
assert.equal(padHeight(-72, 0), 0, 'past the secured door is not a hidden floor');

const up = padRoute(0, 0, -28, 0);
assert.ok(up && up.x < -12 && Math.abs(up.z) < 0.1, 'ground hosts are sent to the west stair');
const through = padRoute(-30, 0, -55, 0);
assert.ok(through && through.x < -38, 'deck hosts are sent through the lab door');
assert.equal(padRoute(1, 2, 4, -2), null, 'same-floor travel needs no waypoint');

const ahead = cameraRelativeVelocity(0, 0, 1);
assert.ok(ahead.z > 0.9 && Math.abs(ahead.x) < 0.01, 'W follows the camera forward');
const right = cameraRelativeVelocity(0, 1, 0);
assert.ok(right.x < -0.9 && Math.abs(right.z) < 0.01, 'D strafes to the character right');
const diagonal = cameraRelativeVelocity(0.4, 1, 1);
assert.ok(Math.hypot(diagonal.x, diagonal.z) <= 1.001, 'diagonals are not faster');
const facingEast = cameraRelativeVelocity(Math.PI / 2, 0, 1);
assert.ok(facingEast.x > 0.9 && Math.abs(facingEast.z) < 0.01, 'forward stays horizontal with yaw');

const world = buildPadWorld();
for (let x = -18; x >= -39.2; x -= 0.4) {
  assert.equal(pointBlocked(x, 0, 0.45, world.obstacles), false, `the deck center stays open at x ${x}`);
}
assert.equal(pointBlocked(-40.4, 0, 0.4, world.obstacles), true, 'the lab door starts closed');
world.stepFacility?.([{ x: -40.4, z: 0 }], 0.6);
assert.equal(pointBlocked(-40.4, 0, 0.4, world.obstacles), false, 'the door opens for someone at the threshold');
assert.equal(pointBlocked(-55, 0, 0.4, world.obstacles), false, 'the hall itself is walkable');
assert.equal(pointBlocked(-67.9, 0, 0.4, world.obstacles), true, 'the secured door stops the hall');
world.stepFacility?.([{ x: 0, z: 0 }], 0.7);
assert.equal(pointBlocked(-40.4, 0, 0.4, world.obstacles), true, 'the door closes after the threshold clears');
world.dispose();

console.log('world-pad.check ok');
