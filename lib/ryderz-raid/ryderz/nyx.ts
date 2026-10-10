import * as THREE from 'three';
import type { AbilityId } from '../config';
import type { PoseOverride } from '../skeletal';
import { AirJumpFx, chestPoint, transferAhead } from './air-jump';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Agent Yesterday-Nyx. Her body is the supplied Mixamo GLB when it has loaded;
 * this kit does not invent a sword. The signature prop is a P.A.D. wrist guard
 * on the left forearm. Lore and the numbers below can be revised without
 * changing her id.
 *
 * Q Temporal Zap cases up to five enemies in front of her.
 * E Rewind Protocol slides her back along her own trail.
 * R Zero Hour slows enemies inside a field. It does not change the world's clock.
 */

const CYAN = 0x3de7ff;
const VIOLET = 0xb388ff;
const WHITE = 0xf4fbff;
const GRAPHITE = 0x1a1d22;
const SILVER = 0xc5ccd6;

const ZAP_RANGE = 16;
const ZAP_MAX = 5;
const ZAP_CONE = 0.35;
const ZAP_CHARGE = 0.42;
const ZAP_DAMAGE = 9;
const ZAP_BONUS = 4;
const HOLD_PVE = 4;
const HOLD_PVP = 1.5;
const IMMUNE_PVE = 2.8;
const IMMUNE_PVP = 3.5;
const ZAP_CD = 18;

const REWIND_WINDOW = 2.4;
const REWIND_SAMPLE = 0.08;
const REWIND_LOOKBACK = 1.5;
const REWIND_SLIDE = 0.4;
const HEAL_CAP = 24;
const HEAL_CAP_OVERDRIVE = 36;
const HEAL_FRACTION = 0.5;
const REWIND_CD = 12;
const DECOY_LIFE = 2;

const ZERO_WARN = 0.35;
const ZERO_TIME = 3.2;
const ZERO_RADIUS = 6.5;
const ZERO_RADIUS_OVERDRIVE = 8;
const SLOW_PVE = 0.45;
const SLOW_PVP = 0.72;
const ZERO_BURST = 12;
const ZERO_CD = 16;

const METER_MAX = 100;
const METER_HIT = 14;
const METER_DODGE = 12;
const METER_COUNTER = 16;
const METER_COMBO = 12;
const OVERDRIVE_TIME = 3.5;
const FINISHERS = new Set(['Temporal Sweep', "Yesterday's Revenge", 'Echo Execution', 'Palm Cross']);

const CUFF = new THREE.BoxGeometry(0.058, 0.09, 0.05);
const TRIM = new THREE.BoxGeometry(0.064, 0.016, 0.056);
const BUTTON = new THREE.BoxGeometry(0.016, 0.01, 0.012);
const EMITTER = new THREE.BoxGeometry(0.02, 0.016, 0.02);
const PANEL = new THREE.BoxGeometry(0.62, 1.35, 0.035);
const BEAM_GEO = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
const RING_GEO = new THREE.RingGeometry(0.86, 1, 40);
const SHARD_GEO = new THREE.BoxGeometry(0.16, 0.02, 0.16);

const _up = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();

type PaceBody = KitTarget & {
  speed?: number;
  attackScale?: number;
  striker?: { interrupt(): void };
};

interface SlowEntry {
  base: number;
  factors: Map<NyxKit, number>;
}

const slowState = new WeakMap<object, SlowEntry>();

function setSlow(owner: NyxKit, target: PaceBody, factor: number) {
  if (typeof target.speed !== 'number') return false;
  let entry = slowState.get(target);
  if (!entry) {
    entry = { base: target.speed, factors: new Map() };
    slowState.set(target, entry);
  }
  const first = !entry.factors.has(owner);
  entry.factors.set(owner, factor);
  let min = 1;
  for (const value of entry.factors.values()) min = Math.min(min, value);
  target.speed = entry.base * min;
  target.attackScale = min;
  return first;
}

function clearSlow(owner: NyxKit, target: object) {
  const entry = slowState.get(target);
  if (!entry) return;
  entry.factors.delete(owner);
  const body = target as PaceBody;
  if (entry.factors.size === 0) {
    if (typeof body.speed === 'number') body.speed = entry.base;
    delete body.attackScale;
    slowState.delete(target);
    return;
  }
  let min = 1;
  for (const value of entry.factors.values()) min = Math.min(min, value);
  if (typeof body.speed === 'number') body.speed = entry.base * min;
  body.attackScale = min;
}

interface Sample {
  x: number;
  z: number;
  yaw: number;
  hp: number;
  t: number;
}

interface Capture {
  target: KitTarget;
  left: number;
  casing: THREE.Group;
  beam: THREE.Mesh;
}

interface Zap {
  phase: 'charge' | 'hold';
  t: number;
  captures: Capture[];
  boosted: boolean;
}

interface Rewind {
  t: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  toYaw: number;
  snapHp: number;
  boosted: boolean;
  healed: boolean;
}

interface Zero {
  phase: 'warn' | 'field';
  t: number;
  radius: number;
  factor: number;
  slowed: Set<PaceBody>;
  rings: THREE.Mesh[];
  shards: THREE.Mesh[];
  burst: boolean;
}

interface Decoy {
  mesh: THREE.Group;
  life: number;
}

interface Fragment {
  mesh: THREE.Mesh;
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

const PALM: MeleeStep = {
  style: 'punch',
  damageMul: 0.92,
  hitDelay: 0.12,
  range: 2.15,
  halfArc: 0.85,
  reaction: 'stagger',
  strength: 0.85,
  recovery: 0.32,
  shake: 0.05,
  hitStop: 0,
  lunge: 0.2,
  sound: 'nyx.melee.punch',
};
const KNEE: MeleeStep = {
  style: 'kick',
  damageMul: 1.05,
  hitDelay: 0.14,
  range: 2.2,
  halfArc: 0.7,
  reaction: 'knockback',
  strength: 0.95,
  recovery: 0.36,
  shake: 0.08,
  hitStop: 0.02,
  lunge: 0.22,
  sound: 'nyx.melee.kick',
};
const ELBOW: MeleeStep = {
  style: 'chop',
  damageMul: 1.08,
  hitDelay: 0.13,
  range: 2.15,
  halfArc: 0.75,
  reaction: 'stagger',
  strength: 1,
  recovery: 0.34,
  shake: 0.08,
  hitStop: 0.02,
  lunge: 0.24,
  sound: 'nyx.melee.chop',
};
const BODY: MeleeStep = {
  style: 'smash',
  damageMul: 1.28,
  hitDelay: 0.16,
  range: 2.35,
  halfArc: 0.8,
  reaction: 'heavy',
  strength: 1.05,
  recovery: 0.46,
  shake: 0.14,
  hitStop: 0.03,
  lunge: 0.28,
  sound: 'nyx.melee.smash',
};
const STRIKES: MeleeStep[] = [PALM, KNEE, ELBOW, BODY];
const THROWS: MeleeStep[] = [
  { ...PALM, style: 'punch', damageMul: 1.15, reaction: 'launch', strength: 1.1, range: 1.7, halfArc: 0.9, sound: 'nyx.throw.impact', lunge: 0.16 },
  { ...BODY, style: 'smash', damageMul: 1.2, reaction: 'heavy', strength: 1.15, range: 1.7, halfArc: 0.9, sound: 'nyx.throw.impact', lunge: 0.18 },
  { ...KNEE, style: 'spinKick', damageMul: 1.18, reaction: 'knockback', strength: 1.2, range: 1.85, halfArc: 1.4, sound: 'nyx.throw.impact', lunge: 0.12 },
];
const COUNTER: MeleeStep = {
  style: 'spinKick',
  damageMul: 1.45,
  hitDelay: 0.1,
  range: 2.45,
  halfArc: 1.2,
  reaction: 'knockback',
  strength: 1.2,
  recovery: 0.4,
  shake: 0.16,
  hitStop: 0.04,
  lunge: 0.32,
  sound: 'nyx.counter.impact',
};

function clearLine(ctx: KitContext, target: KitTarget) {
  const dx = target.pos.x - ctx.pos.x;
  const dz = target.pos.z - ctx.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const steps = Math.max(1, Math.ceil(dist / 0.75));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ctx.pos.x + dx * t;
    const z = ctx.pos.z + dz * t;
    if (Math.hypot(x - target.pos.x, z - target.pos.z) <= target.radius + 0.35) continue;
    if (ctx.blocked(x, z, 0.2)) return false;
  }
  return true;
}

function makeCasing() {
  const group = new THREE.Group();
  group.name = 'NyxStasis';
  const panelMat = new THREE.MeshBasicMaterial({
    color: CYAN,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < 4; i += 1) {
    const panel = new THREE.Mesh(PANEL, panelMat);
    const angle = (i / 4) * Math.PI * 2;
    panel.position.set(Math.cos(angle) * 0.52, 0.72, Math.sin(angle) * 0.52);
    panel.lookAt(0, 0.72, 0);
    group.add(panel);
  }
  const scan = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.025, 1.2), edgeMat);
  scan.name = 'scan';
  scan.position.y = 0.35;
  group.add(scan);
  return group;
}

function makeDecoyMesh() {
  const group = new THREE.Group();
  group.name = 'NyxDecoy';
  const mat = new THREE.MeshBasicMaterial({
    color: VIOLET,
    transparent: true,
    opacity: 0.35,
    wireframe: true,
    depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), mat);
  body.position.y = 0.9;
  group.add(body);
  return group;
}

export class NyxKit implements RyderKit {
  private ctx: KitContext | null = null;
  private readonly guard = new THREE.Group();
  private readonly buttons: THREE.Mesh[] = [];
  private emitter: THREE.Mesh | null = null;
  private readonly mats: THREE.Material[] = [];
  private zap: Zap | null = null;
  private rewind: Rewind | null = null;
  private zero: Zero | null = null;
  private decoys: Decoy[] = [];
  private fragments: Fragment[] = [];
  private casingPool: THREE.Group[] = [];
  private history: Sample[] = [];
  private sampleWait = 0;
  private meter = 0;
  private overdriveT = 0;
  private counterUntil = 0;
  private comboRev = -1;
  private meleeN = 0;
  private throwN = 0;
  private poseState: PoseOverride | null = null;
  private immune = new WeakMap<KitTarget, number>();
  private fx: AirJumpFx | null = null;
  private veil = 0;
  private readonly chest = new THREE.Vector3();

  get locked() {
    return this.rewind !== null || this.zap?.phase === 'charge';
  }

  get airY() {
    return 0;
  }

  get pose() {
    return this.poseState;
  }

  get glow() {
    if (this.overdriveT > 0) return 0.72;
    if (this.rewind) return 0.8;
    if (this.zap) return 0.5;
    if (this.zero) return 0.4;
    return 0;
  }

  get resonance() {
    return this.meter;
  }

  get moveScale() {
    return this.overdriveT > 0 ? 1.14 : 1;
  }

  get opacity() {
    return this.veil > 0 ? 0.04 : 1;
  }

  get haste() {
    return this.overdriveT > 0 ? 1.12 : 1;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    this.buildGuard();
    this.mountGuard();
    this.fx = new AirJumpFx(ctx.scene);
    this.veil = 0;
  }

  detach() {
    this.releaseAll();
    this.guard.removeFromParent();
    this.disposeLoose();
    this.mats.forEach((mat) => mat.dispose());
    this.fx?.clear();
    this.fx = null;
    this.veil = 0;
    this.ctx = null;
  }

  interrupt() {
    this.releaseAll();
    this.veil = 0;
    this.fx?.clear();
  }

  onRound() {
    this.releaseAll();
    this.meter = 0;
    this.overdriveT = 0;
    this.history = [];
    this.sampleWait = 0;
    this.counterUntil = 0;
    this.immune = new WeakMap();
  }

  onDodge() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.counterUntil = ctx.time() + 0.45;
    if (this.overdriveT <= 0) this.meter = Math.min(METER_MAX, this.meter + METER_DODGE);
    ctx.afterimages.spawn(0.55, 0.28, CYAN);
    ctx.sound('nyx.dodge.swing');
    ctx.particles.emit(ctx.pos.clone().setY(1), VIOLET, 8, { speed: 4, size: 0.18, life: 0.3, up: 0.4 });
  }

  noteHit() {
    if (this.overdriveT > 0 || !this.ctx) return;
    let gain = METER_HIT;
    if (this.ctx.time() < this.counterUntil) {
      gain += METER_COUNTER;
      this.counterUntil = 0;
      this.ctx.sound('nyx.counter.impact');
    }
    this.meter = Math.min(METER_MAX, this.meter + gain);
  }

  noteCombo(snap: { recipeId: string | null; label: string; revision: number }) {
    if (!snap.recipeId || !FINISHERS.has(snap.label) || snap.revision === this.comboRev) return;
    this.comboRev = snap.revision;
    if (this.overdriveT <= 0) {
      this.meter = Math.min(METER_MAX, this.meter + METER_COMBO);
      return;
    }
    const ctx = this.ctx;
    const target = this.nearest(3.2);
    if (!ctx || !target) return;
    _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
    if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    _dir.normalize();
    ctx.hurt(target, 4, _dir, 'stagger', 0.6);
    ctx.particles.emit(target.pos.clone().setY(1.1), CYAN, 10, { speed: 5, size: 0.2, life: 0.28, up: 0.5 });
    ctx.sound('nyx.echo.hit');
  }

  melee(): MeleeStep | null {
    if (this.locked || !this.ctx) return null;
    if (this.ctx.time() < this.counterUntil) {
      this.counterUntil = 0;
      if (this.overdriveT <= 0) this.meter = Math.min(METER_MAX, this.meter + METER_COUNTER);
      this.ctx.sound('nyx.counter.impact');
      return COUNTER;
    }
    const close = this.nearest(1.55);
    if (close && this.meleeN % 3 === 2) {
      const step = THROWS[this.throwN % THROWS.length];
      this.throwN += 1;
      this.meleeN += 1;
      return step;
    }
    const step = STRIKES[this.meleeN % STRIKES.length];
    this.meleeN += 1;
    return step;
  }

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    if (id === 'temporalZap') {
      if (this.zap || this.locked) {
        this.refund('temporalZap');
        return true;
      }
      this.zap = { phase: 'charge', t: 0, captures: [], boosted: false };
      this.ctx.sound('nyx.zap.swing');
      return true;
    }
    if (id === 'rewindProtocol') {
      if (this.rewind || this.zap?.phase === 'charge') {
        this.refund('rewindProtocol');
        return true;
      }
      const sample = this.safeSample();
      if (!sample) {
        this.refund('rewindProtocol');
        return true;
      }
      const boosted = this.armOverdrive();
      this.spawnDecoy(this.ctx.pos.x, this.ctx.pos.z);
      this.rewind = {
        t: 0,
        fromX: this.ctx.pos.x,
        fromZ: this.ctx.pos.z,
        toX: sample.x,
        toZ: sample.z,
        toYaw: sample.yaw,
        snapHp: sample.hp,
        boosted,
        healed: false,
      };
      this.ctx.cooldown('rewindProtocol', REWIND_CD);
      this.ctx.sound('nyx.rewind.swing');
      this.ctx.iframes(0.35);
      return true;
    }
    if (id === 'zeroHour') {
      if (this.zero) {
        this.refund('zeroHour');
        return true;
      }
      const boosted = this.armOverdrive();
      const pvp = this.ctx.pvp?.() ?? false;
      this.zero = {
        phase: 'warn',
        t: 0,
        radius: boosted ? ZERO_RADIUS_OVERDRIVE : ZERO_RADIUS,
        factor: pvp ? SLOW_PVP : SLOW_PVE,
        slowed: new Set(),
        rings: this.spawnRings(),
        shards: this.spawnShards(),
        burst: false,
      };
      this.ctx.cooldown('zeroHour', ZERO_CD);
      this.ctx.sound('nyx.zero.swing');
      return true;
    }
    return false;
  }

  tryAirJump(sinceJump: number, _height = 0) {
    const ctx = this.ctx;
    if (!ctx || this.locked || sinceJump > 0.9) return false;
    const from = transferAhead(ctx, 11, 18);
    if (!from) return false;
    this.fx?.vortex(chestPoint(ctx, from.x, from.z, this.chest).clone());
    this.fx?.vortex(chestPoint(ctx, ctx.pos.x, ctx.pos.z, this.chest).clone());
    ctx.particles.emit(chestPoint(ctx, from.x, from.z, this.chest), 0x3de7ff, 14, { speed: 3, size: 0.12, life: 0.4, spread: 0.6, up: 1.8 });
    ctx.particles.emit(chestPoint(ctx, ctx.pos.x, ctx.pos.z, this.chest), 0xb388ff, 14, { speed: 3, size: 0.12, life: 0.4, spread: 0.6, up: 1.8 });
    this.veil = 0.2;
    ctx.iframes(0.22);
    ctx.sound('nyx.vortex.swing');
    ctx.camera.addShake(0.1);
    return true;
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.guard.parent) this.mountGuard();
    if (this.overdriveT > 0) this.overdriveT = Math.max(0, this.overdriveT - frame.dt);
    this.record(frame);
    this.stepZap(frame);
    this.stepRewind(frame);
    this.stepZero(frame);
    this.stepDecoys(frame.dt);
    this.stepFragments(frame.dt);
    this.pressButtons();
    this.poseState = this.poseFor();
    if (this.veil > 0) this.veil = Math.max(0, this.veil - frame.dt);
    this.fx?.step(frame.dt);
  }

  private poseFor(): PoseOverride | null {
    if (this.rewind) return { kind: 'channel', t: Math.min(1, this.rewind.t / REWIND_SLIDE), weight: 0.9 };
    if (this.zap?.phase === 'charge') return { kind: 'cast', t: Math.min(1, this.zap.t / ZAP_CHARGE), weight: 0.85 };
    if (this.zero?.phase === 'warn') return { kind: 'channel', t: Math.min(1, this.zero.t / ZERO_WARN), weight: 0.7 };
    return null;
  }

  private record(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx || this.rewind) return;
    this.sampleWait += frame.dt;
    if (this.sampleWait < REWIND_SAMPLE) return;
    this.sampleWait = 0;
    const vitals = ctx.vitals?.() ?? { hp: 0, maxHp: 1 };
    this.history.push({ x: ctx.pos.x, z: ctx.pos.z, yaw: ctx.yaw(), hp: vitals.hp, t: frame.time });
    const cutoff = frame.time - REWIND_WINDOW;
    while (this.history.length && this.history[0].t < cutoff) this.history.shift();
  }

  private safeSample() {
    const ctx = this.ctx;
    if (!ctx || this.history.length < 2) return null;
    const now = ctx.time();
    if (now - this.history[0].t < 0.4) return null;
    const want = now - REWIND_LOOKBACK;
    const ranked = [...this.history].sort((a, b) => Math.abs(a.t - want) - Math.abs(b.t - want));
    for (const sample of ranked) {
      if (now - sample.t < 0.35) continue;
      if (!ctx.blocked(sample.x, sample.z, ctx.radius)) return sample;
    }
    return null;
  }

  private stepZap(frame: KitFrame) {
    const zap = this.zap;
    const ctx = this.ctx;
    if (!zap || !ctx) return;
    zap.t += frame.dt;
    if (zap.phase === 'charge') {
      ctx.particles.emit(this.guardOrigin(), CYAN, 4, { speed: 2.5, size: 0.12, life: 0.2, up: 0.6 });
      if (zap.t < ZAP_CHARGE) return;
      const picked = this.acquire();
      if (!picked.length) {
        this.refund('temporalZap');
        this.zap = null;
        return;
      }
      zap.boosted = this.armOverdrive();
      zap.phase = 'hold';
      zap.t = 0;
      const damage = ZAP_DAMAGE + (zap.boosted ? ZAP_BONUS : 0);
      const duration = (ctx.pvp?.() ?? false) ? HOLD_PVP : HOLD_PVE;
      for (const target of picked) {
        _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
        _dir.normalize();
        ctx.hurt(target, damage, _dir, 'stagger', 0.45);
        (target as PaceBody).striker?.interrupt();
        this.pin(target, duration);
        const casing = this.takeCasing(target);
        const beam = this.makeBeam();
        ctx.scene.add(casing, beam);
        zap.captures.push({ target, left: duration, casing, beam });
        ctx.particles.emit(target.pos.clone().setY(1.1), CYAN, 12, { speed: 6, size: 0.18, life: 0.35, up: 0.8 });
      }
      ctx.cooldown('temporalZap', ZAP_CD);
      ctx.sound('nyx.zap.hit');
      ctx.hitStop(0.04);
      return;
    }
    const origin = this.guardOrigin();
    for (const capture of [...zap.captures]) {
      if (capture.target.hp <= 0) {
        this.dropCapture(capture, true);
        continue;
      }
      capture.left = Math.max(0, capture.left - frame.dt);
      this.placeCasing(capture, frame.time);
      this.aimBeam(capture.beam, origin, capture.target);
      if (capture.left <= 0) this.dropCapture(capture, true);
      else this.pin(capture.target, capture.left);
    }
    if (!zap.captures.length) this.zap = null;
  }

  private acquire() {
    const ctx = this.ctx;
    if (!ctx) return [];
    const yaw = ctx.yaw();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const now = ctx.time();
    const found: Array<{ target: KitTarget; ahead: number; dist: number }> = [];
    const seen = new Set<KitTarget>();
    for (const target of ctx.targets()) {
      if (seen.has(target)) continue;
      if (!(ctx.canHit?.(target) ?? target.hp > 0)) continue;
      if (target.hp <= 0 || target.held > 0.05) continue;
      if ((this.immune.get(target) ?? 0) > now) continue;
      const dx = target.pos.x - ctx.pos.x;
      const dz = target.pos.z - ctx.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4 || dist > ZAP_RANGE) continue;
      const ahead = (dx * fx + dz * fz) / dist;
      if (ahead < ZAP_CONE) continue;
      if (!clearLine(ctx, target)) continue;
      seen.add(target);
      found.push({ target, ahead, dist });
    }
    found.sort((a, b) => b.ahead - a.ahead || a.dist - b.dist);
    return found.slice(0, ZAP_MAX).map((entry) => entry.target);
  }

  private stepRewind(frame: KitFrame) {
    const rewind = this.rewind;
    const ctx = this.ctx;
    if (!rewind || !ctx) return;
    rewind.t += frame.dt;
    const t = Math.min(1, rewind.t / REWIND_SLIDE);
    const x = rewind.fromX + (rewind.toX - rewind.fromX) * t;
    const z = rewind.fromZ + (rewind.toZ - rewind.fromZ) * t;
    if (!ctx.blocked(x, z, ctx.radius)) {
      ctx.pos.x = x;
      ctx.pos.z = z;
      ctx.resolve(ctx.pos);
    }
    ctx.turn(rewind.toYaw);
    ctx.particles.emit(ctx.pos.clone().setY(1), VIOLET, 6, { speed: 3, size: 0.16, life: 0.35, up: 1.2 });
    ctx.afterimages.spawn(0.28, 0.22, VIOLET);
    if (t < 1) return;
    if (!rewind.healed) {
      rewind.healed = true;
      const vitals = ctx.vitals?.();
      if (vitals) {
        const lost = Math.max(0, rewind.snapHp - vitals.hp);
        const cap = rewind.boosted ? HEAL_CAP_OVERDRIVE : HEAL_CAP;
        ctx.heal(Math.min(cap, lost * HEAL_FRACTION));
        const hp = ctx.vitals?.().hp ?? vitals.hp;
        for (const sample of this.history) sample.hp = Math.min(sample.hp, hp);
      }
    }
    this.rewind = null;
  }

  private stepZero(frame: KitFrame) {
    const zero = this.zero;
    const ctx = this.ctx;
    if (!zero || !ctx) return;
    zero.t += frame.dt;
    const warn = zero.phase === 'warn';
    const open = warn ? Math.min(1, zero.t / ZERO_WARN) : 1;
    this.placeField(zero, open, frame.time);
    if (warn) {
      if (zero.t >= ZERO_WARN) {
        zero.phase = 'field';
        zero.t = 0;
      }
      return;
    }
    const inside = new Set<PaceBody>();
    for (const target of ctx.targets()) {
      if (target.hp <= 0) continue;
      if (!(ctx.canHit?.(target) ?? true)) continue;
      const dist = Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z);
      if (dist > zero.radius + target.radius) continue;
      const body = target as PaceBody;
      inside.add(body);
      if (typeof body.speed === 'number') {
        const first = setSlow(this, body, zero.factor);
        if (first) body.striker?.interrupt();
        zero.slowed.add(body);
      } else ctx.suppress?.(zero.factor);
    }
    for (const body of [...zero.slowed]) {
      if (!inside.has(body)) {
        clearSlow(this, body);
        zero.slowed.delete(body);
      }
    }
    if (zero.t < ZERO_TIME) return;
    if (!zero.burst) {
      zero.burst = true;
      for (const target of inside) {
        _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
        _dir.normalize();
        ctx.hurt(target, ZERO_BURST, _dir, 'stagger', 0.8);
      }
      ctx.rings.spawn(ctx.pos.clone(), VIOLET, { radius: zero.radius, duration: 0.4, y: 0.2 });
      ctx.sound('nyx.zero.hit');
      ctx.particles.emit(ctx.pos.clone().setY(1), CYAN, 18, { speed: 7, size: 0.24, life: 0.4, up: 0.6 });
    }
    this.endZero();
  }

  private endZero() {
    const zero = this.zero;
    if (!zero) return;
    for (const body of zero.slowed) clearSlow(this, body);
    zero.slowed.clear();
    for (const ring of zero.rings) {
      ring.removeFromParent();
      (ring.material as THREE.Material).dispose();
    }
    for (const shard of zero.shards) shard.removeFromParent();
    this.zero = null;
  }

  private pin(target: KitTarget, seconds: number) {
    if (this.ctx?.hold) this.ctx.hold(target, seconds);
    else target.held = Math.max(0, seconds);
    if (seconds > 0) {
      target.knock.set(0, 0, 0);
      target.airVel = 0;
    }
  }

  private dropCapture(capture: Capture, grantImmune: boolean) {
    const ctx = this.ctx;
    if (!this.zap) return;
    this.zap.captures = this.zap.captures.filter((item) => item !== capture);
    this.pin(capture.target, 0);
    if (grantImmune && ctx) {
      const pause = (ctx.pvp?.() ?? false) ? IMMUNE_PVP : IMMUNE_PVE;
      this.immune.set(capture.target, ctx.time() + pause);
    }
    this.burstFragments(capture.target);
    capture.beam.removeFromParent();
    capture.casing.removeFromParent();
    this.casingPool.push(capture.casing);
    ctx?.sound('nyx.zap.release');
  }

  private releaseAll() {
    if (this.zap) {
      for (const capture of [...this.zap.captures]) this.dropCapture(capture, true);
      this.zap = null;
    }
    this.rewind = null;
    this.endZero();
  }

  private armOverdrive() {
    if (this.meter < METER_MAX || this.overdriveT > 0) return false;
    this.meter = 0;
    this.overdriveT = OVERDRIVE_TIME;
    this.ctx?.sound('nyx.overdrive.hit');
    return true;
  }

  private refund(id: AbilityId) {
    const cost = this.ctx?.spec.moves.find((move) => move.id === id)?.auraCost ?? 0;
    if (cost > 0) this.ctx?.gainAura(cost);
  }

  private nearest(range: number) {
    const ctx = this.ctx;
    if (!ctx) return null;
    let best: KitTarget | null = null;
    let bestD = range;
    for (const target of ctx.targets()) {
      if (target.hp <= 0) continue;
      if (ctx.canHit && !ctx.canHit(target)) continue;
      const dist = Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z);
      if (dist <= bestD) {
        best = target;
        bestD = dist;
      }
    }
    return best;
  }

  private buildGuard() {
    if (this.guard.children.length) return;
    this.guard.name = 'NyxWristGuard';
    const cuffMat = new THREE.MeshBasicMaterial({ color: GRAPHITE });
    const silverMat = new THREE.MeshBasicMaterial({ color: SILVER });
    const emitMat = new THREE.MeshBasicMaterial({ color: CYAN });
    this.mats.push(cuffMat, silverMat, emitMat);
    const cuff = new THREE.Mesh(CUFF, cuffMat);
    const trim = new THREE.Mesh(TRIM, silverMat);
    trim.position.y = 0.02;
    const emitter = new THREE.Mesh(EMITTER, emitMat);
    emitter.position.set(0, 0.05, 0.01);
    this.emitter = emitter;
    const colors = [CYAN, VIOLET, WHITE];
    colors.forEach((color, index) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      this.mats.push(mat);
      const button = new THREE.Mesh(BUTTON, mat);
      button.position.set((index - 1) * 0.02, 0.012, 0.028);
      button.userData.restZ = button.position.z;
      this.buttons.push(button);
      this.guard.add(button);
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: VIOLET,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 16), ringMat);
    ring.position.set(0, -0.02, 0.028);
    this.guard.add(cuff, trim, emitter, ring);
  }

  private mountGuard() {
    const fighter = this.ctx?.fighter();
    if (!fighter) return;
    const arm = fighter.rig?.skeleton?.bone('lowerArmL') ?? null;
    const hand = fighter.rig?.skeleton?.bone('handL') ?? null;
    const anchor = arm ?? fighter.humanoid.handL;
    if (!anchor || this.guard.parent === anchor) return;
    this.guard.removeFromParent();
    anchor.add(this.guard);
    if (arm && hand && hand.position.lengthSq() > 1e-4) this.guard.position.copy(hand.position).multiplyScalar(0.78);
    else this.guard.position.set(0, 0.2, 0.04);
  }

  private pressButtons() {
    const down = [this.zap !== null, this.rewind !== null, this.zero !== null];
    this.buttons.forEach((button, index) => {
      const rest = (button.userData.restZ as number) ?? button.position.z;
      button.position.z = down[index] ? rest - 0.01 : rest;
    });
    if (this.emitter) {
      const hot = this.zap?.phase === 'charge' || this.overdriveT > 0;
      (this.emitter.material as THREE.MeshBasicMaterial).color.setHex(hot ? WHITE : CYAN);
    }
  }

  private guardOrigin() {
    if (this.guard.parent) {
      this.guard.getWorldPosition(_from);
      return _from;
    }
    const ctx = this.ctx;
    return _from.set(ctx?.pos.x ?? 0, (ctx?.pos.y ?? 0) + 1.2, ctx?.pos.z ?? 0);
  }

  private takeCasing(target: KitTarget) {
    const casing = this.casingPool.pop() ?? makeCasing();
    const scale = Math.max(0.85, target.radius * 2.15);
    casing.scale.set(scale, Math.max(1, target.radius * 2.3), scale);
    return casing;
  }

  private placeCasing(capture: Capture, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const y = ctx.heightAt(capture.target.pos.x, capture.target.pos.z);
    capture.casing.position.set(capture.target.pos.x, y, capture.target.pos.z);
    const scan = capture.casing.getObjectByName('scan');
    if (scan) scan.position.y = 0.25 + ((time * 0.85) % 1) * 1.15;
  }

  private makeBeam() {
    const mat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, depthWrite: false });
    this.mats.push(mat);
    const beam = new THREE.Mesh(BEAM_GEO, mat);
    beam.name = 'NyxBeam';
    return beam;
  }

  private aimBeam(beam: THREE.Mesh, from: THREE.Vector3, target: KitTarget) {
    const y = (this.ctx?.heightAt(target.pos.x, target.pos.z) ?? 0) + 1;
    _to.set(target.pos.x, y, target.pos.z);
    _dir.copy(_to).sub(from);
    const dist = Math.max(0.2, _dir.length());
    _mid.copy(from).add(_to).multiplyScalar(0.5);
    beam.position.copy(_mid);
    beam.scale.set(1, dist, 1);
    beam.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / dist));
  }

  private burstFragments(target: KitTarget) {
    const ctx = this.ctx;
    if (!ctx) return;
    const y = ctx.heightAt(target.pos.x, target.pos.z) + 1;
    for (let i = 0; i < 6; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? CYAN : WHITE, transparent: true, opacity: 0.8, depthWrite: false });
      this.mats.push(mat);
      const mesh = new THREE.Mesh(SHARD_GEO, mat);
      mesh.position.set(target.pos.x, y, target.pos.z);
      mesh.scale.setScalar(0.35);
      ctx.scene.add(mesh);
      this.fragments.push({
        mesh,
        life: 0.42,
        vx: (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 3,
      });
    }
  }

  private stepFragments(dt: number) {
    for (const bit of this.fragments) {
      bit.life -= dt;
      bit.mesh.position.x += bit.vx * dt;
      bit.mesh.position.y += bit.vy * dt;
      bit.mesh.position.z += bit.vz * dt;
      bit.vy -= dt * 4;
    }
    this.fragments = this.fragments.filter((bit) => {
      if (bit.life > 0) return true;
      bit.mesh.removeFromParent();
      return false;
    });
  }

  private spawnDecoy(x: number, z: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const mesh = makeDecoyMesh();
    mesh.position.set(x, ctx.heightAt(x, z), z);
    ctx.scene.add(mesh);
    this.decoys.push({ mesh, life: DECOY_LIFE });
  }

  private stepDecoys(dt: number) {
    for (const decoy of this.decoys) decoy.life -= dt;
    this.decoys = this.decoys.filter((decoy) => {
      if (decoy.life > 0) return true;
      decoy.mesh.removeFromParent();
      return false;
    });
  }

  private spawnRings() {
    const ctx = this.ctx;
    if (!ctx) return [];
    return [0, 1, 2].map((index) => {
      const mat = new THREE.MeshBasicMaterial({
        color: index === 1 ? CYAN : VIOLET,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.mats.push(mat);
      const ring = new THREE.Mesh(RING_GEO, mat);
      ring.name = 'NyxZeroRing';
      ring.rotation.x = -Math.PI / 2;
      ctx.scene.add(ring);
      return ring;
    });
  }

  private spawnShards() {
    const ctx = this.ctx;
    if (!ctx) return [];
    return [0, 1, 2, 3, 4, 5].map(() => {
      const mat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.7, depthWrite: false });
      this.mats.push(mat);
      const shard = new THREE.Mesh(SHARD_GEO, mat);
      shard.name = 'NyxShard';
      ctx.scene.add(shard);
      return shard;
    });
  }

  private placeField(zero: Zero, open: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const y = ctx.heightAt(ctx.pos.x, ctx.pos.z);
    zero.rings.forEach((ring, index) => {
      const radius = zero.radius * open * (0.55 + index * 0.22);
      ring.position.set(ctx.pos.x, y + 0.08 + index * 0.06, ctx.pos.z);
      ring.scale.setScalar(Math.max(0.2, radius));
    });
    zero.shards.forEach((shard, index) => {
      const angle = time * 0.8 + (index / zero.shards.length) * Math.PI * 2;
      const radius = zero.radius * open * 0.72;
      shard.position.set(ctx.pos.x + Math.cos(angle) * radius, y + 0.35 + Math.sin(time * 2 + index) * 0.15, ctx.pos.z + Math.sin(angle) * radius);
    });
  }

  private disposeLoose() {
    for (const casing of this.casingPool) casing.removeFromParent();
    this.casingPool = [];
    for (const decoy of this.decoys) decoy.mesh.removeFromParent();
    this.decoys = [];
    for (const bit of this.fragments) bit.mesh.removeFromParent();
    this.fragments = [];
  }
}
