import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ComboManager } from '../fighter/combo';
import { SHARED_COMBOS } from '../fighter/combo';
import { combatProfileFor } from '../fighter/profiles';
import { ProceduralSkeleton, assessSkinning, extractStrikes } from '../skeletal';
import type { KitContext, KitTarget } from './kit';
import { NyxKit } from './nyx';

function body(x: number, z: number, hp = 80, speed = 6): KitTarget & { speed: number; attackScale?: number } {
  return {
    pos: new THREE.Vector3(x, 0, z),
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
    hp,
    maxHp: 100,
    hit: 0,
    hitColor: 0xffffff,
    speed,
  };
}

const scene = new THREE.Scene();
const pos = new THREE.Vector3(0, 0, 0);
const hand = new THREE.Object3D();
const gains: number[] = [];
const cooldowns: string[] = [];
let now = 0;
let hp = 100;
let maxHp = 100;
let pvp = false;
let healed = 0;
let blockX = -1;
const wall = { z0: 9, z1: 11 };

const goods = [3, 4, 5, 6, 7, 8].map((z) => body(0, z));
const walled = body(0, 14);
const behind = body(0, -4);
const wide = body(12, 2);
const already = body(0.8, 3.2);
already.held = 1;
const targets = [...goods, walled, behind, wide, already];

const ctx = {
  pos,
  spec: {
    moves: [
      { id: 'temporalZap', auraCost: 16 },
      { id: 'rewindProtocol', auraCost: 12 },
      { id: 'zeroHour', auraCost: 18 },
    ],
  },
  particles: { emit() {} },
  camera: { addShake() {}, addKick() {} },
  cameraObject: new THREE.PerspectiveCamera(),
  power: {},
  rings: { spawn() {} },
  cracks: { spawn() {} },
  afterimages: { spawn() {} },
  scene,
  radius: 0.45,
  yaw: () => 0,
  time: () => now,
  fighter: () => ({ humanoid: { group: new THREE.Group(), handL: hand, handR: new THREE.Object3D() } }),
  targets: () => targets,
  hurt: (target: KitTarget, damage: number) => {
    const before = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    return before - target.hp;
  },
  flash() {},
  meleeDamage: () => 17,
  heightAt: () => 0,
  resolve(next: THREE.Vector3) {
    if (next.x < 0) next.x = 0;
  },
  blocked: (x: number, z: number) => (z > wall.z0 && z < wall.z1) || x < blockX,
  lookDir: (out: THREE.Vector3) => out.set(0, 0, 1),
  hitStop() {},
  iframes() {},
  strike() {},
  schedule() {},
  sound() {},
  turn() {},
  gainAura: (amount: number) => gains.push(amount),
  spendAura: () => 0,
  heal: (amount: number) => {
    const before = hp;
    hp = Math.min(maxHp, hp + Math.max(0, amount));
    healed += hp - before;
    return hp - before;
  },
  cooldown: (id: string) => cooldowns.push(id),
  vitals: () => ({ hp, maxHp }),
  hold: (target: KitTarget, seconds: number) => {
    target.held = Math.max(0, seconds);
  },
  pvp: () => pvp,
  suppress() {},
  canHit: (target: KitTarget) => target.hp > 0,
} as unknown as KitContext;

const kit = new NyxKit();
kit.attach(ctx);
assert.ok(hand.children.some((child) => child.name === 'NyxWristGuard'));
assert.equal(scene.getObjectByName('NyxBlade'), undefined);

function step(dt = 0.05) {
  now += dt;
  kit.update({ dt, time: now, speed: 0, sprinting: false, moving: false });
}

assert.equal(kit.tryAbility('temporalZap'), true);
for (let i = 0; i < 4; i += 1) step(0.05);
assert.ok(goods.every((target) => target.held === 0), 'the charge is a telegraph, not a lock');
for (let i = 0; i < 6; i += 1) step(0.05);
const cased = goods.filter((target) => target.held > 2);
assert.equal(cased.length, 5, 'Temporal Zap locks at most five enemies');
assert.equal(goods[5].held, 0, 'the sixth enemy in the cone is left out');
assert.equal(walled.held, 0, 'a wall blocks the beam');
assert.equal(behind.held, 0, 'enemies behind her are ignored');
assert.equal(wide.held, 0, 'enemies outside the cone are ignored');
assert.equal(already.held, 1, 'an enemy already cased is not captured again');
assert.ok(cased.every((target) => target.hp === 71), 'each lock deals 9 damage');
assert.ok(cooldowns.includes('temporalZap'));
assert.ok(scene.getObjectByName('NyxStasis'));
assert.ok(scene.getObjectByName('NyxBeam'));

const holdStarted = now;
while (goods[0].held > 0 && now - holdStarted < 6) step(0.05);
const heldFor = now - holdStarted;
assert.ok(heldFor > 3.6 && heldFor < 4.4, `PvE stasis lasts about 4s, saw ${heldFor.toFixed(2)}`);
assert.equal(goods[0].held, 0);
step(0.05);
assert.equal(kit.tryAbility('temporalZap'), true);
for (let i = 0; i < 12; i += 1) step(0.05);
assert.equal(goods[0].held, 0, 'immunity stops an immediate recapture');

kit.onRound();
pvp = true;
const rival = body(0, 4, 80);
targets.splice(0, targets.length, rival);
cooldowns.length = 0;
assert.equal(kit.tryAbility('temporalZap'), true);
for (let i = 0; i < 12; i += 1) step(0.05);
assert.ok(rival.held > 1 && rival.held <= 1.5, `PvP stasis starts near 1.5s, saw ${rival.held}`);
const pvpStart = now;
while (rival.held > 0 && now - pvpStart < 3) step(0.05);
const pvpHeld = now - pvpStart;
assert.ok(pvpHeld > 1.2 && pvpHeld < 1.8, `PvP stasis ends near 1.5s, saw ${pvpHeld.toFixed(2)}`);

kit.onRound();
pvp = false;
gains.length = 0;
cooldowns.length = 0;
const nobody = body(0, -6);
targets.splice(0, targets.length, nobody);
assert.equal(kit.tryAbility('temporalZap'), true);
for (let i = 0; i < 12; i += 1) step(0.05);
assert.equal(nobody.held, 0);
assert.ok(gains.includes(16), 'a zap that hits nobody refunds its aura');
assert.equal(cooldowns.length, 0, 'a miss does not start the cooldown');

kit.onRound();
cooldowns.length = 0;
gains.length = 0;
hp = 100;
pos.set(0, 0, 0);
for (let i = 0; i < 24; i += 1) {
  pos.set(i * 0.2, 0, 0);
  step(0.08);
}
const before = pos.x;
hp = 40;
healed = 0;
blockX = 0.5;
assert.equal(kit.tryAbility('rewindProtocol'), true);
for (let i = 0; i < 10; i += 1) step(0.05);
assert.ok(pos.x < before - 0.5, 'rewind moves her back along the trail');
assert.ok(pos.x >= 0.5, 'rewind stays out of the blocked cells');
assert.equal(hp, 64, 'health restore is capped at 24');
assert.ok(hp <= maxHp);
assert.ok(scene.getObjectByName('NyxDecoy'));
const afterFirst = hp;
assert.equal(kit.tryAbility('rewindProtocol'), true);
for (let i = 0; i < 10; i += 1) step(0.05);
assert.equal(hp, afterFirst, 'a second rewind does not restore the same loss again');

kit.onRound();
gains.length = 0;
pos.set(2, 0, 2);
for (let i = 0; i < 8; i += 1) step(0.08);
const stuck = pos.clone();
wall.z0 = -100;
wall.z1 = 100;
assert.equal(kit.tryAbility('rewindProtocol'), true);
assert.ok(gains.includes(12), 'rewind refunds when every past cell is blocked');
assert.equal(pos.x, stuck.x);
assert.equal(pos.z, stuck.z);
wall.z0 = 9;
wall.z1 = 11;

kit.onRound();
const crowd = body(1, 1, 80, 6);
targets.splice(0, targets.length, crowd);
const clockBefore = now;
assert.equal(kit.tryAbility('zeroHour'), true);
for (let i = 0; i < 6; i += 1) step(0.05);
assert.equal(crowd.speed, 6, 'the warning rings do not slow anyone yet');
for (let i = 0; i < 4; i += 1) step(0.05);
assert.ok(Math.abs(crowd.speed - 2.7) < 0.05, `field slows to 45%, saw ${crowd.speed}`);
assert.ok(Math.abs((crowd.attackScale ?? 1) - 0.45) < 0.05);
gains.length = 0;
assert.equal(kit.tryAbility('zeroHour'), true);
assert.ok(gains.includes(18), 'a second Zero Hour refunds instead of stacking');
assert.ok(Math.abs(crowd.speed - 2.7) < 0.05);
const fieldStart = now;
while (crowd.speed < 5 && now - fieldStart < 5) step(0.05);
assert.equal(crowd.speed, 6, 'speed is restored when the field ends');
assert.equal(crowd.attackScale, undefined);
const elapsed = now - clockBefore;
assert.ok(elapsed > 3 && elapsed < 5, 'the field uses the step clock and does not scale it');
assert.ok(crowd.hp < 80, 'the closing burst deals damage');

kit.onRound();
for (let i = 0; i < 8; i += 1) kit.noteHit();
assert.equal(kit.resonance, 100);
const boosted = body(0, 3, 80);
targets.splice(0, targets.length, boosted);
assert.equal(kit.tryAbility('temporalZap'), true);
for (let i = 0; i < 12; i += 1) step(0.05);
assert.equal(boosted.hp, 67, 'overdrive adds 4 damage to the zap');
assert.equal(kit.resonance, 0, 'overdrive spends the meter');
kit.noteHit();
assert.equal(kit.resonance, 0, 'hits during overdrive do not refill the meter');

const chain = new ComboManager();
chain.setRecipes(combatProfileFor('agent-nyx').combos);
const mark = {};
chain.land('kick', 1, mark);
chain.land('kick', 1.2, mark);
assert.equal(chain.land('melee', 1.4, mark).label, 'Temporal Sweep');
const plain = new ComboManager();
plain.setRecipes(SHARED_COMBOS);
const other = {};
plain.land('punch', 1, other);
assert.equal(plain.land('punch', 1.2, other).label, '2 HIT COMBO');
assert.deepEqual(combatProfileFor('agent-nyx').punchCycle, ['punch', 'punchR', 'chop', 'smash']);

const bytes = readFileSync(new URL('../../../public/assets/those-ryderz/models/agent-nyx.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.slice(20, 20 + jsonLength).toString('utf8')) as {
  materials?: Array<{ normalTexture?: unknown; pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown } }>;
  images?: unknown[];
  textures?: unknown[];
};
for (const material of source.materials ?? []) {
  delete material.normalTexture;
  if (material.pbrMetallicRoughness) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  }
}
source.images = [];
source.textures = [];
const jsonChunk = Buffer.from(JSON.stringify(source));
const jsonPad = Buffer.alloc((4 - (jsonChunk.length % 4)) % 4, 0x20);
const binStart = 20 + jsonLength;
const binLength = bytes.readUInt32LE(binStart);
const bin = bytes.slice(binStart + 8, binStart + 8 + binLength);
const header = Buffer.alloc(12);
const jsonHeader = Buffer.alloc(8);
const binHeader = Buffer.alloc(8);
const total = 12 + 8 + jsonChunk.length + jsonPad.length + 8 + bin.length;
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(total, 8);
jsonHeader.writeUInt32LE(jsonChunk.length + jsonPad.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(bin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const stripped = Buffer.concat([header, jsonHeader, jsonChunk, jsonPad, binHeader, bin]);
const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
  new GLTFLoader().parse(stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength), '', resolve, reject);
});
const figure = gltf.scene;
const skin = assessSkinning(figure);
assert.deepEqual(skin, [], `skinning should stay on the skeleton, saw ${skin.join(', ')}`);
const skeleton = new ProceduralSkeleton(figure);
assert.equal(skeleton.isUsable, true, 'the supplied skeleton maps to a humanoid');
assert.ok(skeleton.bone('lowerArmL'), 'left forearm bone is mapped for the wrist guard');
assert.ok(skeleton.bone('handL'));
assert.ok(skeleton.bone('handR'));
assert.equal(extractStrikes(figure, gltf.animations).length, 0, 'angry, dive, and agree are not fake punches');
kit.detach();
console.log('nyx checks passed');
