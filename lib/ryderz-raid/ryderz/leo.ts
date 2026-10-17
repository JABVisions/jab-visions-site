import * as THREE from 'three';
import type { AbilityId } from '../config';
import { HitSet, sortByDistance, targetsAlongSegment, targetsInArc, targetsInRadius } from '../combat';
import { TrailRibbon } from '../speed-vfx';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Leo Montana — the Yellow Ryder. Super speed + kinetic impact.
 *
 * Everything here is Leo's own tuning; the mechanics (hit queries, reactions,
 * trails, afterimages, decals) come from the shared modules so another Ryder
 * can be built from the same parts with a completely different feel.
 */

const DEBRIS = 0x5a5160;

/** Leo's four-hit chain: left jab, right spiked cross, spinning kick, spiked-knuckle smash. */
const COMBO: MeleeStep[] = [
  { style: 'punch', damageMul: 0.75, hitDelay: 0.13, range: 2.35, halfArc: 0.8, reaction: 'stagger', strength: 1, recovery: 0.26, shake: 0.05, hitStop: 0, lunge: 0.25, sound: 'leo.melee.jab' },
  { style: 'punchR', damageMul: 0.9, hitDelay: 0.13, range: 2.45, halfArc: 0.8, reaction: 'stagger', strength: 1.25, recovery: 0.28, shake: 0.08, hitStop: 0.02, lunge: 0.3, sound: 'leo.melee.cross' },
  { style: 'spinKick', damageMul: 1.1, hitDelay: 0.16, range: 2.7, halfArc: Math.PI, reaction: 'knockback', strength: 1, recovery: 0.34, shake: 0.14, hitStop: 0.03, lunge: 0.15, sound: 'leo.melee.spinkick' },
  { style: 'smash', damageMul: 1.65, hitDelay: 0.17, range: 2.9, halfArc: 0.75, reaction: 'heavy', strength: 1.1, recovery: 0.46, shake: 0.3, hitStop: 0.06, lunge: 0.45, sound: 'leo.melee.smash' },
];
/** Seconds after a swing finishes before the chain resets to the jab. */
const COMBO_WINDOW = 1.05;

// Kinetic Crack
const CRACK_COMPRESS = 0.2;
const CRACK_LAUNCH = 0.42;
const CRACK_HANG = 0.14;
const CRACK_DIVE = 0.2;
const CRACK_SLAM = 0.46;
const CRACK_APEX = 4.6;
const CRACK_RADIUS = 5.2;
const CRACK_DAMAGE = 36;
const CRACK_MAX_REACH = 7.5;

// Overdrive
const OVERDRIVE_SEEK = 15;
const OVERDRIVE_MAX_TARGETS = 6;
const OVERDRIVE_SPEED = 34;
const OVERDRIVE_HIT = 13;
const OVERDRIVE_FINISH = 0.95;
const OVERDRIVE_DETONATE_AT = 0.24;

// Pride Rush
const RUSH_DURATION = 0.62;
const RUSH_SPEED_START = 12;
const RUSH_SPEED_END = 31;
const RUSH_WIDTH = 1.0;
const RUSH_HIT = 20;
const RUSH_FINISHER = 32;

type Sequence =
  | { kind: 'crack'; phase: 'compress' | 'launch' | 'hang' | 'dive' | 'slam'; t: number; from: THREE.Vector3; to: THREE.Vector3 }
  | {
      kind: 'overdrive';
      segments: Array<{ from: THREE.Vector3; to: THREE.Vector3; target: KitTarget | null; passAt: number }>;
      index: number;
      t: number;
      duration: number;
      hit: boolean;
      finishing: number;
      detonated: boolean;
      imaged: number;
    }
  | { kind: 'rush'; t: number; prev: THREE.Vector3; blockedFrames: number; lastHit: KitTarget | null; imageT: number; done: boolean; finishT: number };

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _hits: KitTarget[] = [];

export class LeoKit implements RyderKit {
  private ctx: KitContext | null = null;
  private seq: Sequence | null = null;
  private poseState: PoseOverride | null = null;
  private air = 0;
  private trail: TrailRibbon;
  private marks = new Map<KitTarget, number>();
  private rushHits = new HitSet<KitTarget>();
  private comboIndex = 0;
  private comboExpires = 0;
  private momentum = 0;
  private footArcT = 0;
  private handArcT = 0;
  private imageT = 0;

  constructor() {
    this.trail = new TrailRibbon(0xffd400, { life: 0.26, width: 0.26, spacing: 0.1 });
  }

  get locked() {
    return this.seq !== null;
  }

  get airY() {
    return this.air;
  }

  get pose() {
    return this.poseState;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    this.trail.setColor(ctx.spec.visual.electricityColor);
    ctx.scene.add(this.trail.mesh);
    const fighter = ctx.fighter();
    if (fighter) ctx.afterimages.bind(fighter, ctx.spec.visual.electricityColor);
    this.momentum = 0;
    this.comboIndex = 0;
  }

  detach() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.scene.remove(this.trail.mesh);
      this.ctx.afterimages.unbind();
    }
    this.trail.clear();
    this.ctx = null;
  }

  interrupt() {
    this.seq = null;
    this.poseState = null;
    this.air = 0;
    this.marks.clear();
    this.rushHits.clear();
    this.trail.intensity = 0;
  }

  // ---------------------------------------------------------------------------
  // Melee chain
  // ---------------------------------------------------------------------------

  melee(time: number): MeleeStep | null {
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + COMBO_WINDOW;
    this.ctx?.power.boost(this.comboIndex === 0 ? 1.4 : 0.7 + 0.25 * this.comboIndex);
    this.ctx?.power.arcAt(['handL', 'handR'], 1, 0.8, 0.12, 0.03);
    return step;
  }

  // ---------------------------------------------------------------------------
  // Abilities
  // ---------------------------------------------------------------------------

  tryAbility(id: AbilityId) {
    if (!this.ctx || this.seq) return false;
    if (id === 'shockwave') return this.startCrack();
    if (id === 'overdrive') return this.startOverdrive();
    if (id === 'prideDash') return this.startRush();
    return false;
  }

  private startCrack() {
    const ctx = this.ctx!;
    const from = ctx.pos.clone();
    // Land where the crosshair meets the ground, within reach; otherwise on
    // the nearest host ahead; otherwise a few metres forward.
    const to = from.clone();
    ctx.lookDir(_dir);
    let picked = false;
    if (_dir.y < -0.05) {
      const t = -1.25 / _dir.y;
      _p.set(from.x + _dir.x * t, 0, from.z + _dir.z * t);
      const d = Math.hypot(_p.x - from.x, _p.z - from.z);
      if (d <= CRACK_MAX_REACH && d >= 1.2) {
        to.copy(_p);
        picked = true;
      }
    }
    if (!picked) {
      const ahead = targetsInArc(ctx.targets(), from, ctx.yaw(), CRACK_MAX_REACH, 0.7, _hits);
      if (ahead.length) {
        to.copy(sortByDistance(ahead, from)[0].pos);
        picked = true;
      }
    }
    if (!picked) {
      const yaw = ctx.yaw();
      to.set(from.x + Math.sin(yaw) * 4.2, 0, from.z + Math.cos(yaw) * 4.2);
    }
    // Pull the landing back along the path until it is clear of geometry.
    for (let i = 0; i < 8 && ctx.blocked(to.x, to.z, 0.65); i += 1) to.lerp(from, 0.2);
    to.y = 0;
    from.y = 0;

    this.seq = { kind: 'crack', phase: 'compress', t: 0, from, to };
    ctx.iframes(CRACK_COMPRESS + CRACK_LAUNCH + CRACK_HANG + CRACK_DIVE + 0.25);
    ctx.camera.addKick(0.2);
    ctx.sound('leo.crack.compress');
    return true;
  }

  private startOverdrive() {
    const ctx = this.ctx!;
    const start = ctx.pos.clone().setY(0);
    const pool = targetsInRadius(ctx.targets(), start, OVERDRIVE_SEEK, []).filter((t) => t.hp > 0);
    const chosen: KitTarget[] = [];
    const segments: Array<{ from: THREE.Vector3; to: THREE.Vector3; target: KitTarget | null; passAt: number }> = [];
    let cursor = start.clone();
    let lastDir = new THREE.Vector3(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    let side = 1;

    while (chosen.length < OVERDRIVE_MAX_TARGETS && pool.length) {
      // Greedy zigzag: nearest unvisited, with a preference for the far side
      // of the current travel line so the path really does zigzag.
      let best: KitTarget | null = null;
      let bestScore = Infinity;
      for (const t of pool) {
        _q.subVectors(t.pos, cursor).setY(0);
        const d = _q.length();
        if (d < 0.01) continue;
        const cross = lastDir.x * _q.z - lastDir.z * _q.x;
        const sameSide = Math.sign(cross) === side ? 1 : 0;
        const score = d + sameSide * 3 - Math.min(d, 2);
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best) break;
      pool.splice(pool.indexOf(best), 1);
      chosen.push(best);
      _dir.subVectors(best.pos, cursor).setY(0);
      const dist = _dir.length() || 0.01;
      _dir.divideScalar(dist);
      // Overshoot past the target, offset to alternate sides.
      const perp = new THREE.Vector3(-_dir.z, 0, _dir.x).multiplyScalar(side * 0.85);
      const to = best.pos.clone().setY(0).addScaledVector(_dir, best.radius + 1.15).add(perp);
      for (let i = 0; i < 6 && ctx.blocked(to.x, to.z, 0.5); i += 1) to.lerp(best.pos, 0.3).setY(0);
      const total = cursor.distanceTo(to) || 0.01;
      segments.push({ from: cursor.clone(), to, target: best, passAt: Math.min(0.92, dist / total) });
      cursor = to;
      lastDir = _dir.clone();
      side = -side;
    }

    if (!segments.length) {
      // Nothing to hunt: a short streak forward still shows the speed.
      const yaw = ctx.yaw();
      const to = start.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(6));
      for (let i = 0; i < 8 && ctx.blocked(to.x, to.z, 0.5); i += 1) to.lerp(start, 0.2);
      segments.push({ from: start.clone(), to, target: null, passAt: 1 });
    } else {
      // Finish beyond the last target, facing away from the pile.
      const last = segments[segments.length - 1];
      const to = last.to.clone().addScaledVector(lastDir, 2.2);
      for (let i = 0; i < 8 && ctx.blocked(to.x, to.z, 0.5); i += 1) to.lerp(last.to, 0.25);
      segments.push({ from: last.to.clone(), to, target: null, passAt: 1 });
    }

    this.marks.clear();
    const first = segments[0];
    this.seq = {
      kind: 'overdrive',
      segments,
      index: 0,
      t: 0,
      duration: Math.max(0.09, first.from.distanceTo(first.to) / OVERDRIVE_SPEED),
      hit: false,
      finishing: -1,
      detonated: false,
      imaged: 0,
    };
    const total = segments.reduce((s, seg) => s + seg.from.distanceTo(seg.to), 0);
    ctx.iframes(total / OVERDRIVE_SPEED + OVERDRIVE_FINISH + 0.3);
    ctx.camera.addFovPunch(10);
    ctx.camera.addKick(0.3);
    ctx.power.surge(0.6);
    ctx.power.boost(1.6);
    ctx.afterimages.spawn(0.55, 0.3);
    ctx.sound('leo.overdrive.start');
    return true;
  }

  private startRush() {
    const ctx = this.ctx!;
    this.rushHits.clear();
    this.seq = { kind: 'rush', t: 0, prev: ctx.pos.clone(), blockedFrames: 0, lastHit: null, imageT: 0, done: false, finishT: 0 };
    ctx.iframes(RUSH_DURATION + 0.2);
    ctx.camera.addFovPunch(7);
    ctx.power.boost(1.2);
    ctx.power.arcAt(['handL', 'handR', 'footL', 'footR'], 3, 0.9, 0.14, 0.035);
    ctx.sound('leo.rush.start');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { dt } = frame;

    if (this.seq) {
      switch (this.seq.kind) {
        case 'crack':
          this.updateCrack(this.seq, dt);
          break;
        case 'overdrive':
          this.updateOverdrive(this.seq, dt);
          break;
        case 'rush':
          this.updateRush(this.seq, dt);
          break;
      }
    } else {
      this.poseState = null;
      this.air = 0;
      this.updateSprintEnergy(frame);
    }

    this.trail.update(dt, ctx.cameraObject);
  }

  /** Speed language: the faster she runs, the more she crackles. Strongest effects stay with abilities. */
  private updateSprintEnergy(frame: KitFrame) {
    const ctx = this.ctx!;
    const { dt } = frame;
    const fast = frame.sprinting && frame.moving && frame.speed > ctx.spec.speed * 1.05;
    this.momentum = fast ? Math.min(1, this.momentum + dt / 0.9) : Math.max(0, this.momentum - dt * 2);
    const m = this.momentum;
    const powered = ctx.power.currentState !== 'DEPLETED';

    if (m > 0.3 && powered) {
      this.footArcT -= dt;
      if (this.footArcT <= 0) {
        ctx.power.arcAt(['footL', 'footR'], 1, 0.55 + 0.4 * m, 0.1, 0.028);
        this.footArcT = 0.34 - 0.14 * m;
      }
    }
    if (m > 0.6 && powered) {
      this.handArcT -= dt;
      if (this.handArcT <= 0) {
        ctx.power.arcAt(['handL', 'handR'], 1, 0.5 + 0.4 * m, 0.1, 0.028);
        this.handArcT = 0.45;
      }
    }
    if (m > 0.55) {
      this.trail.intensity = 0.35 * (m - 0.55) * 2.2 * (powered ? 1 : 0.4);
      this.feedTrail('chest', 1.1);
    } else {
      this.trail.intensity = Math.max(0, this.trail.intensity - dt * 3);
    }
    if (m > 0.82 && powered) {
      this.imageT -= dt;
      if (this.imageT <= 0) {
        ctx.afterimages.spawn(0.2, 0.26);
        this.imageT = 0.27;
      }
    } else {
      this.imageT = 0;
    }
  }

  private feedTrail(anchor: string, fallbackHeight: number) {
    const ctx = this.ctx!;
    if (!ctx.power.anchorPosition(anchor, _p)) _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + fallbackHeight);
    this.trail.feed(_p);
  }

  // --- Kinetic Crack ---------------------------------------------------------

  private updateCrack(seq: Extract<Sequence, { kind: 'crack' }>, dt: number) {
    const ctx = this.ctx!;
    seq.t += dt;
    const electric = ctx.spec.visual.electricityColor;
    switch (seq.phase) {
      case 'compress': {
        const p = Math.min(1, seq.t / CRACK_COMPRESS);
        this.poseState = { kind: 'crouch', t: p, weight: Math.min(1, seq.t / 0.07) };
        ctx.power.arcAt(['footL', 'footR', 'handL', 'handR'], Math.random() < 0.7 ? 1 : 2, 0.9, 0.12, 0.035);
        if (seq.t >= CRACK_COMPRESS) {
          seq.phase = 'launch';
          seq.t = 0;
          ctx.camera.addKick(-0.25);
          ctx.power.boost(1.5);
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.25);
          ctx.particles.emit(_p, electric, 20, { speed: 7, size: 0.26, life: 0.4, up: 0.3, gravity: 3 });
          ctx.rings.spawn(_p, electric, { radius: 1.6, duration: 0.3 });
          this.trail.clear();
          this.trail.intensity = 1.2;
          ctx.sound('leo.crack.launch');
        }
        break;
      }
      case 'launch': {
        const p = Math.min(1, seq.t / CRACK_LAUNCH);
        this.air = CRACK_APEX * Math.sin(p * Math.PI * 0.5);
        // Drift a third of the way to the landing on the way up.
        ctx.pos.lerpVectors(seq.from, seq.to, 0.33 * p);
        ctx.pos.y = 0;
        this.poseState = { kind: 'launch', t: p, weight: 1 };
        _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + 0.1);
        this.trail.feed(_p);
        if (Math.random() < 0.6) ctx.particles.emit(_p, electric, 1, { speed: 1.5, size: 0.16, life: 0.3, up: -0.5 });
        if (seq.t >= CRACK_LAUNCH) {
          seq.phase = 'hang';
          seq.t = 0;
        }
        break;
      }
      case 'hang': {
        const p = Math.min(1, seq.t / CRACK_HANG);
        this.air = CRACK_APEX + Math.sin(p * Math.PI) * 0.15;
        this.poseState = { kind: 'dive', t: p * 0.3, weight: p };
        ctx.pos.lerpVectors(seq.from, seq.to, 0.33 + 0.07 * p);
        ctx.pos.y = 0;
        if (seq.t >= CRACK_HANG) {
          seq.phase = 'dive';
          seq.t = 0;
          ctx.power.arcAt(['handR', 'handL'], 2, 1, 0.14, 0.04);
          ctx.sound('leo.crack.dive');
        }
        break;
      }
      case 'dive': {
        const p = Math.min(1, seq.t / CRACK_DIVE);
        this.air = CRACK_APEX * (1 - p * p);
        ctx.pos.lerpVectors(seq.from, seq.to, 0.4 + 0.6 * p);
        ctx.pos.y = 0;
        this.poseState = { kind: 'dive', t: 0.3 + 0.7 * p, weight: 1 };
        _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + 0.6);
        this.trail.feed(_p);
        if (seq.t >= CRACK_DIVE) {
          seq.phase = 'slam';
          seq.t = 0;
          this.air = 0;
          ctx.pos.copy(seq.to);
          ctx.resolve(ctx.pos);
          this.impact();
        }
        break;
      }
      case 'slam': {
        const p = Math.min(1, seq.t / CRACK_SLAM);
        this.poseState = { kind: 'slam', t: p, weight: p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1 };
        this.trail.intensity = Math.max(0, this.trail.intensity - dt * 4);
        if (seq.t >= CRACK_SLAM) {
          this.seq = null;
          this.poseState = null;
        }
        break;
      }
    }
  }

  private impact() {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    const ground = ctx.heightAt(ctx.pos.x, ctx.pos.z);
    _p.copy(ctx.pos).setY(ground);

    ctx.hitStop(0.07);
    ctx.camera.addShake(0.62);
    ctx.camera.addKick(0.45);
    ctx.rings.spawn(_p, electric, { radius: CRACK_RADIUS + 0.4, duration: 0.5 });
    ctx.schedule(0.08, () => ctx.rings.spawn(_p.copy(ctx.pos).setY(ground), 0xffffff, { radius: CRACK_RADIUS * 0.7, duration: 0.35 }));
    ctx.cracks.spawn(_p, CRACK_RADIUS * 1.05, 4.5);
    ctx.particles.emit(_p, DEBRIS, 26, { speed: 7.5, size: 0.32, life: 0.7, up: 1.5, gravity: 10 });
    ctx.particles.emit(_p, electric, 30, { speed: 10, size: 0.28, life: 0.45, up: 0.25, gravity: 3 });
    ctx.particles.emit(_p, 0xffffff, 10, { speed: 4, size: 0.4, life: 0.25, up: 0.8 });
    ctx.power.surge(0.8);
    ctx.power.boost(2);
    ctx.sound('leo.crack.impact');

    const hits = targetsInRadius(ctx.targets(), ctx.pos, CRACK_RADIUS, _hits);
    for (const target of [...hits]) {
      _dir.subVectors(target.pos, ctx.pos).setY(0);
      const d = _dir.length();
      if (d < 0.01) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
      else _dir.divideScalar(d);
      const proximity = 1 - Math.min(1, d / (CRACK_RADIUS + target.radius));
      const falloff = 0.55 + 0.45 * proximity;
      ctx.hurt(target, CRACK_DAMAGE * falloff, _dir, 'slam', 0.8 + 0.5 * proximity);
    }
  }

  // --- Overdrive -------------------------------------------------------------

  private updateOverdrive(seq: Extract<Sequence, { kind: 'overdrive' }>, dt: number) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;

    if (seq.finishing >= 0) {
      seq.finishing += dt;
      const p = Math.min(1, seq.finishing / OVERDRIVE_FINISH);
      this.poseState = { kind: 'finish', t: p, weight: p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1 };
      this.trail.intensity = Math.max(0, this.trail.intensity - dt * 4);
      if (!seq.detonated && seq.finishing >= OVERDRIVE_DETONATE_AT) {
        seq.detonated = true;
        this.detonateMarks();
      }
      if (seq.finishing >= OVERDRIVE_FINISH) {
        this.seq = null;
        this.poseState = null;
      }
      return;
    }

    const seg = seq.segments[seq.index];
    seq.t += dt;
    const p = Math.min(1, seq.t / seq.duration);
    // Slight ease-in so each leg reads as a burst rather than a slide.
    const eased = p * (0.4 + 0.6 * p);
    _p.lerpVectors(seg.from, seg.to, eased);
    ctx.pos.set(_p.x, 0, _p.z);
    ctx.resolve(ctx.pos);
    this.poseState = { kind: 'streak', t: p, weight: 1 };
    this.trail.intensity = 1.3;
    this.feedTrail('chest', 1.1);
    if (Math.random() < 0.5) {
      _q.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.9);
      ctx.particles.emit(_q, electric, 1, { speed: 2.5, size: 0.14, life: 0.25, up: 0.4 });
    }

    // Afterimages at the start and halfway through each leg.
    if (seq.imaged === 0 || (seq.imaged === 1 && p > 0.5)) {
      ctx.afterimages.spawn(0.5, 0.3);
      seq.imaged += 1;
    }

    if (!seq.hit && seg.target && p >= seg.passAt) {
      seq.hit = true;
      this.overdriveStrike(seg.target);
    }

    if (p >= 1) {
      seq.index += 1;
      if (seq.index >= seq.segments.length) {
        seq.finishing = 0;
        ctx.camera.addKick(0.3);
        ctx.afterimages.spawn(0.5, 0.3);
        ctx.sound('leo.overdrive.finish');
        return;
      }
      const next = seq.segments[seq.index];
      next.from.copy(ctx.pos).setY(0);
      seq.t = 0;
      seq.duration = Math.max(0.09, next.from.distanceTo(next.to) / OVERDRIVE_SPEED);
      seq.hit = false;
      seq.imaged = 0;
      ctx.camera.addFovPunch(5);
    }
  }

  private overdriveStrike(target: KitTarget) {
    const ctx = this.ctx!;
    if (target.hp <= 0) return;
    _dir.subVectors(target.pos, ctx.pos).setY(0);
    if (_dir.lengthSq() < 0.01) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    _dir.normalize();
    ctx.hurt(target, OVERDRIVE_HIT, _dir, 'stagger', 0.8);
    this.marks.set(target, (this.marks.get(target) ?? 0) + 1);
    _q.copy(target.pos).setY(1.1);
    ctx.particles.emit(_q, ctx.spec.visual.electricityColor, 12, { speed: 7, size: 0.22, life: 0.3, up: 0.4 });
    ctx.particles.emit(_q, 0xffffff, 4, { speed: 3, size: 0.3, life: 0.18 });
    ctx.power.boost(1.2);
    ctx.power.arcAt(['handR', 'handL'], 1, 1, 0.12, 0.035);
    ctx.camera.addShake(0.09);
    ctx.sound('leo.overdrive.hit');
  }

  private detonateMarks() {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    let any = false;
    for (const [target, count] of this.marks) {
      if (target.hp <= 0) continue;
      any = true;
      _dir.subVectors(target.pos, ctx.pos).setY(0);
      if (_dir.lengthSq() < 0.01) _dir.set(0, 0, 1);
      _dir.normalize();
      ctx.hurt(target, 7 + 10 * count, _dir, 'launch', 1 + 0.2 * count);
      _q.copy(target.pos).setY(ctx.heightAt(target.pos.x, target.pos.z));
      ctx.rings.spawn(_q, electric, { radius: 2.4, duration: 0.35 });
      _q.y += 1.1;
      ctx.particles.emit(_q, electric, 18, { speed: 8, size: 0.26, life: 0.4, up: 0.9, gravity: 4 });
      ctx.particles.emit(_q, 0xffffff, 6, { speed: 4, size: 0.4, life: 0.2 });
    }
    this.marks.clear();
    if (any) {
      ctx.hitStop(0.06);
      ctx.camera.addShake(0.38);
      ctx.power.surge(0.5);
      ctx.sound('leo.overdrive.detonate');
    }
  }

  // --- Pride Rush ------------------------------------------------------------

  private updateRush(seq: Extract<Sequence, { kind: 'rush' }>, dt: number) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;

    if (seq.done) {
      seq.finishT += dt;
      this.poseState = null;
      this.trail.intensity = Math.max(0, this.trail.intensity - dt * 5);
      if (seq.finishT >= 0.22) this.seq = null;
      return;
    }

    seq.t += dt;
    const p = Math.min(1, seq.t / RUSH_DURATION);
    const speed = RUSH_SPEED_START + (RUSH_SPEED_END - RUSH_SPEED_START) * p;
    const momentum = p;
    // Steered by the camera: the rush follows the current facing every frame.
    const yaw = ctx.yaw();
    _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    seq.prev.copy(ctx.pos);
    ctx.pos.addScaledVector(_dir, speed * dt);
    ctx.resolve(ctx.pos);
    const moved = ctx.pos.distanceTo(seq.prev);
    seq.blockedFrames = moved < speed * dt * 0.35 ? seq.blockedFrames + 1 : 0;

    this.poseState = { kind: 'rush', t: p, weight: Math.min(1, seq.t / 0.08) };
    this.trail.intensity = 0.6 + momentum * 0.9;
    this.feedTrail('chest', 1.1);
    seq.imageT -= dt;
    if (momentum > 0.35 && seq.imageT <= 0) {
      ctx.afterimages.spawn(0.25 + 0.3 * momentum, 0.28);
      seq.imageT = 0.11 - 0.04 * momentum;
    }
    if (Math.random() < 0.3 + momentum * 0.5) {
      ctx.power.arcAt(['handL', 'handR', 'footL', 'footR'], 1, 0.6 + 0.4 * momentum, 0.1, 0.03);
    }

    // Everything swept through this frame's path takes the shoulder.
    const hits = targetsAlongSegment(ctx.targets(), seq.prev, ctx.pos, RUSH_WIDTH, _hits);
    for (const target of [...hits]) {
      if (!this.rushHits.take(target, seq.t)) continue;
      ctx.hurt(target, RUSH_HIT, _dir, 'knockback', 0.85 + momentum * 0.6);
      seq.lastHit = target;
      _q.copy(target.pos).setY(1.1);
      ctx.particles.emit(_q, electric, 10, { speed: 7, size: 0.22, life: 0.3, direction: _dir });
      ctx.power.boost(1.3);
      ctx.camera.addShake(0.1);
      ctx.sound('leo.rush.hit');
    }

    // Once nobody else stands in the remaining lane, the host just struck is
    // the final one she reaches: plant and finish on it instead of running on.
    if (hits.length && p > 0.3 && p < 1) {
      const remaining = speed * (RUSH_DURATION - seq.t) + 1.5;
      _q.copy(ctx.pos).addScaledVector(_dir, remaining);
      const ahead = targetsAlongSegment(ctx.targets(), ctx.pos, _q, RUSH_WIDTH * 1.6, _hits);
      if (!ahead.some((t) => t.hp > 0 && !this.rushHits.has(t))) {
        this.finishRush(seq, momentum);
        return;
      }
    }

    if (p >= 1 || seq.blockedFrames >= 2) {
      this.finishRush(seq, momentum);
    }
  }

  private finishRush(seq: Extract<Sequence, { kind: 'rush' }>, momentum: number) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    seq.done = true;
    seq.finishT = 0;
    const yaw = ctx.yaw();
    _dir.set(Math.sin(yaw), 0, Math.cos(yaw));

    // The finisher lands on the last host she hit if it is still close, else
    // whoever is right in front of her.
    let target: KitTarget | null = null;
    if (seq.lastHit && seq.lastHit.hp > 0 && seq.lastHit.pos.distanceTo(ctx.pos) < 4) target = seq.lastHit;
    if (!target) {
      const ahead = targetsInArc(ctx.targets(), ctx.pos, yaw, 2.6, 0.9, _hits);
      if (ahead.length) target = sortByDistance(ahead, ctx.pos)[0];
    }
    ctx.strike('punchR');
    ctx.power.boost(1.8);
    if (target) {
      const t = target;
      ctx.schedule(0.1, () => {
        if (t.hp <= 0) return;
        _dir.subVectors(t.pos, ctx.pos).setY(0);
        if (_dir.lengthSq() < 0.01) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
        _dir.normalize();
        ctx.hurt(t, RUSH_FINISHER, _dir, 'heavy', 1 + momentum * 0.6);
        ctx.hitStop(0.06);
        ctx.camera.addShake(0.36);
        ctx.camera.addKick(0.3);
        _q.copy(t.pos).setY(ctx.heightAt(t.pos.x, t.pos.z));
        ctx.rings.spawn(_q, electric, { radius: 2.2, duration: 0.32 });
        _q.y += 1.1;
        ctx.particles.emit(_q, electric, 16, { speed: 9, size: 0.26, life: 0.35, direction: _dir });
        ctx.particles.emit(_q, 0xffffff, 5, { speed: 4, size: 0.4, life: 0.2 });
        ctx.sound('leo.rush.finisher');
      });
    } else if (seq.blockedFrames >= 2) {
      ctx.camera.addShake(0.2);
      ctx.sound('leo.rush.stop');
    } else {
      ctx.sound('leo.rush.end');
    }
  }
}
