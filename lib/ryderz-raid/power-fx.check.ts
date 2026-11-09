import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RYDERZ, type RyderId } from './config';
import { BIND_STYLES, PILLAR_STYLES, PowerFx, SHOT_SHAPES, WAVE_STYLES, buildShot } from './power-fx';
import { DERIVED_POWER_IDS, DERIVED_POWERS } from './progression/derived-powers';
import { AURA_PARTICLES, POWER_LOOKS } from './progression/power-looks';

for (const id of DERIVED_POWER_IDS) {
  assert.ok(POWER_LOOKS[DERIVED_POWERS[id].owner], `${id}: owner has a look`);
}
for (const id of Object.keys(RYDERZ) as RyderId[]) {
  const look = POWER_LOOKS[id];
  if (!look) continue;
  assert.ok(SHOT_SHAPES.includes(look.shot), `${id}: known shot`);
  assert.ok(BIND_STYLES.includes(look.snare), `${id}: known binding`);
  assert.ok(AURA_PARTICLES[look.surge], `${id}: known aura`);
  const breaker = look.breaker;
  assert.ok(breaker.pillar || breaker.spray || breaker.wave || breaker.flash, `${id}: breaker shows something`);
  const nova = look.nova;
  assert.ok(nova.radial || nova.wave || nova.flash, `${id}: nova shows something`);
}
assert.equal(POWER_LOOKS.keven.shot, 'dart', 'Dart Fan throws darts');
assert.equal(POWER_LOOKS.keven.snare, 'pins', 'Snare Trap pins ankles');
assert.ok(POWER_LOOKS.keven.blitz.stick, 'Thousand Needles leaves darts to detonate');
assert.ok(POWER_LOOKS.keven.nova.radial, 'Needle Burst throws darts in every direction');

for (const shape of SHOT_SHAPES) {
  const shot = buildShot(shape, 0x5bff8a);
  let meshes = 0;
  shot.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes += 1;
  });
  assert.ok(meshes >= 2, `${shape}: has a body and a highlight`);
}

const emitted: number[] = [];
const particles = { emit: (_p: THREE.Vector3, _c: number, n: number) => emitted.push(n) } as unknown as ConstructorParameters<typeof PowerFx>[0];
const fx = new PowerFx(particles, () => 0);
const camera = new THREE.PerspectiveCamera();
const origin = new THREE.Vector3(0, 1, 0);
const target = { pos: new THREE.Vector3(2, 0, 0), hp: 10, radius: 0.5 };

const shot = fx.acquireShot('dart', 0x5bff8a);
fx.placeShot(shot, origin, new THREE.Vector3(1, 0, 0), 1 / 60);
const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shot.root.quaternion);
assert.ok(forward.x > 0.99, 'a shot points down its velocity');
fx.releaseShot(shot);
assert.equal(fx.acquireShot('dart', 0x5bff8a), shot, 'released shots are reused');
fx.releaseShot(shot);

fx.spray(origin, 0, 1.5, 'dart', 0x5bff8a, 9, 5);
fx.radial(origin, 'blade', 0xff3b5c, 12, 6);
for (const style of WAVE_STYLES) fx.wave(origin, style, 0xffffff, 5);
for (const style of PILLAR_STYLES) fx.pillar(origin, style, 0xffffff, 0.4);
for (const style of BIND_STYLES) fx.bind(target, style, 0xffffff, 2);
fx.flash(origin, 0xffffff, 3);
fx.implode(origin, 0xffffff, 4, 0.4);
fx.vortex(origin, 0xffffff, 5, 0.5);
fx.streak(origin, target.pos, 0xffffff);
fx.aura(new THREE.Vector3(), 0xffffff, 3);
fx.stick(target, 'dart', 0x5bff8a, origin);
assert.ok(fx.activeCount > 30, 'every effect is live');
for (let i = 0; i < 30; i += 1) fx.update(1 / 30, camera);
assert.deepEqual(fx.detonateStuck(), [target], 'detonation reports the body a dart was in');

target.hp = 0;
fx.bind(target, 'pins', 0xffffff, 3);
fx.update(1 / 30, camera);
for (let i = 0; i < 120; i += 1) fx.update(1 / 30, camera);
assert.equal(fx.activeCount, 0, 'everything expires, and bindings drop with their body');

fx.wave(origin, 'water', 0xffffff, 5);
fx.clear();
assert.equal(fx.activeCount, 0, 'clear empties the street');
fx.dispose();
console.log('power fx ok');
