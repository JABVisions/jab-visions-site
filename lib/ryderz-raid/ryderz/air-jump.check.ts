import assert from 'node:assert/strict';
import * as THREE from 'three';
import { leapAhead, transferAhead } from './air-jump';
import { NyxKit } from './nyx';
import { gripNecks, pickGripEnd } from './rubi-rig';
import type { KitContext } from './kit';

const necks = gripNecks([0.008, 0.013, 0.04, 0.06, 0.05, 0.018, 0.014, 0.006]);
assert.ok(necks.high > necks.low, 'the handle stays narrow longer than the tip');
assert.equal(pickGripEnd(necks.low, necks.high, true), 'high', 'the hilt wins even when the tip is nearer the hand');
assert.equal(pickGripEnd(0.2, 0.2, true), 'low', 'equal necks keep the end nearer the hand');
assert.equal(pickGripEnd(0.2, 0.2, false), 'high', 'equal necks keep the end nearer the hand');

function ctxAt(x: number, z: number) {
  const pos = new THREE.Vector3(x, 0, z);
  const ctx = {
    pos,
    radius: 0.45,
    yaw: () => 0,
    heightAt: () => 0,
    resolve(next: THREE.Vector3) {
      next.x = Math.max(-40, Math.min(40, next.x));
      next.z = Math.max(-40, Math.min(40, next.z));
    },
    blocked: (px: number) => px < -30 || px > 30,
  } as unknown as KitContext;
  return { pos, ctx };
}

const short = ctxAt(0, 8);
const from = leapAhead(short.ctx, 7.5);
assert.ok(from);
assert.equal(from?.z, 8);
assert.ok(short.pos.z > 13 && short.pos.z < 16.2, 'a short leap stays near the requested distance');

const blocked = ctxAt(-36, 8);
assert.equal(leapAhead(blocked.ctx, 7.5), null);
assert.equal(blocked.pos.x, -36, 'a blocked leap does not move her');

const far = ctxAt(0, 0);
const nyxFrom = transferAhead(far.ctx, 11, 18);
assert.ok(nyxFrom);
assert.ok(far.pos.z >= 11 && far.pos.z <= 18.2, 'a transfer lands in a different part of the arena');

const scene = new THREE.Scene();
const pos = new THREE.Vector3(0, 0, 4);
const nyxCtx = {
  pos,
  spec: { visual: { electricityColor: 0x3de7ff, auraColor: 0xb388ff }, moves: [] },
  particles: { emit() {} },
  camera: { addShake() {}, addKick() {} },
  scene,
  radius: 0.45,
  yaw: () => 0,
  time: () => 0,
  fighter: () => ({ humanoid: { handL: new THREE.Object3D(), group: new THREE.Group() } }),
  heightAt: () => 0,
  resolve() {},
  blocked: () => false,
  iframes() {},
  sound() {},
} as unknown as KitContext;
const nyx = new NyxKit();
nyx.attach(nyxCtx);
assert.equal(nyx.tryAirJump(0.2, 0.5), true);
assert.ok(pos.z > 12, 'Nyx leaves the spot she double jumped from');
assert.ok(scene.getObjectByName('NyxVortex'));
assert.equal(nyx.opacity, 0.04);
assert.equal(nyx.tryAirJump(1.2, 0.2), false);

console.log('air-jump checks passed');
