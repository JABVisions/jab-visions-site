import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RYDERZ } from '../config';
import type { KitContext, KitTarget } from '../ryderz/kit';
import { ABRACADABRA, LETS_BE_BAD, MarilynKit, SHOWTIME } from './marilyn';
import { DREAM_VISION, FREE_AT_LAST, MartinKit, PROCLAIM_PEACE } from './martin';
import type { CrowdBody } from './fx';

function foe(x: number, z: number, hp = 80, kind?: string): CrowdBody {
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
    kind,
  };
}

function harness(targets: CrowdBody[], blocked?: (x: number, z: number) => boolean, startHp = 40) {
  const scene = new THREE.Scene();
  const pos = new THREE.Vector3();
  const hurts: { target: KitTarget; damage: number }[] = [];
  const blessings: number[] = [];
  const holds: number[] = [];
  let hp = startHp;
  const ctx = {
    pos,
    spec: RYDERZ['marilyn-monroe'],
    particles: { emit() {} },
    camera: { addKick() {}, addShake() {}, addFovPunch() {} },
    cameraObject: new THREE.PerspectiveCamera(),
    power: {},
    rings: {},
    cracks: {},
    afterimages: { spawn() {} },
    scene,
    radius: 0.45,
    yaw: () => 0,
    time: () => 0,
    fighter: () => null,
    targets: () => targets,
    hurt: (target: KitTarget, damage: number) => {
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      hurts.push({ target, damage });
      return Math.max(0, before - target.hp);
    },
    flash() {},
    meleeDamage: () => 10,
    heightAt: () => 0,
    resolve() {},
    blocked: (x: number, z: number) => blocked?.(x, z) ?? false,
    lookDir: (out: THREE.Vector3) => out.set(0, 0, 1),
    hitStop() {},
    iframes() {},
    strike() {},
    schedule() {},
    sound() {},
    turn() {},
    gainAura() {},
    spendAura: () => 100,
    heal: (amount: number) => {
      const before = hp;
      hp = Math.min(110, hp + amount);
      return hp - before;
    },
    cooldown() {},
    vitals: () => ({ hp, maxHp: 110 }),
    hold: (_target: KitTarget, seconds: number) => {
      holds.push(seconds);
    },
    canHit: (target: KitTarget) => target.hp > 0,
    blessSquad: (fraction: number) => {
      blessings.push(fraction);
      hp = Math.min(110, hp + 110 * fraction);
    },
  } as unknown as KitContext;
  return { scene, ctx, hurts, blessings, holds, hp: () => hp };
}

function visible(scene: THREE.Scene, name: string) {
  let count = 0;
  scene.traverse((object) => {
    if (object.name === name && object.visible) count += 1;
  });
  return count;
}

const show = harness([foe(-4, 6), foe(0, 5), foe(4, 7)]);
const marilyn = new MarilynKit();
marilyn.attach(show.ctx);
assert.equal(marilyn.tryAbility('showtime'), true);
assert.equal(visible(show.scene, 'showtime-projection'), 3);
for (let i = 0; i < 20; i += 1) marilyn.update({ dt: 0.1, time: i, speed: 0, sprinting: false, moving: false });
assert.equal(show.hurts.length, 3);
assert.ok(show.hurts.every((hit) => hit.damage === SHOWTIME.damage));
const again = show.hurts.length;
marilyn.update({ dt: 0.2, time: 3, speed: 0, sprinting: false, moving: false });
assert.equal(show.hurts.length, again);
marilyn.detach();

const ribbons = harness([foe(0, 1.4, 200)]);
const dancer = new MarilynKit();
dancer.attach(ribbons.ctx);
dancer.tryAbility('letsBeBad');
assert.equal(visible(ribbons.scene, 'lets-be-bad-ribbon'), 2);
dancer.update({ dt: 0.05, time: 0, speed: 0, sprinting: false, moving: false });
assert.equal(ribbons.hurts.length, 0);
for (let i = 0; i < 80; i += 1) dancer.update({ dt: 0.05, time: i, speed: 0, sprinting: false, moving: false });
const ribbonHits = ribbons.hurts.length;
assert.equal(ribbonHits, LETS_BE_BAD.maxHits);
assert.ok(ribbons.hurts.every((hit) => hit.damage === LETS_BE_BAD.damage));
assert.ok(ribbons.holds.every((seconds) => seconds === LETS_BE_BAD.hold));
dancer.detach();

const wave = harness([foe(0, 4, 40)]);
const star = new MarilynKit();
star.attach(wave.ctx);
star.tryAbility('abracadabra');
assert.equal(wave.blessings.length, 1);
assert.equal(wave.blessings[0], ABRACADABRA.heal);
assert.equal(wave.hp(), 40 + 110 * ABRACADABRA.heal);
for (let i = 0; i < 8; i += 1) star.update({ dt: 0.1, time: i, speed: 0, sprinting: false, moving: false });
assert.equal(wave.hurts.length, 1);
assert.equal(wave.hurts[0].damage, ABRACADABRA.damage);
assert.equal(wave.hurts[0].target.hp, 0);
assert.equal(visible(wave.scene, 'abracadabra-dust'), 1);
assert.equal(wave.blessings.length, 1);
star.detach();

const tough = harness([foe(0, 2, 400)]);
const encore = new MarilynKit();
encore.attach(tough.ctx);
encore.tryAbility('abracadabra');
for (let i = 0; i < 8; i += 1) encore.update({ dt: 0.1, time: i, speed: 0, sprinting: false, moving: false });
assert.equal(tough.hurts.length, 1);
assert.equal(tough.hurts[0].target.hp, 400 - ABRACADABRA.damage);
assert.equal(visible(tough.scene, 'abracadabra-dust'), 0);
encore.detach();

const wall = harness([foe(0, 14, 80)], (_x, z) => z > 8);
const blocked = new MarilynKit();
blocked.attach(wall.ctx);
blocked.tryAbility('showtime');
for (let i = 0; i < 30; i += 1) blocked.update({ dt: 0.1, time: i, speed: 0, sprinting: false, moving: false });
assert.equal(wall.hurts.length, 0);
blocked.detach();

const dream = harness([foe(0, 3, 90), foe(2, 3, 120, 'heavy')]);
const martin = new MartinKit();
martin.attach(dream.ctx);
const before = dream.hurts.length;
martin.tryAbility('dreamVision');
for (let i = 0; i < 10; i += 1) martin.update({ dt: 0.1, time: i, speed: 0, sprinting: false, moving: false });
assert.equal(dream.hurts.length, before);
assert.equal((dream.ctx.targets()[0] as CrowdBody).hp, 90);
assert.ok(((dream.ctx.targets()[0] as CrowdBody).pacified ?? 0) >= DREAM_VISION.pacify - 0.05);
assert.ok(((dream.ctx.targets()[1] as CrowdBody).pacified ?? 0) <= DREAM_VISION.pacify * 0.5 + 0.05);
assert.ok(((dream.ctx.targets()[1] as CrowdBody).pacified ?? 0) > 0);
martin.detach();

const beam = harness([foe(0, 4, 100), foe(6, 1, 100)], (_x, z) => z > 10);
const speaker = new MartinKit();
speaker.attach(beam.ctx);
speaker.tryAbility('proclaimPeace');
speaker.update({ dt: 0.49, time: 0, speed: 0, sprinting: false, moving: false });
assert.equal(beam.hurts.length, 0);
assert.ok(((beam.ctx.targets()[0] as CrowdBody).immobile ?? 0) > 0);
assert.equal((beam.ctx.targets()[1] as CrowdBody).immobile ?? 0, 0);
speaker.update({ dt: 0.02, time: 1, speed: 0, sprinting: false, moving: false });
assert.equal(beam.hurts.length, 1);
assert.equal(beam.hurts[0].damage, PROCLAIM_PEACE.damage);
speaker.update({ dt: 0.5, time: 2, speed: 0, sprinting: false, moving: false });
assert.equal(beam.hurts.length, 2);
const side = beam.hurts.filter((hit) => hit.target === beam.ctx.targets()[1]);
assert.equal(side.length, 0);
speaker.detach();

const buff = harness([]);
const march = new MartinKit();
march.attach(buff.ctx);
assert.equal(march.outgoingScale, 1);
assert.equal(march.incomingScale, 1);
assert.equal(march.moveScale, 1);
march.tryAbility('freeAtLast');
assert.equal(march.outgoingScale, FREE_AT_LAST.strength);
assert.equal(march.incomingScale, FREE_AT_LAST.endurance);
assert.equal(march.moveScale, FREE_AT_LAST.speed);
march.tryAbility('freeAtLast');
assert.equal(march.outgoingScale, FREE_AT_LAST.strength);
march.update({ dt: FREE_AT_LAST.duration, time: 0, speed: 1, sprinting: false, moving: true });
assert.equal(march.outgoingScale, 1);
assert.equal(march.incomingScale, 1);
assert.equal(march.moveScale, 1);
march.detach();

assert.equal(RYDERZ['marilyn-monroe'].glb, '/assets/those-ryderz/models/boomers/marilyn-monroe.glb');
assert.equal(RYDERZ['marilyn-monroe'].visual.auraStyle, 'sparkle');
assert.equal(RYDERZ['martin-luther-king'].visual.auraStyle, 'sparkle');
assert.equal(RYDERZ['martin-luther-king'].glb, '/assets/those-ryderz/models/boomers/martin-luther-king.glb');

console.log('boomer kits ok');
