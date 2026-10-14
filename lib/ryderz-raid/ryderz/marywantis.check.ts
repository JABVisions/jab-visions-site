import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RYDERZ } from '../config';
import { applyReaction } from '../combat';
import { combatProfileFor } from '../fighter/profiles';
import { aiProfileFor } from '../pvp/aiProfile';
import { choosePvpAction } from '../pvp/decide';
import type { KitContext, KitTarget } from './kit';
import { FINISHER_DAMAGE, MERCY_CAP, MarywantisKit, POOL_RADIUS, tideBoss } from './marywantis';

function body(x: number, z: number, hp = 200, extra: { kind?: string; tier?: number } = {}): KitTarget & { kind?: string; tier?: number } {
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
    maxHp: hp,
    hit: 0,
    hitColor: 0xffffff,
    ...extra,
  };
}

const scene = new THREE.Scene();
const pos = new THREE.Vector3();
const friend = body(0, 1.3);
const pack = [body(0, 1.35), body(1.05, 1.45), body(-1.1, 1.5), body(0, 14)];
const boss = body(2.4, 1.15, 400, { kind: 'broadcaster' });
const far = body(0, 4.4, 80);
const walled = body(0, 5, 160);
const tideBossBody = body(2.2, 4.2, 400, { tier: 5 });
let targets: KitTarget[] = [];
let blockedZ = -999;
const rings: number[] = [];
const cooldowns: string[] = [];
let now = 0;

const ctx = {
  pos,
  spec: RYDERZ.marywantis,
  particles: { emit() {} },
  camera: { addShake() {}, addKick() {} },
  cameraObject: new THREE.PerspectiveCamera(),
  power: {},
  rings: {
    spawn(_at: THREE.Vector3, _color: number, options?: { radius?: number }) {
      rings.push(options?.radius ?? 0);
    },
  },
  cracks: { spawn() {} },
  afterimages: { spawn() {} },
  scene,
  radius: 0.45,
  yaw: () => 0,
  time: () => now,
  fighter: () => null,
  targets: () => targets,
  hurt: (target: KitTarget, damage: number, dir: THREE.Vector3, reaction?: 'stagger' | 'knockback', strength = 1) => {
    const before = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    if (reaction) applyReaction(target, reaction, dir, strength);
    return before - target.hp;
  },
  flash() {},
  meleeDamage: () => 20,
  heightAt: () => 0,
  resolve(next: THREE.Vector3) {
    next.x = Math.max(-20, Math.min(20, next.x));
    next.z = Math.max(-20, Math.min(20, next.z));
  },
  blocked: (_x: number, z: number) => z < blockedZ,
  lookDir: (out: THREE.Vector3) => out.set(0, 0, 1),
  hitStop() {},
  iframes() {},
  strike() {},
  schedule() {},
  sound() {},
  turn() {},
  gainAura() {},
  spendAura: () => 0,
  heal: () => 0,
  cooldown: (id: string) => cooldowns.push(id),
  hold: (target: KitTarget, seconds: number) => {
    target.held = Math.max(0, seconds);
    if (seconds > 0) target.knock.set(0, 0, 0);
  },
  pvp: () => false,
  canHit: (target: KitTarget) => target !== friend && target.hp > 0,
} as unknown as KitContext;

const spec = RYDERZ.marywantis;
assert.equal(spec.name, 'Marywantis');
assert.equal(spec.glb, '/assets/those-ryderz/models/marywantis.glb?v=1');
assert.deepEqual(spec.moves.map((move) => move.id), ['callMercy', 'finKick', 'wavePool']);
assert.equal(spec.visual.auraStyle, 'sparkle');
assert.equal(combatProfileFor('marywantis').powerLink.abilityId, 'finKick');
assert.ok(aiProfileFor('marywantis').abilityFrequency > 0.7);
assert.equal(tideBoss(boss), true);
assert.equal(tideBoss({ tier: 5 }), true);
assert.equal(tideBoss({ kind: 'heavy' }), false);

const bytes = readFileSync(new URL('../../../public/assets/those-ryderz/models/marywantis.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.slice(20, 20 + jsonLength).toString('utf8')) as {
  nodes?: Array<{ name?: string }>;
  animations?: Array<{ name?: string }>;
};
const bones = new Set((source.nodes ?? []).map((node) => node.name));
assert.ok(bones.has('Hips') && bones.has('Left_UpperArm') && bones.has('Right_Hand'));
const clips = (source.animations ?? []).map((clip) => clip.name ?? '');
assert.ok(clips.some((name) => /cartwheel/i.test(name)));
assert.ok(clips.some((name) => /swim/i.test(name)));
assert.ok(clips.some((name) => /conjuring/i.test(name)));

const kit = new MarywantisKit();
kit.attach(ctx);
assert.ok(scene.getObjectByName('TideOrbit'));

function step(dt = 0.05, moving = false, boost = false) {
  now += dt;
  kit.update({ dt, time: now, speed: moving ? 4 : 0, sprinting: boost, moving, boost });
}

targets = [...pack, boss, friend];
assert.equal(kit.tryAbility('callMercy'), true);
assert.ok(cooldowns.includes('callMercy'));
assert.ok(scene.getObjectByName('Mercy'));
for (let i = 0; i < 40; i += 1) step(0.05);
const caged = pack.filter((target) => target.held > 0);
assert.equal(caged.length, MERCY_CAP, 'Mercy cages three, not the whole pack');
assert.equal(pack.filter((target) => target.held === 0).length, 1);
assert.equal(boss.held, 0, 'a broadcaster is not imprisoned');
assert.ok(boss.hp < 400, 'a boss still takes a splash');
assert.equal(friend.hp, 200, 'allies are not drowned');
const drowned = caged[0].hp;
assert.ok(drowned < 200 && drowned > 170, `drowning is a trickle, saw ${200 - drowned}`);
assert.equal(scene.getObjectByName('WaterPrison') !== undefined, true);

let guard = 0;
while (scene.getObjectByName('Mercy') && guard < 400) {
  step(0.1);
  guard += 1;
}
assert.equal(scene.getObjectByName('Mercy'), undefined);
assert.ok(caged.every((target) => target.held === 0 && target.sink === 0));
assert.ok(caged.every((target) => target.hp > 0), 'the prison does not delete a healthy fighter in one hit');

kit.interrupt();
pos.set(0, 0, 0);
targets = [pack[0], far];
const closeBefore = pack[0].hp;
const farBefore = far.hp;
assert.equal(kit.tryAbility('finKick'), true);
assert.equal(kit.busy, true);
assert.equal(kit.steerWhileBusy, true);
for (let i = 0; i < 30; i += 1) step(0.05, true);
assert.ok(closeBefore - pack[0].hp >= 21, 'the cartwheel lands several hits');
assert.equal(farBefore - far.hp, FINISHER_DAMAGE, 'the crescent reaches past the cartwheel');
assert.equal(kit.busy, false);

kit.interrupt();
blockedZ = 3;
pos.set(0, 0, 0);
walled.pos.set(0, 0, 5);
walled.hp = 160;
walled.sink = 0;
walled.held = 0;
tideBossBody.pos.set(2.2, 0, 4.2);
tideBossBody.sink = 0;
tideBossBody.held = 0;
targets = [walled, tideBossBody, friend];
assert.equal(kit.tryAbility('wavePool'), true);
assert.ok(scene.getObjectByName('WavePool'));
for (let i = 0; i < 24; i += 1) step(0.05);
assert.ok(walled.pos.z < 5, 'the pool pulls');
assert.ok(walled.pos.z >= 3 - 0.02, `the current stops at a wall, saw z ${walled.pos.z}`);
assert.ok(Math.abs(walled.pos.x) <= 20 && Math.abs(walled.pos.z) <= 20);
assert.equal(tideBossBody.held, 0);
assert.equal(tideBossBody.sink, 0, 'bosses are not lifted');
assert.ok(walled.sink < 0, 'everyone else is lifted in the spiral');
assert.equal(friend.hp, 200);
const poolGuard = { n: 0 };
while (scene.getObjectByName('WavePool') && poolGuard.n < 200) {
  step(0.1);
  poolGuard.n += 1;
}
assert.equal(scene.getObjectByName('WavePool'), undefined);
assert.equal(walled.sink, 0);
assert.equal(walled.held, 0);
assert.ok(walled.knock.length() > 2, 'the collapse shoves outward');
assert.ok(Math.abs(walled.pos.x) <= 20 && Math.abs(walled.pos.z) <= 20);
assert.ok(POOL_RADIUS > 4);

blockedZ = -999;
kit.interrupt();
const prints = rings.length;
step(0.05, true, true);
step(0.3, true, true);
assert.ok(kit.airY > 0.2);
assert.ok((kit.moveScale ?? 1) > 1);
assert.equal(kit.pose?.kind, 'ride');
assert.equal(scene.getObjectByName('SurfWave')?.visible, true);
assert.ok(rings.length > prints, 'surfing leaves wet prints');
step(0.05, false, false);
assert.equal(kit.airY, 0);

const choice = choosePvpAction(
  {
    dist: 6,
    selfHp: 0.9,
    foeHp: 0.9,
    aura: 1,
    burnout: false,
    foeAttacking: false,
    foeRetreating: false,
    foeClosing: false,
    pack: 3,
    slots: [
      { band: 'defensive', affordable: true, cooling: false, ultimate: false, active: false },
      { band: 'movement', affordable: true, cooling: false, ultimate: false, active: false },
      { band: 'mid', affordable: true, cooling: false, ultimate: true, active: false },
    ],
  },
  aiProfileFor('marywantis'),
  { reactionMin: 0.2, reactionMax: 0.4, prediction: 0.5, mistake: 0 },
  () => 0.99,
);
assert.equal(choice.intent, 'ability');
assert.equal(choice.slot, 2, 'a grouped pack is a wave pool');

console.log('marywantis ok');
