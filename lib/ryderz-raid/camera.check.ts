import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CAMERA_MODE_PRESETS,
  ThirdPersonCamera,
  cameraRelativeVelocity,
  dampAngle,
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

// A newly encountered obstruction must constrain the lens on this frame.
const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.2), new THREE.MeshBasicMaterial());
wall.position.set(0, 2, -2);
wall.updateMatrixWorld(true);
rig.snap(home, 0, 0.2);
rig.setOccluders([wall]);
rig.update(1 / 60, home, 0, 0.2, 'EXPLORATION');
assert.ok(camera.position.z > -1.9, 'camera retracts immediately instead of clipping through a wall');
rig.setOccluders([]);
rig.update(1 / 60, home, 0, 0.2, 'EXPLORATION');
assert.ok(camera.position.z > -2.5, 'camera returns gently when the wall clears');

const quietCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
const quiet = new ThirdPersonCamera(quietCam, []);
quiet.setConfig({ shakeIntensity: 0, stickDeadzone: 0.24 });
quiet.setMode('combat');
assert.equal(quiet.config.shakeIntensity, 0, 'rig changes preserve shake preference');
assert.equal(quiet.config.stickDeadzone, 0.24, 'rig changes preserve dead zone preference');
quiet.snap(home, 0, 0.2);
const steady = quietCam.position.clone();
const steadyFov = quietCam.fov;
quiet.addShake(1);
quiet.addKick(0.5);
quiet.addFovPunch(12);
quiet.update(1 / 60, home, 0, 0.2, 'EXPLORATION');
assert.ok(quietCam.position.distanceTo(steady) < 1e-6, 'shake off keeps the camera steady on impact');
assert.equal(quietCam.fov, steadyFov, 'shake off suppresses impact FOV pulses');
wall.geometry.dispose();
(wall.material as THREE.Material).dispose();
console.log('camera follow ok');
