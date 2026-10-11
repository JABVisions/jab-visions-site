import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RYDERZ } from '../config';
import type { Fighter } from '../characters';
import type { KitContext, KitTarget } from '../ryderz/kit';
import { sweepScore } from '../pvp/abilityBands';
import { PvpCpu, type PvpCpuHooks } from '../pvp/pvpCpu';
import { buildHumanoid } from '../toon';
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
  const hurts: { target: KitTarget; damage: number; reaction?: string }[] = [];
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
    hurt: (target: KitTarget, damage: number, _dir: THREE.Vector3, reaction?: string) => {
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      hurts.push({ target, damage, reaction });
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

const spin = harness([foe(0, 1.2, 200), foe(2.3, 0, 200), foe(0, 6, 200)]);
const dancer = new MarilynKit();
dancer.attach(spin.ctx);
assert.equal(dancer.tryAbility('letsBeBad'), true);
assert.equal(dancer.locked, false);
assert.equal(dancer.busy, true);
assert.equal(dancer.steerWhileBusy, true);
assert.equal(dancer.moveScale, LETS_BE_BAD.moveScale);
assert.ok(Math.abs(dancer.moveScale - 0.85 * 1.28) < 1e-6);
assert.equal(dancer.tryAbility('letsBeBad'), false);
assert.equal(visible(spin.scene, 'lets-be-bad-ribbon'), 3);
assert.equal(visible(spin.scene, 'lets-be-bad-glitter'), 1);
assert.equal(visible(spin.scene, 'lets-be-bad-glow'), 1);
assert.equal(dancer.pose?.kind, 'whirl');
const origin = spin.ctx.pos.clone();
dancer.update({ dt: 0.01, time: 0, speed: 1, sprinting: false, moving: true });
assert.ok(spin.ctx.pos.equals(origin), 'the spin must not dash her; steering stays with the movement controller');
const ribbonColors = new Set<number>();
let neck = Infinity;
let mouth = 0;
spin.scene.traverse((object) => {
  const mesh = object as THREE.Mesh;
  if (object.name !== 'lets-be-bad-ribbon' || !mesh.isMesh) return;
  ribbonColors.add((mesh.material as THREE.MeshBasicMaterial).color.getHex());
  const attr = mesh.geometry.getAttribute('position');
  for (let i = 0; i < attr.count; i += 1) {
    const y = attr.getY(i);
    const radius = Math.hypot(attr.getX(i) - origin.x, attr.getZ(i) - origin.z);
    if (y < 1.7) neck = Math.min(neck, radius);
    if (y > 3) mouth = Math.max(mouth, radius);
  }
});
assert.ok(ribbonColors.has(0x168bff) && ribbonColors.has(0x66cfff) && ribbonColors.has(0xd8f4ff));
assert.ok(mouth > neck + 0.8, `the ribbon should open upward, neck ${neck.toFixed(2)} mouth ${mouth.toFixed(2)}`);
const front = spin.ctx.targets()[0];
const flank = spin.ctx.targets()[1];
const far = spin.ctx.targets()[2];
const of = (target: KitTarget) => spin.hurts.filter((hit) => hit.target === target);
assert.equal(of(front).filter((hit) => hit.reaction === 'knockback' && hit.damage === LETS_BE_BAD.kickDamage).length, 1);
assert.equal(of(front).filter((hit) => hit.reaction === 'stagger' && hit.damage === LETS_BE_BAD.ribbonDamage).length, 1);
assert.equal(of(flank).length, 1);
assert.equal(of(flank)[0].damage, LETS_BE_BAD.ribbonDamage);
assert.equal(of(flank)[0].reaction, 'stagger');
assert.equal(of(far).length, 0);
const kicksBefore = of(front).filter((hit) => hit.reaction === 'knockback').length;
const ribbonsBefore = of(front).filter((hit) => hit.reaction === 'stagger').length;
for (let i = 0; i < 70; i += 1) dancer.update({ dt: 0.01, time: i * 0.01, speed: 1, sprinting: false, moving: true });
assert.ok(of(front).filter((hit) => hit.reaction === 'knockback').length > kicksBefore, 'the extended leg comes around for another kick');
assert.equal(of(front).filter((hit) => hit.reaction === 'stagger').length, ribbonsBefore, 'the ribbon waits out its own interval');
assert.equal(of(flank).filter((hit) => hit.reaction === 'knockback').length, 0);
dancer.update({ dt: LETS_BE_BAD.duration, time: 6, speed: 1, sprinting: false, moving: true });
assert.equal(dancer.busy, false);
assert.equal(dancer.bodyYaw, 0);
assert.equal(dancer.moveScale, 1);
assert.equal(dancer.steerWhileBusy, false);
assert.equal(visible(spin.scene, 'lets-be-bad-ribbon'), 0);
assert.equal(visible(spin.scene, 'lets-be-bad-glitter'), 0);
assert.equal(visible(spin.scene, 'lets-be-bad-glow'), 0);
assert.equal(dancer.tryAbility('showtime'), true);
assert.equal(visible(spin.scene, 'showtime-projection'), 3);
dancer.detach();

const stunned = harness([foe(0, 1.2, 80)]);
const dizzy = new MarilynKit();
dizzy.attach(stunned.ctx);
dizzy.tryAbility('letsBeBad');
dizzy.update({ dt: 0.05, time: 0, speed: 0, sprinting: false, moving: false, stunned: true });
assert.equal(dizzy.busy, false);
assert.equal(visible(stunned.scene, 'lets-be-bad-ribbon'), 0);
dizzy.detach();

const cut = harness([]);
const stopped = new MarilynKit();
stopped.attach(cut.ctx);
stopped.tryAbility('letsBeBad');
stopped.interrupt();
assert.equal(stopped.busy, false);
assert.equal(stopped.bodyYaw, 0);
assert.equal(visible(cut.scene, 'lets-be-bad-ribbon'), 0);
assert.equal(visible(cut.scene, 'lets-be-bad-glitter'), 0);
stopped.detach();

assert.ok(sweepScore(6, 2) < sweepScore(6, 0));
assert.ok(sweepScore(3, 0) < sweepScore(8, 0));

function allyCpu(start: THREE.Vector3, chase: THREE.Vector3, targets: CrowdBody[], blocked: (x: number, z: number) => boolean) {
  const scene = new THREE.Scene();
  const humanoid = buildHumanoid({ skin: 0xffd2b8, top: 0x168bff, bottom: 0xf4f7ff, hair: 0xffe08a, eyes: 0x16324f });
  const fighter = { humanoid, weapons: [], glowMeshes: [], meshSource: 'procedural' } as Fighter;
  const hooks = {
    scene,
    particles: { emit() {} },
    rings: {},
    cracks: {},
    afterimages: { spawn() {} },
    camera: { addKick() {}, addShake() {}, addFovPunch() {} },
    cameraObject: new THREE.PerspectiveCamera(),
    playerPos: chase,
    playerHp: () => 80,
    playerMaxHp: () => 80,
    setPlayerHp() {},
    playerAttacking: () => false,
    playerVelocity: () => new THREE.Vector3(),
    playerIntangible: () => false,
    playerWhiff: () => false,
    playerStunned: () => false,
    playerMemory: () => ({ punch: 0, kick: 0, melee: 0, ability: 0, dodge: 0, retreat: 0 }),
    heightAt: () => 0,
    resolve() {},
    blocked: (x: number, z: number) => blocked(x, z),
    hurtPlayer() {},
    time: () => 0,
    sound() {},
    stunPlayer() {},
    suppressPlayer() {},
    raidTargets: () => targets,
    hurtRaidTarget: (target: KitTarget, damage: number) => {
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      return before - target.hp;
    },
    flashRaidTarget() {},
  } as unknown as PvpCpuHooks;
  const cpu = new PvpCpu(hooks, 'marilyn-monroe', 'ryder');
  cpu.attach(
    {
      fighter,
      hp: 110,
      maxHp: 110,
      pos: start,
      radius: 0.45,
      speed: 6.6,
      anim: 0,
      swing: false,
      sink: 0,
      hit: 0,
      hitColor: 0xffffff,
    },
    RYDERZ['marilyn-monroe'],
  );
  return { cpu, scene };
}

const random = Math.random;
Math.random = () => 0.99;
try {
  const pack = [foe(0, 3.2, 200), foe(1.1, 3.6, 200)];
  const allyPos = new THREE.Vector3();
  const ally = allyCpu(allyPos, pack[0].pos, pack, () => false);
  let spinning = false;
  let time = 0;
  for (let i = 0; i < 240 && !spinning; i += 1) {
    time += 0.05;
    ally.cpu.update(0.05, time);
    spinning = ally.cpu.sweeping;
  }
  assert.equal(spinning, true, 'a computer Marilyn should cast Let\'s Be Bad when enemies are close');
  const startZ = allyPos.z;
  for (let i = 0; i < 30; i += 1) {
    time += 0.05;
    ally.cpu.update(0.05, time);
  }
  assert.ok(allyPos.z > startZ + 0.4, `she should keep walking into the pack while spinning, z=${allyPos.z.toFixed(2)}`);
  assert.equal(ally.cpu.sweeping, true);
  const damaged = pack.reduce((sum, body) => sum + (200 - body.hp), 0);
  assert.ok(damaged >= LETS_BE_BAD.kickDamage + LETS_BE_BAD.ribbonDamage, `the sweep should hurt the pack, dealt ${damaged}`);
  ally.cpu.stun();
  assert.equal(ally.cpu.sweeping, false);
  assert.equal(visible(ally.scene, 'lets-be-bad-ribbon'), 0);
  ally.cpu.dispose();

  const walled = [foe(0, 4, 200)];
  const held = new THREE.Vector3();
  const blockedAlly = allyCpu(held, walled[0].pos, walled, (_x, z) => z > 0.15);
  for (let i = 0; i < 80; i += 1) blockedAlly.cpu.update(0.05, i * 0.05);
  assert.ok(held.z < 0.2, `a wall in front of the spin should stop her, z=${held.z.toFixed(2)}`);
  blockedAlly.cpu.dispose();
} finally {
  Math.random = random;
}

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
