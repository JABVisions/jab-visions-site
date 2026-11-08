import assert from 'node:assert/strict';
import { AUTO_LOCK, pickAutoTarget, steerAutoLock } from './auto-lock';
import { CAMERA_DEFAULTS } from './camera';

const at = (x: number, z: number) => ({ pos: { x, z } });

assert.equal(CAMERA_DEFAULTS.autoLock, 1, 'auto lock is on by default');

// Yaw 0 looks along +Z.
const ahead = at(0, 5);
const behind = at(0, -4.5);
assert.equal(pickAutoTarget(0, 0, 0, [behind, ahead], null), ahead, 'a host in front beats a slightly closer one behind');

const far = at(0, AUTO_LOCK.range + 1);
assert.equal(pickAutoTarget(0, 0, 0, [far], null), null, 'nothing past range is picked up');

const held = at(0, AUTO_LOCK.release - 0.5);
assert.equal(pickAutoTarget(0, 0, 0, [held], held), held, 'a held target survives out to the release distance');
assert.equal(pickAutoTarget(0, 0, 0, [at(0, AUTO_LOCK.release + 1)], null), null);

const near = at(0.5, 4);
const nearer = at(-0.5, 3.6);
assert.equal(pickAutoTarget(0, 0, 0, [near, nearer], near), near, 'a marginally better host does not steal the lock');
const close = at(0, 1.2);
assert.equal(pickAutoTarget(0, 0, 0, [near, close], near), close, 'a much closer host does steal it');

const gone = at(0, 3);
assert.equal(pickAutoTarget(0, 0, 0, [ahead], gone), ahead, 'a dead held target hands over');

// Camera turns toward a host on the right (+X) and stops inside the deadzone.
let yaw = 0;
const right = at(6, 0);
for (let i = 0; i < 90; i += 1) yaw = steerAutoLock(yaw, 0, 0, right, 1 / 60);
assert.ok(Math.abs(yaw - Math.PI / 2) < AUTO_LOCK.deadzone + 0.02, `yaw settles near the host (${yaw.toFixed(3)})`);
const centred = Math.atan2(1, 6);
assert.equal(steerAutoLock(centred - 0.05, 0, 0, at(1, 6), 1 / 60), centred - 0.05, 'inside the deadzone the camera stays put');

console.log('auto lock ok', { settled: yaw.toFixed(3) });
