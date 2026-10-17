import assert from 'node:assert/strict';
import { cameraRelativeVelocity } from './camera';
import { pointBlocked } from './world';
import { SQUARE_LAB, buildPadWorld, padHeight, padRoute } from './world-pad';

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
assert.equal(padHeight(-72, 0), 4.4, 'the square lab hall continues past the tunnel');
assert.equal(padHeight(SQUARE_LAB.east - 4, 6), 4.4, 'the square hall is wider than the tunnel');
assert.equal(padHeight(SQUARE_LAB.west - 1.4, 0), 0, 'past the square hall west wall is not a floor');
assert.equal(padHeight((SQUARE_LAB.east + SQUARE_LAB.west) / 2, SQUARE_LAB.half + 1.2), 0, 'outside the square hall is not a floor');

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
assert.equal(pointBlocked(-67.9, 0, 0.4, world.obstacles), false, 'the tunnel mouth opens into the square hall');
const squareX = (SQUARE_LAB.east + SQUARE_LAB.west) / 2;
assert.equal(pointBlocked(squareX, 0, 0.4, world.obstacles), false, 'the square hall center is walkable');
assert.equal(pointBlocked(squareX, 4.4, 0.4, world.obstacles), false, 'the square hall stays open wider than the tunnel');
assert.equal(pointBlocked(SQUARE_LAB.west, 0, 0.4, world.obstacles), true, 'the west lab wall stops the hall');
assert.equal(pointBlocked(squareX, SQUARE_LAB.half, 0.4, world.obstacles), true, 'the north lab wall closes the hall');
for (let x = -42; x >= SQUARE_LAB.west + 1.2; x -= 0.5) {
  assert.equal(pointBlocked(x, 0, 0.4, world.obstacles), false, `the lab centerline stays open at x ${x}`);
  assert.equal(padHeight(x, 0), 4.4, `the lab centerline stays at floor height at x ${x}`);
}
assert.equal(world.bounds, 92, 'the pad publishes its own edge instead of the city limit');
for (let i = 0; i < 48; i += 1) {
  const a = -Math.PI + ((i + 0.5) * Math.PI * 2) / 48;
  if (Math.abs(a) < 0.55) continue;
  if (Math.abs(Math.abs(a) - Math.PI) < 0.55) continue;
  const ix = Math.cos(a) * 21.2;
  const iz = Math.sin(a) * 21.2;
  assert.equal(pointBlocked(ix, iz, 0.45, world.obstacles), false, `ring interior stays open at ${a.toFixed(2)}`);
  const ox = Math.cos(a) * 25.15;
  const oz = Math.sin(a) * 25.15;
  assert.equal(pointBlocked(ox, oz, 0.45, world.obstacles), true, `the lab wall holds at ${a.toFixed(2)}`);
}
assert.equal(pointBlocked(24, 0, 0.45, world.obstacles), false, 'the east corridor stays open');
assert.equal(pointBlocked(32, 0, 0.45, world.obstacles), false, 'the east corridor stays open past the cage approach');
assert.equal(pointBlocked(45.25, 0, 0.4, world.obstacles), true, 'the east corridor ends at a lab wall');
assert.equal(pointBlocked(0, 25.6, 0.45, world.obstacles), true, 'north of the balcony is walled');
assert.equal(pointBlocked(-22.1, 12.1, 0.45, world.obstacles), true, 'north of the deck is walled');
for (let i = 0; i < 72; i += 1) {
  const a = -Math.PI + ((i + 0.5) * Math.PI * 2) / 72;
  const eastMouth = Math.abs(a) < 0.16;
  const westMouth = Math.abs(Math.abs(a) - Math.PI) < 0.5;
  if (eastMouth || westMouth) continue;
  let held = false;
  for (let radius = 17; radius <= 29; radius += 0.4) {
    if (pointBlocked(Math.cos(a) * radius, Math.sin(a) * radius, 0.45, world.obstacles)) {
      held = true;
      break;
    }
  }
  assert.equal(held, true, `the lab shell stops a walk off the pad at ${a.toFixed(2)}`);
}
assert.equal(pointBlocked(0, 14.2, 0.45, world.obstacles), false, 'the chamber rim stays open');
assert.equal(pointBlocked(-14.6, 0, 0.4, world.obstacles), false, 'the west stair center stays open');
assert.equal(pointBlocked(0, 14.2, 0.4, world.obstacles), false, 'the north stair center stays open');
world.stepFacility?.([{ x: 0, z: 0 }], 0.7);
assert.equal(pointBlocked(-40.4, 0, 0.4, world.obstacles), true, 'the door closes after the threshold clears');
world.dispose();

console.log('world-pad.check ok');
