import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RYDERZ, fighterKind } from '../config';
import { abilityLockout } from '../power-outage';
import { applyReaction } from '../combat';
import { combatProfileFor } from '../fighter/profiles';
import { aiProfileFor } from '../pvp/aiProfile';
import type { KitContext, KitTarget } from './kit';
import { TjKit } from './tj';
import {
  applySway,
  boostNearbyRiot,
  influenceRank,
  isProvoked,
  pickRival,
  provoke,
  ringmasterHolds,
  swayCandidates,
  swayOf,
  swaySeconds,
} from './tj-influence';

const spec = RYDERZ.tj;
assert.equal(spec.name, 'TJ');
assert.equal(spec.title, 'The Ringmaster of Death');
assert.equal(fighterKind(spec), 'Controller');
assert.equal(spec.glb, '/assets/those-ryderz/models/tj.glb?v=1');
assert.deepEqual(spec.moves.map((move) => move.id), ['deathStrike', 'mindControl', 'riot']);
assert.equal(spec.moves.every((move) => move.drain === 0), true);
assert.equal(abilityLockout(8), 0, 'an 8 second request is not a cooldown');
assert.equal(abilityLockout(25), 0);
assert.equal(abilityLockout(60), 0);
assert.equal(combatProfileFor('tj').powerLink.abilityId, 'deathStrike');
assert.ok(aiProfileFor('tj').abilityFrequency > 0.7);

const bytes = readFileSync(new URL('../../../public/assets/those-ryderz/models/tj.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.slice(20, 20 + jsonLength).toString('utf8')) as {
  nodes?: Array<{ name?: string }>;
  animations?: Array<{ name?: string }>;
};
const bones = new Set((source.nodes ?? []).map((node) => node.name));
assert.ok(bones.has('mixamorig:Hips') && bones.has('mixamorig:LeftArm') && bones.has('mixamorig:RightHand'));
const clips = (source.animations ?? []).map((clip) => clip.name ?? '');
assert.ok(clips.some((name) => /shooting from two pistols/i.test(name)));
assert.ok(clips.some((name) => /blowing arms back/i.test(name)));

const civilian = { hp: 40, tier: 1, ally: false, duelist: false, pos: { x: 2, z: 1 } };
const elite = { hp: 80, tier: 4, pos: { x: 4, z: 0 } };
const boss = { hp: 400, tier: 6, pos: { x: 3, z: 1 } };
const adept = { hp: 90, tier: 5, pos: { x: 1, z: 2 } };
const ryder = { hp: 100, tier: 1, duelist: true, pos: { x: 1, z: 1 } };
const ally = { hp: 100, ally: true, tier: 1, pos: { x: 0.5, z: 0.5 } };
assert.equal(influenceRank(civilian), 'open');
assert.equal(influenceRank(elite), 'elite');
assert.equal(influenceRank(boss), 'immune');
assert.equal(influenceRank(adept), 'immune');
assert.equal(influenceRank(ryder), 'immune');
assert.equal(swaySeconds('control', 'open'), 15);
assert.equal(swaySeconds('riot', 'elite'), 3.5);
assert.equal(swaySeconds('control', 'immune'), 0);
assert.equal(ringmasterHolds(civilian), true);
assert.equal(ringmasterHolds(elite), false);
assert.equal(ringmasterHolds(boss), false);
provoke(civilian);
assert.equal(isProvoked(civilian), true);
assert.equal(ringmasterHolds(civilian), false, 'a civilian TJ shot will fight back');

const crowd = [
  civilian,
  { hp: 30, tier: 1, pos: { x: 6, z: 0 } },
  { hp: 30, tier: 2, pos: { x: 20, z: 0 } },
  elite,
  boss,
  ally,
  { hp: 0, tier: 1, pos: { x: 1, z: 0 } },
];
const controlled = swayCandidates(crowd, { x: 0, z: 0 }, 15, 8, 'control');
assert.equal(controlled.length, 3, 'mind control takes civilians and a shortened elite inside 15 metres');
assert.equal(controlled.includes(elite), true);
assert.equal(swaySeconds('control', influenceRank(elite)) < 15, true);
assert.equal(controlled.some((body) => body === boss), false);
assert.equal(controlled.some((body) => body === ally), false);
assert.ok(applySway(controlled[0], 'control', 0, 15));
assert.equal(swayOf(controlled[0], 10)?.mode, 'control');
applySway(controlled[0], 'control', 10, 15);
assert.equal(swayOf(controlled[0], 10)?.until, 25, 'a recast refreshes the same mark');
assert.equal(swayOf(controlled[0], 25), null);

const a = { hp: 20, pos: { x: 0, z: 0 } };
const near = { hp: 20, pos: { x: 2, z: 0 } };
const far = { hp: 20, pos: { x: 9, z: 0 } };
assert.equal(pickRival(a, [a, near, far, ally]), near);
applySway(near, 'riot', 0, 10);
applySway(far, 'riot', 0, 10);
a.hp = 0;
assert.equal(boostNearbyRiot(a, [a, near, far], 1), 1);
assert.ok((swayOf(near, 1)?.haste ?? 0) > 0.4);
assert.equal(swayOf(far, 1)?.haste ?? 0, 0, 'a body outside the chain stays at its own pace');

function body(x: number, z: number, hp = 80): KitTarget & { pos: THREE.Vector3; tier?: number; ally?: boolean } {
  return {
    hp,
    maxHp: hp,
    hit: 0,
    hitColor: 0xffffff,
    pos: new THREE.Vector3(x, 0, z),
    radius: 0.5,
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
    tier: 1,
  };
}

const pos = new THREE.Vector3();
const scene = new THREE.Scene();
const ahead = body(0, 8);
const beside = body(2, 6);
const behind = body(0, -6);
const bossBody = body(4, 4, 400);
bossBody.tier = 6;
const friend = body(1, 1, 100);
friend.ally = true;
let targets: Array<KitTarget & { tier?: number; ally?: boolean; duelist?: boolean }> = [ahead, beside, behind, bossBody, friend];
const cooldowns: string[] = [];
let now = 0;
const ctx = {
  pos,
  spec,
  particles: { emit() {} },
  camera: {},
  cameraObject: new THREE.PerspectiveCamera(),
  power: {},
  rings: { spawn() {} },
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
  spendAura: () => 0,
  heal: () => 0,
  cooldown: (id: string) => cooldowns.push(id),
  canHit: (target: KitTarget) => target !== friend && target.hp > 0,
} as unknown as KitContext;

const kit = new TjKit();
kit.attach(ctx);
assert.equal(kit.tryAbility('deathStrike'), true);
assert.equal(cooldowns.length, 0, 'Death Strike does not start a cooldown');
for (let i = 0; i < 40; i += 1) {
  now += 0.05;
  kit.update({ dt: 0.05, time: now, speed: 0, sprinting: false, moving: false });
}
assert.ok(ahead.hp < 80, 'the barrage damages a body in front');
assert.ok(beside.hp < 80, 'the cone catches a second body');
assert.equal(behind.hp, 80, 'shots do not travel behind TJ');
assert.equal(friend.hp, 100);
const afterStrike = cooldowns.length;
kit.update({ dt: 0.05, time: now, speed: 0, sprinting: false, moving: false, powersDown: true });
assert.equal(cooldowns.length, afterStrike, 'a blackout is not a cooldown');
assert.equal(kit.busy, false);

const fresh = [body(3, 2), body(8, 1), body(14, 0), body(30, 0), body(2, 2, 200)];
fresh[4].tier = 6;
targets = fresh;
const controlKit = new TjKit();
controlKit.attach(ctx);
assert.equal(controlKit.tryAbility('mindControl'), true);
assert.equal(swayOf(fresh[0], now)?.mode, 'control');
assert.equal(swayOf(fresh[1], now)?.mode, 'control');
assert.equal(swayOf(fresh[2], now)?.until, now + 15);
assert.equal(swayOf(fresh[3], now), null, 'past 15 metres stays free');
assert.equal(swayOf(fresh[4], now), null, 'a boss is not mind controlled');
const until = swayOf(fresh[0], now)?.until ?? 0;
now += 4;
controlKit.tryAbility('mindControl');
assert.ok((swayOf(fresh[0], now)?.until ?? 0) >= until, 'recasting refreshes the hold');
assert.equal(cooldowns.length, afterStrike);

targets = [body(4, 3), body(10, 8), body(2, 18)];
const riotKit = new TjKit();
riotKit.attach(ctx);
assert.equal(riotKit.tryAbility('riot'), true);
for (let i = 0; i < 30; i += 1) {
  now += 0.05;
  riotKit.update({ dt: 0.05, time: now, speed: 0, sprinting: false, moving: false });
}
assert.equal(swayOf(targets[0], now)?.mode, 'riot');
assert.equal(swayOf(targets[1], now)?.mode, 'riot');
assert.ok(targets[0].hp < 80, 'the bullet storm deals damage before the frenzy');
assert.equal(cooldowns.length, afterStrike, 'RIOT! does not start a cooldown');

console.log('tj ringmaster ok');
