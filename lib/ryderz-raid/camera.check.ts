import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera, cameraRelativeVelocity, stepYaw } from './camera';

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

console.log('camera follow ok');
