import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { KitContext, KitTarget } from './kit';
import { KidParanormalKit } from './kid-paranormal';
import { padHeight } from '../world-pad';

assert.equal(padHeight(0, 8), 0, 'Training P.A.D. spawn sits on the chamber floor');
assert.equal(padHeight(-8, -4), 0, 'the Beacon sits on the chamber floor');
assert.ok(padHeight(-17.4, 0) > 4, 'the west stair reaches the balcony');
assert.equal(padHeight(20, 0), 0, 'the east corridor stays open');
assert.equal(padHeight(0, 20), 4.4, 'the north balcony is the upper floor');

function body(x: number, z: number, hp = 80): KitTarget {
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
  };
}

const scene = new THREE.Scene();
const pos = new THREE.Vector3(0, 0, 0);
const near = body(0, 2.2);
const shock = body(4, 0);
const far = body(0, 12);
const targets = [near, shock, far];
const hurts: Array<{ hpBefore: number; damage: number }> = [];
let blocked = false;
let auraGain = 0;
const sounds: string[] = [];

const ctx = {
  pos,
  spec: {
    moves: [
      { id: 'phantomGrasp', auraCost: 16 },
      { id: 'paranormalProjection', auraCost: 14 },
      { id: 'dimensionalCollapse', auraCost: 22 },
    ],
  },
  particles: { emit() {} },
  camera: { addShake() {}, addKick() {} },
  cameraObject: new THREE.PerspectiveCamera(),
  power: { boost() {}, arcAt() {} },
  rings: { spawn() {} },
  cracks: { spawn() {} },
  afterimages: { spawn() {} },
  scene,
  radius: 0.45,
  yaw: () => 0,
  time: () => 0,
  fighter: () => ({ humanoid: { group: new THREE.Group(), handR: new THREE.Object3D() } }),
  targets: () => targets,
  hurt: (target: KitTarget, damage: number) => {
    hurts.push({ hpBefore: target.hp, damage });
    target.hp = Math.max(0, target.hp - damage);
    return damage;
  },
  flash() {},
  meleeDamage: () => 20,
  heightAt: () => 0,
  resolve() {},
  blocked: () => blocked,
  lookDir: (out: THREE.Vector3) => out.set(0, 0, 1),
  hitStop() {},
  iframes() {},
  strike() {},
  schedule() {},
  sound: (id: string) => sounds.push(id),
  turn() {},
  gainAura: (amount: number) => {
    auraGain += amount;
  },
  spendAura: () => 40,
  heal: () => 0,
  cooldown() {},
} as unknown as KitContext;

function step(kit: KidParanormalKit, seconds: number, extra: { aura?: number; stunned?: boolean } = {}) {
  const ticks = Math.ceil(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) {
    kit.update({
      dt: 0.05,
      time: i * 0.05,
      speed: 0,
      sprinting: false,
      moving: false,
      aura: extra.aura ?? 40,
      stunned: extra.stunned ?? false,
    });
  }
}

const kit = new KidParanormalKit();
kit.attach(ctx);

assert.equal(kit.tryAbility('phantomGrasp'), true);
near.hp = 0;
step(kit, 0.7);
assert.equal(kit.locked, false, 'grasp cancels when the target dies before the slam');
assert.equal(hurts.length, 0, 'a cancelled grasp deals no slam');
near.hp = 80;

hurts.length = 0;
assert.equal(kit.tryAbility('phantomGrasp'), true);
step(kit, 2.2);
assert.equal(kit.locked, false, 'grasp finishes');
assert.ok(hurts.some((hit) => hit.damage > 20), 'the slam damages the grabbed host');
assert.ok(hurts.some((hit) => hit.damage === 12), 'the shockwave hits a nearby host');
assert.equal(far.hp, 80, 'a host past grasp range is left alone');

kit.interrupt();
const before = scene.children.length;
assert.equal(kit.tryAbility('paranormalProjection'), true);
assert.equal(scene.children.length - before, 3, 'two attackers and one decoy');
blocked = true;
const stayX = pos.x;
const stayZ = pos.z;
assert.equal(kit.tryAbility('paranormalProjection'), true);
assert.equal(pos.x, stayX);
assert.equal(pos.z, stayZ);
assert.equal(auraGain, 14, 'a blocked swap returns the aura the engine already spent');
assert.ok(sounds.includes('kid.projection.blocked'));
blocked = false;
kit.interrupt();
assert.equal(scene.children.length, before, 'projections are removed');

for (let i = 0; i < 5; i += 1) kit.noteHit();
assert.equal(kit.resonance, 100);
assert.equal(kit.tryAbility('paranormalProjection'), true);
assert.equal(scene.children.length - before, 4, 'a charged projection adds one attacking copy');
assert.equal(kit.resonance, 0, 'the charge is spent');
kit.interrupt();

kit.onRound();
assert.equal(kit.resonance, 0);
for (let i = 0; i < 5; i += 1) kit.noteHit();
assert.equal(kit.tryAbility('dimensionalCollapse'), true);
const shell = scene.children.at(-1) as THREE.Group;
const geo = (shell.children[0] as THREE.Mesh).geometry as THREE.OctahedronGeometry;
assert.ok(Math.abs(geo.parameters.radius - 9.4 * 0.55) < 0.01, 'charged collapse uses the wider radius');
step(kit, 2.2);
assert.equal(kit.locked, false, 'collapse ends');
assert.equal(kit.flying, false);

assert.equal(kit.tryAirJump(0.2), true);
assert.equal(kit.flying, true);
assert.equal(kit.airY, 1.45);
step(kit, 0.2, { aura: 0 });
assert.equal(kit.flying, false, 'hover ends when aura is gone');
assert.equal(kit.airY, 0);

console.log('kid-paranormal.check ok');
