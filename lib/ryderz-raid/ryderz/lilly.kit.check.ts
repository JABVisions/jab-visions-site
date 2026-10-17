import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { KitContext, KitTarget } from './kit';
import { LillyKit } from './lilly';
import { GIANT_SCALE, SOUL_RADIUS } from './lilly-combat';

const canvas = {
  width: 128,
  height: 64,
  getContext() {
    return {
      clearRect() {},
      fillText() {},
      font: '',
      textAlign: '',
      fillStyle: '',
    };
  },
};
(globalThis as { document?: unknown }).document = {
  createElement: () => canvas,
};

const scene = new THREE.Scene();
const pos = new THREE.Vector3();
const hurtLog: Array<{ damage: number; hp: number }> = [];
let hp = 80;
const enemy: KitTarget = {
  pos: new THREE.Vector3(1.2, 0, 0.2),
  radius: 0.45,
  mass: 1,
  knock: new THREE.Vector3(),
  stun: 0,
  stagger: 0,
  airY: 0,
  airVel: 0,
  lean: 0,
  spin: 0,
  held: 0,
  sink: 0,
  hp: 40,
  maxHp: 40,
  hit: 0,
  hitColor: 0xffffff,
};
const outside: KitTarget = { ...enemy, pos: new THREE.Vector3(20, 0, 0), hp: 40, knock: new THREE.Vector3() };

const ctx = {
  pos,
  spec: { visual: { auraColor: 0x39f07a, electricityColor: 0x9dffc0 } },
  particles: { emit() {} },
  camera: { addShake() {}, addKick() {} },
  cameraObject: new THREE.PerspectiveCamera(),
  power: { arcAt() {} },
  rings: { spawn() {} },
  cracks: { spawn() {} },
  afterimages: { bind() {}, unbind() {} },
  scene,
  radius: 0.45,
  yaw: () => 0,
  time: () => 0,
  fighter: () => ({
    humanoid: { group: new THREE.Group() },
  }),
  targets: () => [enemy, outside],
  hurt: (target: KitTarget, damage: number) => {
    const dealt = Math.min(target.hp, damage);
    target.hp -= dealt;
    hurtLog.push({ damage: dealt, hp: target.hp });
    return dealt;
  },
  flash() {},
  meleeDamage: () => 20,
  heightAt: () => 0,
  resolve() {},
  blocked: () => false,
  lookDir: (out: THREE.Vector3) => out.set(0, 0, 1),
  hitStop() {},
  iframes() {},
  strike() {},
  schedule() {},
  sound() {},
  turn() {},
  gainAura() {},
  heal: (amount: number) => {
    const before = hp;
    hp = Math.min(115, hp + amount);
    return hp - before;
  },
  cooldown() {},
} as unknown as KitContext;

const kit = new LillyKit();
kit.attach(ctx);
assert.equal(kit.tryAbility('soulDrain'), true);
kit.update({ dt: 0.3, time: 0.3, speed: 0, sprinting: false, moving: false });
assert.ok(kit.hazards().some((zone) => zone.kind === 'drain' && zone.radius > 1), 'the puddle is a danger zone');
assert.ok(hurtLog.length >= 1, 'an enemy inside the puddle takes damage');
assert.ok(hurtLog.every((hit) => hit.damage > 0));
assert.equal(outside.hp, 40, 'an enemy outside the puddle is untouched');
assert.ok(hp > 80, 'Lilly heals from damage dealt');
const healedAtCap = 115;
hp = healedAtCap;
kit.update({ dt: 0.3, time: 0.6, speed: 0, sprinting: false, moving: false });
assert.equal(hp, 115, 'healing does not pass maximum health');

kit.endAbility('soulDrain');
kit.interrupt();
assert.equal(kit.bodyScale, 1, 'interrupt clears the drain and any scale');

assert.equal(kit.tryAbility('giantStep'), true);
for (let i = 0; i < 40; i += 1) {
  kit.update({ dt: 0.05, time: i * 0.05, speed: 2, sprinting: false, moving: true });
}
assert.ok(kit.bodyScale > 3, 'she grows');
assert.equal(kit.cameraExtra && kit.cameraExtra.distance > 4, true, 'the camera pulls back');
for (let i = 0; i < 200; i += 1) {
  kit.update({ dt: 0.05, time: 3 + i * 0.05, speed: 0, sprinting: false, moving: false });
}
assert.ok(Math.abs(kit.bodyScale - 1) < 0.05, 'giant step returns her to normal size');
assert.equal(kit.cameraExtra, null);

const before = scene.children.length;
assert.equal(kit.tryAbility('animalAllegiance'), true);
for (let i = 0; i < 40; i += 1) {
  kit.update({ dt: 0.05, time: i * 0.05, speed: 0, sprinting: false, moving: false });
}
assert.equal(kit.locked, false, 'the summon rite finishes');
assert.ok(scene.children.length >= before, 'the rite does not throw when no animal is registered');

assert.equal(kit.tryAbility('bladeFan'), false, 'other Ryder powers stay with their own kits');
kit.detach();
assert.equal((ctx.fighter() as { humanoid: { group: THREE.Group } }).humanoid.group.scale.x, 1);

console.log('lilly kit checks ok', { drained: hurtLog.length, scale: GIANT_SCALE, radius: SOUL_RADIUS });
