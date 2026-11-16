import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CAMERA_MODE_PRESETS,
  ThirdPersonCamera,
  cameraRelativeVelocity,
  dampAngle,
  dampAngleTracking,
  dampTracking,
  trackingTimeConstant,
  keyboardPitchDelta,
  keyboardYawDelta,
  stepYaw,
} from './camera';

const left = keyboardYawDelta(true, false, 0.1);
const right = keyboardYawDelta(false, true, 0.1);
assert.ok(left > 0.3 && left < 0.4, 'A turns the camera left');
assert.ok(Math.abs(left + right) < 1e-6, 'holding A and D cancels the turn');
assert.equal(keyboardYawDelta(false, false, 0.5), 0);
const lookUp = keyboardPitchDelta(true, false, 0.1);
const lookDown = keyboardPitchDelta(false, true, 0.1);
assert.ok(lookUp < -0.14 && lookUp > -0.17, 'W looks up');
assert.ok(Math.abs(lookUp + lookDown) < 1e-6, 'holding W and S cancels the tilt');
assert.ok(keyboardPitchDelta(true, false, 0.1, -1) > 0.14, 'invert look flips W');
assert.equal(keyboardPitchDelta(false, false, 0.5), 0);

const eased = dampAngle(0, Math.PI / 2, 0.2, 1 / 60);
assert.ok(eased > 0.05 && eased < 0.25, 'yaw eases instead of snapping in one frame');
const around = dampAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.05, 1 / 60);
assert.ok(around > 3 || around < -3, 'damping takes the short way around');
assert.ok(CAMERA_MODE_PRESETS.combat.distance! < CAMERA_MODE_PRESETS.standard.distance!);
assert.ok(CAMERA_MODE_PRESETS.cinematic.distance! > CAMERA_MODE_PRESETS.standard.distance!);
assert.ok((CAMERA_MODE_PRESETS.cinematic.rotationSmoothing ?? 0) > (CAMERA_MODE_PRESETS.standard.rotationSmoothing ?? 0));

const ahead = cameraRelativeVelocity(0, 0, 1);
assert.ok(ahead.z > 0.9 && Math.abs(ahead.x) < 0.01, 'forward stays on the camera yaw');
const strafe = cameraRelativeVelocity(0, 1, 0);
assert.ok(Math.abs(strafe.z) < 0.01, 'strafe does not change the look direction');

const quarter = stepYaw(0, Math.PI / 2, 10, 0.1);
assert.ok(quarter > 0.95 && quarter < 1.05, 'the body turns toward movement');
const wrapped = stepYaw(Math.PI - 0.05, -Math.PI + 0.05, 8, 0.05);
assert.ok(wrapped > 3 || wrapped < -3, 'a turn takes the short way around');

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
const rig = new ThirdPersonCamera(camera, []);
const feet = new THREE.Vector3(0, 0, 0);
rig.snap(feet, 0, 0.2);
const parked = camera.position.clone();
feet.set(6, 2.2, 1);
for (let i = 0; i < 50; i += 1) rig.update(1 / 60, feet, 0, 0.2, 'EXPLORATION');
assert.ok(camera.position.x > parked.x + 3, 'the camera follows the character without WASD');
assert.ok(camera.position.y > parked.y + 1, 'the camera climbs with the character');

const look = new THREE.Vector3();
camera.getWorldDirection(look);
assert.ok(look.z > 0.5, 'holding a direction does not yaw the camera');

rig.update(1 / 60, feet, Math.PI / 2, 0.35, 'EXPLORATION', true);
assert.ok(camera.position.x < feet.x, 'mouse yaw orbits behind the look direction');
camera.getWorldDirection(look);
assert.ok(look.x > 0.7, 'orbit faces the new yaw');

const lead = new THREE.Vector3(0.8, 9, 0);
const before = camera.position.x;
rig.update(1 / 60, feet, Math.PI / 2, 0.35, 'EXPLORATION', true, lead);
assert.ok(camera.position.x > before + 0.4, 'lead opens the frame ahead of the run');
assert.ok(Math.abs(camera.position.y - (feet.y + 2.2)) < 3, 'vertical lead is ignored');

const slowCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
const slow = new ThirdPersonCamera(slowCam, []);
const home = new THREE.Vector3(0, 0, 0);
slow.setMode('cinematic');
slow.snap(home, 0, 0.2);
assert.ok(slow.snapshot().framing.distance > 6, 'cinematic framing pulls back');
slow.setMode('combat');
slow.update(1 / 60, home, 0, 0.2, 'EXPLORATION', true);
assert.ok(slow.snapshot().framing.distance < 4, 'combat focus tightens the frame');
slow.setConfig({ rotationSmoothing: 0.2 });
slow.snap(home, 0, 0.2);
slow.update(1 / 60, home, Math.PI / 2, 0.2, 'EXPLORATION');
const slowLook = new THREE.Vector3();
slowCam.getWorldDirection(slowLook);
assert.ok(slowLook.x < 0.45, 'a yaw change eases in instead of snapping the rig');

// --- Frame-time-independent follow -------------------------------------------
// A runner at 8.6 m/s. How far the camera trails must not depend on the frame time.
const trailAfter = (step: (i: number) => number, tracking: boolean, tau = 0.05) => {
  const speed = 8.6;
  let target = 0;
  let pivot = 0;
  const trails: number[] = [];
  for (let i = 0; i < 400; i += 1) {
    const dt = step(i);
    const previous = target;
    target += speed * dt;
    pivot = tracking
      ? dampTracking(pivot, target, previous, trackingTimeConstant(tau), dt)
      : pivot + (target - pivot) * (1 - Math.exp(-dt / tau));
    if (i > 200) trails.push(target - pivot);
  }
  return { min: Math.min(...trails), max: Math.max(...trails) };
};
const at60 = trailAfter(() => 1 / 60, true);
const at30 = trailAfter(() => 1 / 30, true);
const at144 = trailAfter(() => 1 / 144, true);
const uneven = trailAfter((i) => (i % 2 ? 0.01 : 0.0233), true);
const hitch = trailAfter((i) => (i % 40 === 0 ? 0.05 : 1 / 60), true);
for (const [label, run] of Object.entries({ at30, at144, uneven, hitch })) {
  assert.ok(Math.abs(run.min - at60.min) < 1e-6 && Math.abs(run.max - at60.max) < 1e-6, `${label}: the trail matches 60 fps`);
}
const old60 = trailAfter(() => 1 / 60, false);
const oldUneven = trailAfter((i) => (i % 2 ? 0.01 : 0.0233), false);
assert.ok(Math.abs(at60.max - old60.max) < 1e-6, 'at 60 fps the trail is what the presets were tuned to');
assert.ok(oldUneven.max - oldUneven.min > 0.005, 'the plain ease shakes by millimetres under uneven frames');
assert.ok(uneven.max - uneven.min < 1e-9, 'tracking does not');

// A sudden move is approached from one side, never overshot.
let chased = 0;
let from = 0;
for (let i = 0; i < 60; i += 1) {
  const goal = 2;
  const next = dampTracking(chased, goal, i === 0 ? from : goal, 0.05, 1 / 60);
  assert.ok(next >= chased - 1e-12 && next <= goal + 1e-12, 'a step is eased without overshoot');
  chased = next;
  from = goal;
}
assert.ok(Math.abs(chased - 2) < 1e-3, 'and it arrives');
assert.equal(dampTracking(1, 5, 4, 0, 1 / 60), 5, 'no smoothing means no lag');
assert.equal(dampTracking(1, 5, 4, 0.1, 0), 1, 'a frozen frame holds still');
// A teleport is a cut: eased plainly rather than extrapolated.
const cut = dampTracking(0, 100, 0, 0.05, 1 / 60, 60);
assert.ok(Math.abs(cut - 100 * (1 - Math.exp(-(1 / 60) / 0.05))) < 1e-9);

// Turning through the seam at pi keeps going the short way.
let yawGoal = Math.PI - 0.3;
let yawNow = yawGoal;
for (let i = 0; i < 40; i += 1) {
  const previous = yawGoal;
  yawGoal += 3.2 / 60;
  const next = dampAngleTracking(yawNow, yawGoal, previous, trackingTimeConstant(0.035), 1 / 60);
  let moved = next - yawNow;
  if (moved < -Math.PI) moved += Math.PI * 2;
  assert.ok(moved > 0 && moved < 0.1, 'the view keeps turning the same way across the seam');
  yawNow = next;
}

// The rig itself: same trail at 60 fps and at uneven frame times once tracking is on.
const rigTrail = (tracking: boolean, step: (i: number) => number) => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  const follow = new ThirdPersonCamera(cam, []);
  follow.steadyFollow = tracking;
  const at = new THREE.Vector3();
  follow.snap(at, 0, 0.2);
  const xs: number[] = [];
  for (let i = 0; i < 300; i += 1) {
    const dt = step(i);
    at.x += 8.6 * dt;
    follow.update(dt, at, 0, 0.2, 'EXPLORATION');
    if (i > 150) xs.push(at.x - cam.position.x);
  }
  return Math.max(...xs) - Math.min(...xs);
};
assert.ok(rigTrail(true, (i) => (i % 2 ? 0.01 : 0.0233)) < 1e-6, 'the rig holds the runner still in frame under uneven frames');
assert.ok(rigTrail(false, (i) => (i % 2 ? 0.01 : 0.0233)) > 0.005, 'with the flag off it behaves as before');

// A relocate (teleport) does not fling the tracking rig.
const hopCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
const hop = new ThirdPersonCamera(hopCam, []);
hop.steadyFollow = true;
const spot = new THREE.Vector3();
hop.snap(spot, 0, 0.2);
spot.set(40, 0, -25);
hop.relocate(spot);
hop.update(1 / 60, spot, 0, 0.2, 'EXPLORATION');
assert.ok(Math.hypot(hopCam.position.x - 40, hopCam.position.z + 25) < 6, 'the camera is at the new spot on the next frame');

console.log('camera follow ok');
