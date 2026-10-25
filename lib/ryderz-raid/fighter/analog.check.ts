import assert from 'node:assert/strict';
import { analogStick } from './analog';
import { cameraRelativeVelocity } from '../camera';

assert.deepEqual(analogStick(0.1, -0.1, 0.18), { x: 0, y: 0 }, 'stick drift stays neutral');
assert.ok(analogStick(0.1801, 0, 0.18, 1.5).x < 0.001, 'crossing the dead zone does not jump the camera');
assert.equal(analogStick(1, 0, 0.18, 1.5).x, 1, 'full deflection keeps full turning speed');
assert.deepEqual(analogStick(NaN, 0, 0.18), { x: 0, y: 0 });
const walk = analogStick(0.4, 0, 0.2);
assert.ok(walk.x > 0.24 && walk.x < 0.26, 'light stick pressure gives a slow walk');
const diagonal = analogStick(1, 1, 0.2);
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9, 'diagonals respect the speed limit');
const move = cameraRelativeVelocity(1.2, walk.x, 0);
assert.ok(Math.abs(Math.hypot(move.x, move.z) - walk.x) < 1e-9, 'camera-relative motion preserves analog speed');
console.log('analog input checks ok');
