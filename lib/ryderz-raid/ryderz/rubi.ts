import * as THREE from 'three';
import { animateGltfFighter, buildRyder, type Fighter } from '../characters';
import { sortByDistance, targetsInArc, type HitReaction } from '../combat';
import type { AbilityId } from '../config';
import { TrailRibbon } from '../speed-vfx';
import { disposeObject, flashEmissive, setHumanoidOpacity } from '../toon';
import type { MeleeStyle, PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Rubi Wong — the Red Ryder. Sword pressure, multiplication.
 *
 * Q  Blade Storm     lock the nearest host, close, then a four-hit red-energy
 *                    sword combo that leaves slash marks and knocks on the last cut.
 * E  Duplication     three echo-selves spawn behind her and hunt on their own;
 *                    they sprint, slash, then dissolve. Waves keep coming while
 *                    the drain is on.
 * R  Double Trouble  a clone appears behind the target as Rubi lunges from the
 *                    front; both cut at once, then the echo burns off.
 *
 * Visual language: crimson blade, sharp slash trails, red particle dissolves.
 * You never fight Rubi alone.
 */

const WHITE = new THREE.Color(0xffffff);
const CRIMSON = 0xff3d55;
const MARK = 0xff6a7a;

const COMBO: MeleeStep[] = [
  { style: 'slash', damageMul: 0.95, hitDelay: 0.14, range: 2.55, halfArc: 1.1, reaction: 'stagger', strength: 0.85, recovery: 0.34, shake: 0.06, hitStop: 0, lunge: 0.22, sound: 'rubi.melee.slash' },
  { style: 'chop', damageMul: 1.05, hitDelay: 0.16, range: 2.5, halfArc: 0.75, reaction: 'stagger', strength: 1.0, recovery: 0.36, shake: 0.08, hitStop: 0.02, lunge: 0.26, sound: 'rubi.melee.chop' },
  { style: 'slash', damageMul: 0.9, hitDelay: 0.14, range: 2.7, halfArc: 1.35, reaction: 'knockback', strength: 0.9, recovery: 0.38, shake: 0.1, hitStop: 0.02, lunge: 0.2, sound: 'rubi.melee.slash' },
  { style: 'smash', damageMul: 1.45, hitDelay: 0.18, range: 2.75, halfArc: 0.8, reaction: 'heavy', strength: 1.1, recovery: 0.55, shake: 0.22, hitStop: 0.04, lunge: 0.34, sound: 'rubi.melee.smash' },
];
const COMBO_WINDOW = 1.05;

const STORM_SEEK = 12.5;
const STORM_REACH = 1.85;
const STORM_CLOSE = 22;
const STORM_RECOVER = 0.2;
const STORM_HITS: Array<{ at: number; style: MeleeStyle; mul: number; reaction: HitReaction; strength: number; slash: THREE.Vector3 }> = [
  { at: 0.06, style: 'slash', mul: 0.72, reaction: 'stagger', strength: 0.8, slash: new THREE.Vector3(1, 0.08, 0.15) },
  { at: 0.24, style: 'chop', mul: 0.78, reaction: 'stagger', strength: 0.95, slash: new THREE.Vector3(0.2, 1, 0.05) },
  { at: 0.42, style: 'slash', mul: 0.84, reaction: 'stagger', strength: 0.9, slash: new THREE.Vector3(-1, 0.25, 0.1) },
  { at: 0.64, style: 'smash', mul: 1.45, reaction: 'knockback', strength: 1.05, slash: new THREE.Vector3(0.55, 0.85, -0.15) },
];
const STORM_COMBO = 0.88;

const DUP_COUNT = 3;
const DUP_OFFSETS: Array<[number, number]> = [
  [-1.45, 0.7],
  [1.45, 0.7],
  [0, 1.35],
];
const DUP_LIFE = 4.4;
const DUP_SPEED = 9.4;
const DUP_REACH = 1.8;
const DUP_HITS = 3;
const DUP_DAMAGE = 0.48;
const DUP_WAVE_GAP = 0.55;
const DUP_SPAWN_STAGGER = 0.09;
const DUP_OPACITY = 0.72;

const TROUBLE_SEEK = 11.5;
const TROUBLE_LOCK = 0.1;
const TROUBLE_CUT = 0.32;
const TROUBLE_RECOVER = 0.18;
const TROUBLE_HIT_AT = 0.12;
const TROUBLE_DAMAGE = 1.15;
const TROUBLE_BEHIND = 1.35;

const MELEE_DECAY = 3.4;
const X_AXIS = new THREE.Vector3(1, 0, 0);

type Sequence =
  | {
      kind: 'storm';
      phase: 'close' | 'combo' | 'recover';
      t: number;
      target: KitTarget | null;
      yaw: number;
      struck: number;
    }
  | {
      kind: 'trouble';
      phase: 'lock' | 'cut' | 'recover';
      t: number;
      target: KitTarget | null;
      yaw: number;
      clone: Echo | null;
      hit: boolean;
    };

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _hits: KitTarget[] = [];
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function energyMat(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function bladeTip(fighter: Fighter | null, out: THREE.Vector3) {
  const socket = fighter?.rig?.weaponSocket;
  if (socket) {
    socket.updateWorldMatrix(true, false);
    return out.set(0, 0.82, 0).applyMatrix4(socket.matrixWorld);
  }
  fighter?.humanoid.group.getWorldPosition(out);
  out.y += 1.25;
  return out;
}

function makeEnergyBlade(color: THREE.ColorRepresentation) {
  const group = new THREE.Group();
  group.name = 'EnergyBlade';
  const coreMat = energyMat(color, 0);
  const haloMat = energyMat(color, 0);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.78, 0.04), coreMat);
  const halo = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.82, 0.07), haloMat);
  core.position.y = 0.4;
  halo.position.y = 0.4;
  core.renderOrder = 4;
  halo.renderOrder = 3;
  group.add(halo, core);
  group.visible = false;
  return { group, coreMat, haloMat };
}

function attachBlade(fighter: Fighter | null, blade: THREE.Object3D) {
  blade.removeFromParent();
  const socket = fighter?.rig?.weaponSocket;
  if (socket) socket.add(blade);
  else fighter?.humanoid.group.add(blade);
}

/** Temporary red sword-marks that ride a host's chest, then fade. Never writes the mesh. */
class SlashMarkPool {
  readonly group = new THREE.Group();
  private items: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    life: number;
    max: number;
    target: KitTarget | null;
    local: THREE.Vector3;
    axis: THREE.Vector3;
  }> = [];

  constructor(count = 18) {
    this.group.name = 'RubiSlashMarks';
    const geo = new THREE.BoxGeometry(1, 0.045, 0.07);
    for (let i = 0; i < count; i += 1) {
      const mat = energyMat(MARK, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.items.push({
        mesh,
        mat,
        life: 0,
        max: 1,
        target: null,
        local: new THREE.Vector3(),
        axis: new THREE.Vector3(),
      });
    }
  }

  setColor(color: THREE.ColorRepresentation) {
    for (const item of this.items) item.mat.color.set(color).lerp(WHITE, 0.25);
  }

  spawn(target: KitTarget, dir: THREE.Vector3, length = 1.05) {
    const item = this.items.find((i) => i.life <= 0) ?? this.items.reduce((a, b) => (a.life < b.life ? a : b));
    item.target = target;
    item.life = 0.62;
    item.max = 0.62;
    item.axis.copy(dir).normalize();
    if (item.axis.lengthSq() < 0.01) item.axis.set(1, 0.2, 0).normalize();
    item.local.set((Math.random() - 0.5) * 0.25, 1.05 + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.2);
    item.mesh.visible = true;
    item.mesh.scale.set(length, 1, 1);
    this.place(item);
  }

  cross(target: KitTarget) {
    this.spawn(target, new THREE.Vector3(0.85, 0.55, 0.1), 1.55);
    this.spawn(target, new THREE.Vector3(-0.75, 0.65, -0.15), 1.55);
  }

  private place(item: (typeof this.items)[number]) {
    if (!item.target) return;
    item.mesh.position.copy(item.target.pos).add(item.local);
    item.mesh.quaternion.setFromUnitVectors(X_AXIS, item.axis);
  }

  update(dt: number) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0 || (item.target && item.target.hp <= 0 && item.life < item.max * 0.5)) {
        item.life = 0;
        item.mesh.visible = false;
        item.target = null;
        continue;
      }
      this.place(item);
      const p = 1 - item.life / item.max;
      item.mat.opacity = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.88);
      item.mat.opacity *= 0.95;
    }
  }

  clear() {
    for (const item of this.items) {
      item.life = 0;
      item.mesh.visible = false;
      item.target = null;
    }
  }
}

/** Brief red column that pops when an echo appears. */
class SpawnFlashPool {
  readonly group = new THREE.Group();
  private items: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number }> = [];

  constructor(count = 6) {
    this.group.name = 'RubiSpawnFlashes';
    const geo = new THREE.CylinderGeometry(0.05, 0.09, 1.15, 8, 1, true);
    for (let i = 0; i < count; i += 1) {
      const mat = energyMat(CRIMSON, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.items.push({ mesh, mat, life: 0, max: 1 });
    }
  }

  spawn(pos: THREE.Vector3) {
    const item = this.items.find((i) => i.life <= 0) ?? this.items[0];
    item.mesh.position.copy(pos).setY(pos.y + 0.85);
    item.mesh.visible = true;
    item.life = 0.18;
    item.max = 0.18;
    item.mesh.scale.setScalar(0.7);
  }

  update(dt: number) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.visible = false;
        continue;
      }
      const p = 1 - item.life / item.max;
      const open = p < 0.4 ? p / 0.4 : 1;
      item.mesh.scale.set(0.7 + open * 0.5, 0.85 + open * 0.25, 0.7 + open * 0.5);
      item.mat.opacity = (1 - p) * 0.4;
    }
  }

  clear() {
    for (const item of this.items) {
      item.life = 0;
      item.mesh.visible = false;
    }
  }
}

interface Echo {
  fighter: Fighter;
  pos: THREE.Vector3;
  yaw: number;
  anim: number;
  meleeT: number;
  meleeStarted: boolean;
  style: MeleeStyle;
  target: KitTarget | null;
  life: number;
  maxLife: number;
  state: 'spawn' | 'chase' | 'attack' | 'dissolve';
  spawnT: number;
  attackT: number;
  attackIndex: number;
  swung: boolean;
  landed: boolean;
  trail: TrailRibbon;
  blade: ReturnType<typeof makeEnergyBlade>;
  delay: number;
}

export class RubiKit implements RyderKit {
  private ctx: KitContext | null = null;
  private seq: Sequence | null = null;
  private poseState: PoseOverride | null = null;
  private comboIndex = 0;
  private comboExpires = 0;
  private duplicating = false;
  private echoes: Echo[] = [];
  private waveT = 0;
  private marks = new SlashMarkPool();
  private flashes = new SpawnFlashPool();
  private playerBlade = makeEnergyBlade(CRIMSON);
  private playerTrail: TrailRibbon;
  private bodyGlow = 0;
  private swordWant = 0;
  private swordGlow = 0;
  private sparkT = 0;

  constructor() {
    this.playerTrail = new TrailRibbon(CRIMSON, { life: 0.18, width: 0.1, spacing: 0.09, points: 12 });
  }

  get locked() {
    return !!this.seq;
  }

  get airY() {
    return 0;
  }

  get pose() {
    return this.poseState;
  }

  get glow() {
    return this.bodyGlow;
  }

  get busy() {
    return false;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const color = ctx.spec.visual.electricityColor;
    this.marks.setColor(color);
    this.playerTrail.setColor(color);
    this.playerBlade.coreMat.color.set(color).lerp(WHITE, 0.35);
    this.playerBlade.haloMat.color.set(color);
    ctx.scene.add(this.marks.group, this.flashes.group, this.playerTrail.mesh);
    const fighter = ctx.fighter();
    attachBlade(fighter, this.playerBlade.group);
    if (fighter) ctx.afterimages.bind(fighter, ctx.spec.visual.auraColor);
    this.bodyGlow = 0;
    this.swordWant = 0;
    this.swordGlow = 0;
    this.comboIndex = 0;
  }

  detach() {
    this.interrupt();
    this.playerBlade.group.removeFromParent();
    if (this.ctx) {
      this.ctx.scene.remove(this.marks.group, this.flashes.group, this.playerTrail.mesh);
      this.ctx.afterimages.unbind();
    }
    this.playerTrail.clear();
    this.marks.clear();
    this.flashes.clear();
    this.ctx = null;
  }

  interrupt() {
    this.seq = null;
    this.poseState = null;
    this.duplicating = false;
    this.clearEchoes(true);
    this.swordWant = 0;
    this.bodyGlow = 0;
  }

  melee(time: number): MeleeStep | null {
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + COMBO_WINDOW;
    this.swordWant = Math.max(this.swordWant, 0.7);
    this.ctx?.power.boost(0.75 + 0.2 * this.comboIndex);
    this.ctx?.power.arcAt(['handR', 'lowerArmR'], 1, 0.85, 0.1, 0.03);
    return step;
  }

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    switch (id) {
      case 'bladeFan':
        return this.seq ? true : this.startStorm();
      case 'duplicate':
        this.startDuplication();
        return true;
      case 'envyPulse':
        return this.seq ? true : this.startTrouble();
      default:
        return false;
    }
  }

  endAbility(id: AbilityId) {
    if (id === 'duplicate') {
      this.duplicating = false;
      for (const echo of this.echoes) {
        if (echo.state !== 'dissolve') {
          echo.state = 'dissolve';
          echo.spawnT = 0;
        }
      }
    }
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = frame.dt;
    this.marks.update(dt);
    this.flashes.update(dt);

    if (this.seq?.kind === 'storm') this.tickStorm(dt);
    else if (this.seq?.kind === 'trouble') this.tickTrouble(dt);
    else this.poseState = null;

    if (this.duplicating) {
      const alive = this.echoes.filter((e) => e.state !== 'dissolve' && e.delay <= 0).length;
      if (alive === 0) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.spawnWave();
          this.waveT = DUP_WAVE_GAP;
        }
      }
    }

    this.tickEchoes(dt);
    this.driveSword(dt);
    this.bodyGlow += ((this.seq || this.duplicating ? 0.35 : 0) - this.bodyGlow) * Math.min(1, dt * 8);

    this.sparkT -= dt;
    if ((this.seq || this.duplicating) && this.sparkT <= 0) {
      this.sparkT = 0.08;
      ctx.particles.emit(ctx.pos.clone().setY(0.2), ctx.spec.color, 1, { speed: 1.4, size: 0.16, life: 0.28, up: 0.6 });
    }
  }

  // ---------------------------------------------------------------------------
  // Targeting
  // ---------------------------------------------------------------------------

  private living() {
    return this.ctx?.targets().filter((t) => t.hp > 0) ?? [];
  }

  private nearest(from: THREE.Vector3, range: number, ignore?: KitTarget | null) {
    const list = this.living().filter((t) => t !== ignore);
    if (!list.length) return null;
    sortByDistance(list, from);
    const t = list[0];
    const dx = t.pos.x - from.x;
    const dz = t.pos.z - from.z;
    if (dx * dx + dz * dz > range * range) return null;
    return t;
  }

  private aimYaw(target: KitTarget | null) {
    const ctx = this.ctx!;
    if (target) return Math.atan2(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z);
    ctx.lookDir(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 0.01) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    _dir.normalize();
    return Math.atan2(_dir.x, _dir.z);
  }

  private face(yaw: number, cut = false) {
    this.ctx?.turn(yaw, cut);
  }

  private placeAround(origin: THREE.Vector3, yaw: number, side: number, back: number) {
    const ctx = this.ctx!;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    for (const scale of [1, 0.7, 0.4, 0.15]) {
      _p.copy(origin).addScaledVector(_right, side * scale).addScaledVector(_fwd, -back * scale);
      if (!ctx.blocked(_p.x, _p.z, 0.45)) return _p.clone();
    }
    return origin.clone();
  }

  private placeBehind(target: KitTarget, yaw: number) {
    const ctx = this.ctx!;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    const dist = target.radius + TROUBLE_BEHIND;
    for (const [back, side] of [
      [dist, 0],
      [dist, 0.7],
      [dist, -0.7],
      [dist * 0.7, 0.4],
      [dist * 0.7, -0.4],
    ] as Array<[number, number]>) {
      _p.copy(target.pos).addScaledVector(_fwd, -back).addScaledVector(_right, side);
      if (!ctx.blocked(_p.x, _p.z, 0.45)) return _p.clone();
    }
    return target.pos.clone().addScaledVector(_fwd, -dist);
  }

  // ---------------------------------------------------------------------------
  // Blade Storm
  // ---------------------------------------------------------------------------

  private startStorm() {
    const ctx = this.ctx!;
    const target = this.nearest(ctx.pos, STORM_SEEK);
    const yaw = this.aimYaw(target);
    this.face(yaw, true);
    this.seq = { kind: 'storm', phase: 'close', t: 0, target, yaw, struck: 0 };
    this.swordWant = 1;
    ctx.power.boost(1.15);
    ctx.power.arcAt(['handR', 'lowerArmR'], 2, 1, 0.16, 0.04);
    ctx.camera.addKick(-0.08);
    ctx.sound('rubi.storm.start');
    if (target) ctx.flash(target, CRIMSON, 0.18);
    return true;
  }

  private tickStorm(dt: number) {
    const ctx = this.ctx!;
    const seq = this.seq;
    if (!seq || seq.kind !== 'storm') return;
    seq.t += dt;
    const target = seq.target && seq.target.hp > 0 ? seq.target : this.nearest(ctx.pos, STORM_SEEK);
    seq.target = target;
    seq.yaw = this.aimYaw(target);
    this.face(seq.yaw);

    if (seq.phase === 'close') {
      this.poseState = { kind: 'rush', t: Math.min(1, seq.t / 0.25), weight: 1 };
      _fwd.set(Math.sin(seq.yaw), 0, Math.cos(seq.yaw));
      const dist = target ? Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z) : 99;
      const need = target ? Math.max(0, dist - STORM_REACH - target.radius) : 3.2;
      if (need > 0.12 && seq.t < 0.4) {
        const step = Math.min(need, STORM_CLOSE * dt);
        ctx.pos.addScaledVector(_fwd, step);
        ctx.resolve(ctx.pos);
        if (seq.t > 0.04) ctx.afterimages.spawn(0.16, 0.22);
      } else {
        seq.phase = 'combo';
        seq.t = 0;
        seq.struck = 0;
        this.poseState = null;
      }
      return;
    }

    if (seq.phase === 'combo') {
      this.poseState = null;
      while (seq.struck < STORM_HITS.length && seq.t >= STORM_HITS[seq.struck].at) {
        const hit = STORM_HITS[seq.struck];
        seq.struck += 1;
        ctx.strike(hit.style);
        ctx.sound(`rubi.storm.slash${seq.struck}`);
        this.cut(target, hit.mul, hit.reaction, hit.strength, hit.slash, seq.yaw, seq.struck === STORM_HITS.length);
      }
      if (seq.t >= STORM_COMBO) {
        seq.phase = 'recover';
        seq.t = 0;
      }
      return;
    }

    this.poseState = { kind: 'guard', t: Math.min(1, seq.t / STORM_RECOVER), weight: 1 - seq.t / STORM_RECOVER };
    if (seq.t >= STORM_RECOVER) {
      this.seq = null;
      this.poseState = null;
      this.swordWant = this.duplicating ? 0.45 : 0;
      ctx.sound('rubi.storm.end');
    }
  }

  private cut(
    target: KitTarget | null,
    mul: number,
    reaction: HitReaction,
    strength: number,
    slash: THREE.Vector3,
    yaw: number,
    finisher: boolean,
  ) {
    const ctx = this.ctx!;
    ctx.schedule(0.08, () => {
      if (!this.ctx) return;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      ctx.pos.addScaledVector(_fwd, finisher ? 0.28 : 0.12);
      ctx.resolve(ctx.pos);
      const dmg = ctx.meleeDamage() * mul;
      const hits = target && target.hp > 0 ? [target] : targetsInArc(this.living(), ctx.pos, yaw, 2.6, 1.1, _hits);
      if (!hits.length) {
        ctx.sound('rubi.storm.whiff');
        ctx.particles.emit(ctx.pos.clone().addScaledVector(_fwd, 1.1).setY(1.15), ctx.spec.color, 6, {
          speed: 5,
          size: 0.2,
          life: 0.2,
          direction: _fwd,
        });
        return;
      }
      for (const host of hits) {
        _dir.set(host.pos.x - ctx.pos.x, 0, host.pos.z - ctx.pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(_fwd);
        _dir.normalize();
        ctx.hurt(host, dmg, _dir, reaction, strength);
        ctx.flash(host, CRIMSON, 0.12);
        this.marks.spawn(host, _q.copy(_dir).add(slash).normalize(), finisher ? 1.35 : 0.95);
        ctx.particles.emit(host.pos.clone().setY(1.15), 0xffffff, finisher ? 10 : 5, {
          speed: 4,
          size: 0.22,
          life: 0.18,
        });
      }
      if (finisher) {
        ctx.camera.addShake(0.28);
        ctx.hitStop(0.05);
        ctx.rings.spawn(hits[0].pos, ctx.spec.color, { radius: 2.4, duration: 0.32, y: 0.08 });
      } else {
        ctx.camera.addKick(-0.04);
      }
      ctx.power.boost(finisher ? 1.4 : 0.9);
    });
  }

  // ---------------------------------------------------------------------------
  // Duplication
  // ---------------------------------------------------------------------------

  private startDuplication() {
    const ctx = this.ctx!;
    this.duplicating = true;
    this.waveT = 0;
    this.swordWant = Math.max(this.swordWant, 0.45);
    ctx.power.boost(1);
    ctx.sound('rubi.dup.start');
    this.spawnWave();
    this.waveT = DUP_WAVE_GAP;
  }

  private spawnWave() {
    const ctx = this.ctx!;
    const yaw = ctx.yaw();
    DUP_OFFSETS.forEach(([side, back], i) => {
      const pos = this.placeAround(ctx.pos, yaw, side, back);
      this.echoes.push(this.makeEcho(pos, yaw, i * DUP_SPAWN_STAGGER, DUP_LIFE));
    });
  }

  private makeEcho(pos: THREE.Vector3, yaw: number, delay: number, life: number, target?: KitTarget | null): Echo {
    const ctx = this.ctx!;
    const fighter = buildRyder(ctx.spec, { clone: true });
    const blade = makeEnergyBlade(ctx.spec.visual.electricityColor);
    attachBlade(fighter, blade.group);
    blade.group.visible = true;
    blade.coreMat.opacity = 0.7;
    blade.haloMat.opacity = 0.28;
    const trail = new TrailRibbon(ctx.spec.visual.electricityColor, { life: 0.16, width: 0.09, spacing: 0.1, points: 10 });
    ctx.scene.add(fighter.humanoid.group, trail.mesh);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = ctx.heightAt(pos.x, pos.z);
    fighter.humanoid.group.rotation.y = yaw;
    fighter.humanoid.group.scale.setScalar(0.45);
    setHumanoidOpacity(fighter.humanoid, 0);
    flashEmissive(fighter.humanoid, ctx.spec.visual.auraColor, 0.22);
    if (delay <= 0) {
      this.flashes.spawn(pos);
      ctx.particles.emit(pos.clone().setY(0.9), ctx.spec.color, 10, { speed: 5, size: 0.2, life: 0.28, up: 1.2 });
    }
    return {
      fighter,
      pos: pos.clone(),
      yaw,
      anim: Math.random() * 4,
      meleeT: 0,
      meleeStarted: false,
      style: 'slash',
      target: target ?? null,
      life,
      maxLife: life,
      state: 'spawn',
      spawnT: 0,
      attackT: 0,
      attackIndex: 0,
      swung: false,
      landed: false,
      trail,
      blade,
      delay,
    };
  }

  private tickEchoes(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const keep: Echo[] = [];
    for (const echo of this.echoes) {
      if (echo.delay > 0) {
        echo.delay -= dt;
        if (echo.delay > 0) {
          keep.push(echo);
          continue;
        }
        this.flashes.spawn(echo.pos);
        ctx.particles.emit(echo.pos.clone().setY(0.9), ctx.spec.color, 10, { speed: 5, size: 0.2, life: 0.28, up: 1.2 });
      }
      echo.life -= dt;
      if (echo.state !== 'dissolve' && echo.life <= 0) {
        echo.state = 'dissolve';
        echo.spawnT = 0;
      }
      if (echo.state === 'spawn') this.tickEchoSpawn(echo, dt);
      else if (echo.state === 'chase') this.tickEchoChase(echo, dt);
      else if (echo.state === 'attack') this.tickEchoAttack(echo, dt);
      else this.tickEchoDissolve(echo, dt);

      echo.meleeT = Math.max(0, echo.meleeT - dt * MELEE_DECAY);
      echo.anim += dt * (8 + (echo.state === 'chase' ? 12 : 4));
      echo.fighter.humanoid.group.position.copy(echo.pos);
      echo.fighter.humanoid.group.position.y = ctx.heightAt(echo.pos.x, echo.pos.z);
      echo.fighter.humanoid.group.rotation.y = echo.yaw;
      const moving = echo.state === 'chase' ? 1 : 0;
      animateGltfFighter(echo.fighter, dt, echo.anim, moving, echo.state === 'chase', echo.meleeT, echo.meleeStarted, {
        style: echo.meleeStarted ? echo.style : undefined,
      });
      echo.meleeStarted = false;
      echo.fighter.humanoid.group.updateWorldMatrix(true, true);
      bladeTip(echo.fighter, _p);
      if ((echo.state === 'attack' || echo.state === 'chase') && echo.pos.distanceTo(_p) < 2.6) echo.trail.feed(_p);
      echo.trail.update(dt, ctx.cameraObject);
      if (echo.state === 'dissolve' && echo.spawnT > 0.34) {
        this.destroyEcho(echo);
      } else {
        keep.push(echo);
      }
    }
    this.echoes = keep;
  }

  private tickEchoSpawn(echo: Echo, dt: number) {
    echo.spawnT += dt;
    const p = Math.min(1, echo.spawnT / 0.16);
    const s = 0.45 + 0.55 * p * p * (3 - 2 * p);
    echo.fighter.humanoid.group.scale.setScalar(s);
    setHumanoidOpacity(echo.fighter.humanoid, DUP_OPACITY * p);
    if (p >= 1) {
      echo.state = 'chase';
      echo.spawnT = 0;
    }
  }

  private tickEchoChase(echo: Echo, dt: number) {
    const ctx = this.ctx!;
    if (!echo.target || echo.target.hp <= 0) echo.target = this.nearest(echo.pos, 18);
    const target = echo.target;
    if (!target) {
      if (echo.life < echo.maxLife - 0.6) {
        echo.state = 'dissolve';
        echo.spawnT = 0;
      }
      return;
    }
    echo.yaw = Math.atan2(target.pos.x - echo.pos.x, target.pos.z - echo.pos.z);
    const dist = Math.hypot(target.pos.x - echo.pos.x, target.pos.z - echo.pos.z);
    if (dist <= DUP_REACH + target.radius) {
      echo.state = 'attack';
      echo.attackT = 0;
      echo.swung = false;
      echo.landed = false;
      return;
    }
    _fwd.set(Math.sin(echo.yaw), 0, Math.cos(echo.yaw));
    echo.pos.addScaledVector(_fwd, DUP_SPEED * dt);
    ctx.resolve(echo.pos);
    if (ctx.blocked(echo.pos.x, echo.pos.z, 0.4)) {
      _right.set(-_fwd.z, 0, _fwd.x);
      echo.pos.addScaledVector(_right, (echo.anim % 2 < 1 ? 1 : -1) * 3.5 * dt);
      ctx.resolve(echo.pos);
    }
  }

  private tickEchoAttack(echo: Echo, dt: number) {
    const ctx = this.ctx!;
    const target = echo.target && echo.target.hp > 0 ? echo.target : this.nearest(echo.pos, 18);
    echo.target = target;
    if (!target) {
      echo.state = 'dissolve';
      echo.spawnT = 0;
      return;
    }
    echo.yaw = Math.atan2(target.pos.x - echo.pos.x, target.pos.z - echo.pos.z);
    const dist = Math.hypot(target.pos.x - echo.pos.x, target.pos.z - echo.pos.z);
    if (dist > DUP_REACH + target.radius + 0.55 && echo.landed) {
      echo.state = 'chase';
      return;
    }
    echo.attackT += dt;
    const styles: MeleeStyle[] = ['slash', 'chop', 'slash'];
    if (!echo.swung && echo.attackT >= 0.08) {
      echo.swung = true;
      echo.style = styles[echo.attackIndex % styles.length];
      echo.meleeStarted = true;
      echo.meleeT = 1;
      ctx.sound('rubi.dup.slash');
    }
    if (echo.swung && !echo.landed && echo.attackT >= 0.18) {
      echo.landed = true;
      _fwd.set(Math.sin(echo.yaw), 0, Math.cos(echo.yaw));
      if (dist <= DUP_REACH + target.radius + 0.35) {
        ctx.hurt(target, ctx.meleeDamage() * DUP_DAMAGE, _fwd, 'stagger', 0.7);
        ctx.flash(target, CRIMSON, 0.1);
        this.marks.spawn(target, _q.copy(_fwd).add(new THREE.Vector3(0.2, 0.4 - echo.attackIndex * 0.3, 0)).normalize(), 0.85);
        ctx.particles.emit(target.pos.clone().setY(1.1), ctx.spec.color, 4, { speed: 3, size: 0.18, life: 0.16 });
      }
    }
    if (echo.attackT >= 0.4) {
      echo.attackIndex += 1;
      echo.attackT = 0;
      echo.swung = false;
      echo.landed = false;
      if (echo.attackIndex >= DUP_HITS) {
        echo.state = 'dissolve';
        echo.spawnT = 0;
      }
    }
  }

  private tickEchoDissolve(echo: Echo, dt: number) {
    const ctx = this.ctx!;
    echo.spawnT += dt;
    const p = Math.min(1, echo.spawnT / 0.32);
    setHumanoidOpacity(echo.fighter.humanoid, DUP_OPACITY * (1 - p));
    echo.fighter.humanoid.group.scale.setScalar(1 - 0.35 * p);
    echo.blade.coreMat.opacity = 0.7 * (1 - p);
    echo.blade.haloMat.opacity = 0.28 * (1 - p);
    if (echo.spawnT < dt * 1.5) {
      ctx.particles.emit(echo.pos.clone().setY(0.95), ctx.spec.color, 14, { speed: 6, size: 0.22, life: 0.32, up: 1.4 });
      ctx.sound('rubi.dup.dissolve');
    }
  }

  private destroyEcho(echo: Echo) {
    const ctx = this.ctx;
    echo.trail.clear();
    echo.blade.group.removeFromParent();
    if (ctx) ctx.scene.remove(echo.fighter.humanoid.group, echo.trail.mesh);
    disposeObject(echo.fighter.humanoid.group);
  }

  private clearEchoes(immediate: boolean) {
    if (immediate) {
      for (const echo of this.echoes) this.destroyEcho(echo);
      this.echoes = [];
      return;
    }
    for (const echo of this.echoes) {
      if (echo.state !== 'dissolve') {
        echo.state = 'dissolve';
        echo.spawnT = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Double Trouble
  // ---------------------------------------------------------------------------

  private startTrouble() {
    const ctx = this.ctx!;
    const target = this.nearest(ctx.pos, TROUBLE_SEEK);
    const yaw = this.aimYaw(target);
    this.face(yaw, true);
    this.seq = { kind: 'trouble', phase: 'lock', t: 0, target, yaw, clone: null, hit: false };
    this.swordWant = 1;
    ctx.power.boost(1.25);
    ctx.camera.addKick(-0.1);
    ctx.sound('rubi.trouble.start');
    if (target) ctx.flash(target, CRIMSON, 0.2);
    return true;
  }

  private tickTrouble(dt: number) {
    const ctx = this.ctx!;
    const seq = this.seq;
    if (!seq || seq.kind !== 'trouble') return;
    seq.t += dt;
    const target = seq.target && seq.target.hp > 0 ? seq.target : this.nearest(ctx.pos, TROUBLE_SEEK);
    seq.target = target;
    seq.yaw = this.aimYaw(target);
    this.face(seq.yaw);
    _fwd.set(Math.sin(seq.yaw), 0, Math.cos(seq.yaw));

    if (seq.phase === 'lock') {
      this.poseState = { kind: 'rush', t: Math.min(1, seq.t / TROUBLE_LOCK), weight: 1 };
      if (seq.t >= TROUBLE_LOCK) {
        seq.phase = 'cut';
        seq.t = 0;
        if (target) {
          const behind = this.placeBehind(target, seq.yaw);
          seq.clone = this.makeEcho(behind, seq.yaw, 0, 0.85, target);
          seq.clone.yaw = Math.atan2(target.pos.x - behind.x, target.pos.z - behind.z);
        } else {
          const side = this.placeAround(ctx.pos, seq.yaw, 1.2, 0.2);
          seq.clone = this.makeEcho(side, seq.yaw, 0, 0.7, null);
        }
        this.echoes.push(seq.clone);
        seq.clone.fighter.humanoid.group.scale.setScalar(1);
        setHumanoidOpacity(seq.clone.fighter.humanoid, DUP_OPACITY);
        seq.clone.style = 'slash';
        seq.clone.meleeStarted = true;
        seq.clone.meleeT = 1;
        seq.clone.state = 'attack';
        seq.clone.swung = true;
        seq.clone.landed = true;
        ctx.strike('slash');
        ctx.sound('rubi.trouble.cut');
      }
      return;
    }

    if (seq.phase === 'cut') {
      this.poseState = null;
      const dist = target ? Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z) : 0;
      const need = target ? Math.max(0, dist - 1.7 - target.radius) : 0;
      if (need > 0.05) {
        ctx.pos.addScaledVector(_fwd, Math.min(need, 28 * dt));
        ctx.resolve(ctx.pos);
        ctx.afterimages.spawn(0.14, 0.2);
      }
      if (!seq.hit && seq.t >= TROUBLE_HIT_AT) {
        seq.hit = true;
        this.troubleImpact(seq, _fwd);
      }
      if (seq.clone && seq.t > 0.18 && seq.clone.state !== 'dissolve') {
        seq.clone.state = 'dissolve';
        seq.clone.spawnT = 0;
      }
      if (seq.t >= TROUBLE_CUT) {
        seq.phase = 'recover';
        seq.t = 0;
      }
      return;
    }

    this.poseState = { kind: 'guard', t: Math.min(1, seq.t / TROUBLE_RECOVER), weight: 1 - seq.t / TROUBLE_RECOVER };
    if (seq.t >= TROUBLE_RECOVER) {
      this.seq = null;
      this.poseState = null;
      this.swordWant = this.duplicating ? 0.45 : 0;
      ctx.sound('rubi.trouble.end');
    }
  }

  private troubleImpact(seq: Extract<Sequence, { kind: 'trouble' }>, fwd: THREE.Vector3) {
    const ctx = this.ctx!;
    const target = seq.target;
    const dmg = ctx.meleeDamage() * TROUBLE_DAMAGE;
    if (target && target.hp > 0) {
      ctx.hurt(target, dmg, fwd, 'heavy', 1.15);
      ctx.hurt(target, dmg, fwd.clone().multiplyScalar(-1), 'stagger', 0.85);
      ctx.flash(target, CRIMSON, 0.22);
      this.marks.cross(target);
      ctx.rings.spawn(target.pos, ctx.spec.color, { radius: 2.8, duration: 0.36, y: 1.05 });
      ctx.particles.emit(target.pos.clone().setY(1.2), 0xffffff, 16, { speed: 7, size: 0.24, life: 0.22 });
      ctx.particles.emit(target.pos.clone().setY(1.2), ctx.spec.color, 12, { speed: 5, size: 0.2, life: 0.28, up: 0.4 });
      ctx.camera.addShake(0.34);
      ctx.hitStop(0.06);
      ctx.power.boost(1.6);
    } else {
      ctx.particles.emit(ctx.pos.clone().addScaledVector(fwd, 1.2).setY(1.15), ctx.spec.color, 8, {
        speed: 5,
        size: 0.2,
        life: 0.2,
        direction: fwd,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Sword
  // ---------------------------------------------------------------------------

  private driveSword(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.seq && !this.duplicating) this.swordWant = Math.max(0, this.swordWant - dt * 1.6);
    this.swordGlow += (this.swordWant - this.swordGlow) * Math.min(1, dt * 10);
    const on = this.swordGlow > 0.04;
    this.playerBlade.group.visible = on;
    this.playerBlade.coreMat.opacity = this.swordGlow * 0.85;
    this.playerBlade.haloMat.opacity = this.swordGlow * 0.32;
    bladeTip(ctx.fighter(), _p);
    if (on) this.playerTrail.feed(_p);
    this.playerTrail.intensity = 0.7 + this.swordGlow * 0.7;
    this.playerTrail.update(dt, ctx.cameraObject);
  }
}
