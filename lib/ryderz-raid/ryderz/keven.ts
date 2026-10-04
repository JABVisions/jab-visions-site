import * as THREE from 'three';
import type { AbilityId } from '../config';
import { HitSet, sortByDistance, targetsInRadius } from '../combat';
import { TrailRibbon } from '../speed-vfx';
import { DartPool } from '../projectiles';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Keven Hart — the Pink Ryder. Intangibility, phasing, ambush, acrobatics.
 *
 * Q  Afterimage      phase into the floor, hunt the nearest host from below,
 *                    erupt, grab, drag it under, hurl it back out.
 * E  Phantom Phase   toggle: translucent and intangible; hosts he walks
 *                    through take phase damage (per-host cooldown).
 * R  Dart Storm      standing backflip; a barrage of homing pink darts is
 *                    loosed from the top of the arc; clean landing.
 *
 * Tuning lives here; mechanics (hit sets, radius queries, trails, darts,
 * reactions) come from the shared modules, so Keven's identity never leaks
 * into another Ryder.
 */

// Afterimage (phase grab)
const GRAB_SEEK = 15;
const GRAB_SINK_TIME = 0.42;
const GRAB_DEPTH = 2.2;
const GRAB_TRAVEL_SPEED = 22;
const GRAB_TRAVEL_MAX = 1.3;
const GRAB_PANIC_TIME = 0.42;
const GRAB_PULL_TIME = 0.4;
const GRAB_HEAVE_TIME = 0.3;
const GRAB_EMERGE_TIME = 0.3;
const GRAB_PULL_DAMAGE = 24;
const GRAB_HEAVE_DAMAGE = 18;
const GRAB_ENEMY_SINK = 1.05;
const GRAB_FAIL_WAIT = 0.35;

// Phantom Phase
const PHASE_OPACITY = 0.42;
const PHASE_HIT = 9;
const PHASE_HIT_COOLDOWN = 0.75;
const PHASE_REACH = 0.2;

// Dart Storm
const STORM_PREP = 0.16;
const STORM_FLIP = 0.8;
const STORM_LAND = 0.24;
const STORM_APEX = 2.1;
const STORM_HOP = 1.7;
const STORM_SEEK = 20;
const STORM_MAX_TARGETS = 5;
const STORM_DARTS = 14;
const STORM_FIRE_FROM = 0.3;
const STORM_FIRE_TO = 0.7;
const STORM_DART_DAMAGE = 8;
const STORM_DART_SPEED = 30;
const STORM_DART_TURN = 5.5;

type GrabPhase = 'sink' | 'travel' | 'panic' | 'pull' | 'heave' | 'emerge';

type Sequence =
  | { kind: 'grab'; phase: GrabPhase; t: number; target: KitTarget | null; surface: number; streakT: number; riseFrom: number }
  | { kind: 'storm'; phase: 'prep' | 'flip' | 'land'; t: number; from: THREE.Vector3; to: THREE.Vector3; fired: number; targets: KitTarget[]; hand: 0 | 1 };

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _hits: KitTarget[] = [];
const WHITE = new THREE.Color(0xffffff);

export class KevenKit implements RyderKit {
  private ctx: KitContext | null = null;
  private seq: Sequence | null = null;
  private poseState: PoseOverride | null = null;
  private air = 0;
  private bodyOpacity = 1;
  private phasing = false;
  private phaseHits = new HitSet<KitTarget>();
  private phaseSparkT = 0;
  private phaseHumT = 0;
  private streak: TrailRibbon;
  private darts: DartPool<KitTarget>;
  private pinkSoft: number;

  constructor() {
    this.streak = new TrailRibbon(0xff4ad2, { life: 0.42, width: 0.5, spacing: 0.14 });
    this.darts = new DartPool<KitTarget>(STORM_DARTS + 4, 0xff4ad2);
    this.pinkSoft = 0xffb6ec;
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

  get opacity() {
    return this.bodyOpacity;
  }

  get intangible() {
    return this.phasing || (this.seq?.kind === 'grab' && this.seq.phase !== 'emerge');
  }

  /** The more see-through he is, the harder the pink burns through him. */
  get glow() {
    const seq = this.seq;
    if (seq?.kind === 'storm') return seq.phase === 'flip' ? 0.16 : 0.08;
    const ghost = Math.min(0.55, (1 - this.bodyOpacity) * 1.1);
    return this.phasing ? Math.max(ghost, 0.4) : ghost;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const aura = ctx.spec.visual.auraColor;
    this.streak.setColor(aura);
    this.darts.setColor(aura);
    this.pinkSoft = new THREE.Color(aura).lerp(WHITE, 0.45).getHex();
    ctx.scene.add(this.streak.mesh, this.darts.group);
    const fighter = ctx.fighter();
    if (fighter) ctx.afterimages.bind(fighter, aura);
    this.bodyOpacity = 1;
    this.phasing = false;
  }

  detach() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.scene.remove(this.streak.mesh, this.darts.group);
      this.ctx.afterimages.unbind();
    }
    this.streak.clear();
    this.darts.clear();
    this.ctx = null;
  }

  /** Cut everything and leave the body exactly as a fresh Keven: solid, on the ground, holding nobody. */
  interrupt() {
    if (this.seq?.kind === 'grab' && this.seq.target) this.release(this.seq.target);
    this.seq = null;
    this.poseState = null;
    this.air = 0;
    this.bodyOpacity = 1;
    this.phasing = false;
    this.phaseHits.clear();
    this.streak.clear();
    this.streak.intensity = 0;
    this.darts.clear();
  }

  melee(): MeleeStep | null {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Abilities
  // ---------------------------------------------------------------------------

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    switch (id) {
      case 'decoy':
        return this.seq ? true : this.startGrab();
      case 'phase':
        this.startPhase();
        return true;
      case 'dartStorm':
        return this.seq ? true : this.startStorm();
      default:
        return false;
    }
  }

  endAbility(id: AbilityId) {
    if (id === 'phase') this.endPhase();
  }

  // --- Afterimage -------------------------------------------------------------

  private startGrab() {
    const ctx = this.ctx!;
    const target = this.nearestHost(GRAB_SEEK);
    this.seq = { kind: 'grab', phase: 'sink', t: 0, target, surface: ctx.heightAt(ctx.pos.x, ctx.pos.z), streakT: 0, riseFrom: 0 };
    ctx.iframes(GRAB_SINK_TIME + 0.1);
    ctx.power.boost(1.2);
    ctx.power.arcAt(['footL', 'footR', 'handL', 'handR'], 3, 0.8, 0.14, 0.03);
    _p.copy(ctx.pos).setY(this.seq.surface + 0.04);
    ctx.rings.spawn(_p, ctx.spec.visual.auraColor, { radius: 1.9, duration: 0.42 });
    ctx.particles.emit(_p, this.pinkSoft, 14, { speed: 2.2, size: 0.2, life: 0.5, up: 1.2 });
    ctx.afterimages.spawn(0.4, 0.5);
    ctx.sound('keven.afterimage.phaseDown');
    return true;
  }

  private nearestHost(range: number) {
    const ctx = this.ctx!;
    const near = targetsInRadius(ctx.targets(), ctx.pos, range, _hits).filter((t) => t.hp > 0 && t.held <= 0);
    if (!near.length) return null;
    return sortByDistance(near, ctx.pos)[0];
  }

  private updateGrab(seq: Extract<Sequence, { kind: 'grab' }>, dt: number) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    seq.t += dt;
    ctx.iframes(0.12);
    // A target that died or got taken by something else drops out; Keven still resurfaces.
    if (seq.target && (seq.target.hp <= 0 || (seq.phase !== 'pull' && seq.phase !== 'heave' && seq.target.held > 0))) {
      seq.target = null;
    }

    switch (seq.phase) {
      case 'sink': {
        const p = Math.min(1, seq.t / GRAB_SINK_TIME);
        this.air = -GRAB_DEPTH * p * p;
        this.bodyOpacity = 1 - 0.55 * p;
        this.poseState = { kind: 'sink', t: p, weight: Math.min(1, seq.t / 0.08) };
        if (Math.random() < 0.7) {
          _p.copy(ctx.pos).setY(seq.surface + 0.1);
          _p.x += (Math.random() - 0.5) * 0.9;
          _p.z += (Math.random() - 0.5) * 0.9;
          ctx.particles.emit(_p, aura, 1, { speed: 1.4, size: 0.16, life: 0.4, up: 1.5 });
        }
        if (seq.t >= GRAB_SINK_TIME) {
          seq.phase = 'travel';
          seq.t = 0;
          this.streak.clear();
          this.streak.intensity = 1;
          ctx.sound(seq.target ? 'keven.afterimage.travel' : 'keven.afterimage.noTarget');
        }
        break;
      }
      case 'travel': {
        this.air = -GRAB_DEPTH;
        this.bodyOpacity = 0.35;
        this.poseState = { kind: 'sink', t: 1, weight: 1 };
        const target = seq.target;
        let arrived = !target;
        if (target) {
          _dir.subVectors(target.pos, ctx.pos).setY(0);
          const dist = _dir.length();
          const step = GRAB_TRAVEL_SPEED * dt;
          if (dist <= step + 0.25) {
            ctx.pos.x = target.pos.x;
            ctx.pos.z = target.pos.z;
            arrived = true;
          } else {
            ctx.pos.addScaledVector(_dir.normalize(), step);
          }
          ctx.pos.y = 0;
        }
        // Faint streak crawling across the pavement so the player can follow him.
        seq.surface = ctx.heightAt(ctx.pos.x, ctx.pos.z);
        _p.copy(ctx.pos).setY(seq.surface + 0.07);
        this.streak.feed(_p);
        seq.streakT -= dt;
        if (seq.streakT <= 0) {
          ctx.rings.spawn(_p, aura, { radius: 0.9, duration: 0.3 });
          ctx.particles.emit(_p, this.pinkSoft, 2, { speed: 1.2, size: 0.14, life: 0.35, up: 1.6 });
          seq.streakT = 0.07;
        }
        if (arrived || seq.t >= GRAB_TRAVEL_MAX) {
          if (seq.target && arrived) {
            seq.phase = 'panic';
            seq.t = 0;
            // The glowing circle forms under the host's feet; it freezes in place.
            seq.target.stagger = Math.max(seq.target.stagger, GRAB_PANIC_TIME + 0.05);
            seq.target.knock.set(0, 0, 0);
            seq.streakT = 0;
            ctx.sound('keven.afterimage.mark');
          } else {
            // Nobody to hunt: resurface where he is after a beat.
            seq.target = null;
            seq.phase = 'emerge';
            seq.t = -GRAB_FAIL_WAIT;
            this.streak.intensity = 0;
          }
        }
        break;
      }
      case 'panic': {
        const target = seq.target;
        if (!target) {
          seq.phase = 'emerge';
          seq.t = 0;
          break;
        }
        // Shadow the host from below so the hands come up exactly under it.
        ctx.pos.x = target.pos.x;
        ctx.pos.z = target.pos.z;
        ctx.pos.y = 0;
        seq.surface = ctx.heightAt(ctx.pos.x, ctx.pos.z);
        const panic = Math.min(1, seq.t / GRAB_PANIC_TIME);
        this.air = -GRAB_DEPTH + 0.3 * panic;
        this.streak.intensity = Math.max(0, this.streak.intensity - dt * 4);
        // The circle under its feet pulses brighter and wider as the hands come up.
        seq.streakT -= dt;
        if (seq.streakT <= 0) {
          _p.copy(target.pos).setY(seq.surface + 0.05);
          ctx.rings.spawn(_p, aura, { radius: target.radius * 1.6 + 0.5 + panic * 1.2, duration: 0.22 });
          seq.streakT = 0.09;
        }
        ctx.flash(target, aura, 0.012 + 0.015 * panic);
        if (Math.random() < 0.8) {
          _p.copy(target.pos).setY(seq.surface + 0.08);
          const a = Math.random() * Math.PI * 2;
          const r = target.radius * 1.2 + 0.2;
          _p.x += Math.cos(a) * r;
          _p.z += Math.sin(a) * r;
          ctx.particles.emit(_p, aura, 1, { speed: 1.2, size: 0.15, life: 0.35, up: 2.2 });
        }
        if (seq.t >= GRAB_PANIC_TIME) {
          seq.phase = 'pull';
          seq.t = 0;
          target.held = GRAB_PULL_TIME + GRAB_HEAVE_TIME + 0.3;
          target.stagger = 0;
          target.knock.set(0, 0, 0);
          target.airY = 0;
          target.airVel = 0;
          target.sink = 0;
          ctx.camera.addShake(0.22);
          ctx.camera.addKick(0.12);
          ctx.power.boost(1.6);
          _p.copy(target.pos).setY(seq.surface + 0.1);
          ctx.particles.emit(_p, 0x5a5160, 14, { speed: 4.5, size: 0.24, life: 0.45, up: 1.2, gravity: 7 });
          ctx.particles.emit(_p, aura, 12, { speed: 5, size: 0.22, life: 0.35, up: 1 });
          ctx.rings.spawn(_p, aura, { radius: 2.2, duration: 0.3 });
          ctx.flash(target, aura, 0.3);
          ctx.sound('keven.afterimage.grab');
        }
        break;
      }
      case 'pull': {
        const target = seq.target;
        const p = Math.min(1, seq.t / GRAB_PULL_TIME);
        // Keven comes up to the waist; the host goes down with him.
        this.air = -GRAB_DEPTH + (GRAB_DEPTH - 1.0) * Math.min(1, p * 1.6);
        this.bodyOpacity = 0.35 + 0.45 * p;
        this.poseState = { kind: 'grab', t: p, weight: 1 };
        if (target) {
          target.held = Math.max(target.held, 0.3);
          target.pos.x = ctx.pos.x;
          target.pos.z = ctx.pos.z;
          const yank = Math.max(0, (p - 0.3) / 0.7);
          target.sink = GRAB_ENEMY_SINK * yank * yank;
          target.lean = 0.4;
          if (yank > 0 && Math.random() < 0.8) {
            _p.copy(target.pos).setY(seq.surface + 0.1);
            _p.x += (Math.random() - 0.5) * 0.8;
            _p.z += (Math.random() - 0.5) * 0.8;
            ctx.particles.emit(_p, 0x5a5160, 1, { speed: 2.5, size: 0.2, life: 0.4, up: 1.5, gravity: 7 });
          }
        }
        if (seq.t >= GRAB_PULL_TIME) {
          seq.phase = 'heave';
          seq.t = 0;
          if (target) {
            _dir.set(0, 0, 0);
            ctx.hurt(target, GRAB_PULL_DAMAGE, _dir, 'stagger', 0.2);
            ctx.hitStop(0.05);
            ctx.camera.addShake(0.3);
            _p.copy(target.pos).setY(seq.surface + 0.3);
            ctx.particles.emit(_p, aura, 16, { speed: 6, size: 0.24, life: 0.35, up: 1.4 });
            ctx.rings.spawn(_p, aura, { radius: 2.8, duration: 0.32 });
            ctx.sound('keven.afterimage.drag');
          }
        }
        break;
      }
      case 'heave': {
        const target = seq.target;
        const p = Math.min(1, seq.t / GRAB_HEAVE_TIME);
        this.air = -1.0 * (1 - p);
        this.bodyOpacity = 0.8 + 0.2 * p;
        this.poseState = { kind: 'heave', t: p, weight: 1 };
        if (target) {
          target.held = Math.max(target.held, 0.2);
          target.pos.x = ctx.pos.x;
          target.pos.z = ctx.pos.z;
          // Held under for a beat, then hauled back up ahead of the throw.
          target.sink = GRAB_ENEMY_SINK * (1 - Math.min(1, Math.max(0, (p - 0.2) / 0.35)));
          if (p >= 0.55 && target.held > 0) {
            // Eject: free the body, pop it up and away, land the second hit.
            this.release(target);
            const yaw = ctx.yaw();
            _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
            target.pos.addScaledVector(_dir, target.radius + ctx.radius + 0.1);
            ctx.resolve(target.pos);
            ctx.hurt(target, GRAB_HEAVE_DAMAGE, _dir, 'launch', 1.35);
            ctx.camera.addShake(0.18);
            ctx.power.boost(1.4);
            _p.copy(target.pos).setY(seq.surface + 0.9);
            ctx.particles.emit(_p, aura, 18, { speed: 7, size: 0.26, life: 0.4, up: 1.6 });
            ctx.particles.emit(_p, this.pinkSoft, 8, { speed: 3, size: 0.4, life: 0.25 });
            ctx.sound('keven.afterimage.eject');
          }
        }
        if (seq.t >= GRAB_HEAVE_TIME) {
          seq.phase = 'emerge';
          seq.t = 0;
        }
        break;
      }
      case 'emerge': {
        if (seq.t < 0) {
          // Fail-case wait below ground before resurfacing.
          this.air = -GRAB_DEPTH;
          break;
        }
        const p = Math.min(1, seq.t / GRAB_EMERGE_TIME);
        const first = seq.t - dt <= 0;
        if (first) seq.riseFrom = this.air < -0.5 ? -GRAB_DEPTH : 0;
        // Resurfacing with nobody in hand rises straight up out of the floor;
        // after a grab he is already standing at the surface.
        this.air = seq.riseFrom * (1 - p);
        this.bodyOpacity = 0.35 + 0.65 * p;
        this.poseState = { kind: 'heave', t: 1, weight: 1 - p };
        if (first) {
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
          ctx.rings.spawn(_p, aura, { radius: 1.6, duration: 0.35 });
          ctx.particles.emit(_p, aura, 10, { speed: 2.5, size: 0.18, life: 0.4, up: 1.4 });
          ctx.sound('keven.afterimage.emerge');
        }
        if (seq.t >= GRAB_EMERGE_TIME) {
          this.seq = null;
          this.poseState = null;
          this.air = 0;
          this.bodyOpacity = this.phasing ? PHASE_OPACITY : 1;
        }
        break;
      }
    }
  }

  private release(target: KitTarget) {
    target.held = 0;
    target.sink = 0;
  }

  // --- Phantom Phase ----------------------------------------------------------

  private startPhase() {
    const ctx = this.ctx!;
    this.phasing = true;
    this.phaseHits.clear();
    this.phaseHumT = 0;
    ctx.power.boost(1.0);
    ctx.power.arcAt(['handL', 'handR', 'chest', 'footL', 'footR'], 4, 0.85, 0.16, 0.03);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
    ctx.rings.spawn(_p, ctx.spec.visual.auraColor, { radius: 2.4, duration: 0.4 });
    ctx.afterimages.spawn(0.35, 0.4);
    ctx.sound('keven.phase.start');
    ctx.sound('keven.phase.hum');
  }

  private endPhase() {
    const ctx = this.ctx;
    if (!this.phasing) return;
    this.phasing = false;
    this.phaseHits.clear();
    if (!this.seq) this.bodyOpacity = 1;
    if (ctx) {
      _p.copy(ctx.pos).setY(1.0);
      ctx.particles.emit(_p, this.pinkSoft, 12, { speed: 2.5, size: 0.2, life: 0.35, up: 0.6 });
      ctx.afterimages.spawn(0.3, 0.35);
      ctx.sound('keven.phase.end');
    }
  }

  private updatePhase(frame: KitFrame) {
    const ctx = this.ctx!;
    const { dt, time } = frame;
    const aura = ctx.spec.visual.auraColor;
    if (!this.seq) this.bodyOpacity = PHASE_OPACITY;
    ctx.power.boost(0.25 * dt * 6);

    // Phase energy: sparse pink motes and the odd arc; never a wall of particles.
    this.phaseSparkT -= dt;
    if (this.phaseSparkT <= 0) {
      _p.copy(ctx.pos).setY(0.4 + Math.random() * 1.3);
      _p.x += (Math.random() - 0.5) * 0.7;
      _p.z += (Math.random() - 0.5) * 0.7;
      ctx.particles.emit(_p, Math.random() < 0.5 ? aura : this.pinkSoft, 1, { speed: 0.9, size: 0.14, life: 0.5, up: 1.2 });
      if (Math.random() < 0.35) ctx.power.arcAt(['handL', 'handR', 'footL', 'footR'], 1, 0.6, 0.1, 0.025);
      this.phaseSparkT = 0.08;
    }
    this.phaseHumT += dt;
    if (frame.moving && frame.speed > ctx.spec.speed * 0.8 && Math.random() < dt * 3) ctx.afterimages.spawn(0.18, 0.3);

    // Walking through a host: it takes phase damage once per cooldown window.
    const reach = ctx.radius + PHASE_REACH;
    for (const target of ctx.targets()) {
      if (target.hp <= 0 || target.held > 0) continue;
      const dx = target.pos.x - ctx.pos.x;
      const dz = target.pos.z - ctx.pos.z;
      const r = reach + target.radius;
      if (dx * dx + dz * dz > r * r) continue;
      if (!this.phaseHits.take(target, time, PHASE_HIT_COOLDOWN)) continue;
      _dir.set(dx, 0, dz);
      if (_dir.lengthSq() < 1e-4) {
        const yaw = ctx.yaw();
        _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
      }
      _dir.normalize();
      ctx.hurt(target, PHASE_HIT, _dir, 'stagger', 0.6);
      ctx.flash(target, aura, 0.3);
      _p.copy(target.pos).setY(1.05);
      ctx.particles.emit(_p, aura, 12, { speed: 4.5, size: 0.22, life: 0.35 });
      ctx.particles.emit(_p, this.pinkSoft, 5, { speed: 1.5, size: 0.42, life: 0.22 });
      ctx.rings.spawn(_p, aura, { radius: 1.5, duration: 0.28, y: 1.05 });
      ctx.power.boost(0.9);
      ctx.sound('keven.phase.hit');
    }
  }

  // --- Dart Storm ---------------------------------------------------------------

  private startStorm() {
    const ctx = this.ctx!;
    const yaw = ctx.yaw();
    _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    const from = ctx.pos.clone();
    // The flip carries him backward a step; shorten it if something is behind him.
    const to = from.clone().addScaledVector(_dir, -STORM_HOP);
    for (let i = 0; i < 4 && ctx.blocked(to.x, to.z, ctx.radius + 0.1); i += 1) to.lerp(from, 0.5);
    const near = targetsInRadius(ctx.targets(), ctx.pos, STORM_SEEK, _hits).filter((t) => t.hp > 0);
    const targets = sortByDistance(near, ctx.pos).slice(0, STORM_MAX_TARGETS);
    this.seq = { kind: 'storm', phase: 'prep', t: 0, from, to, fired: 0, targets, hand: 0 };
    ctx.power.arcAt(['handL', 'handR'], 2, 0.9, 0.14, 0.03);
    ctx.sound('keven.storm.charge');
    return true;
  }

  private updateStorm(seq: Extract<Sequence, { kind: 'storm' }>, dt: number) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    seq.t += dt;
    switch (seq.phase) {
      case 'prep': {
        const p = Math.min(1, seq.t / STORM_PREP);
        this.poseState = { kind: 'crouch', t: p, weight: Math.min(1, seq.t / 0.06) };
        if (Math.random() < 0.8) ctx.power.arcAt(['handL', 'handR'], 1, 0.8, 0.12, 0.03);
        if (seq.t >= STORM_PREP) {
          seq.phase = 'flip';
          seq.t = 0;
          ctx.iframes(STORM_FLIP * 0.75);
          // Slight pullback so the whole flip stays in frame; the rig eases back after.
          ctx.camera.addFovPunch(4);
          ctx.camera.addKick(0.35);
          ctx.power.boost(1.3);
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.1);
          ctx.rings.spawn(_p, aura, { radius: 1.5, duration: 0.3 });
          ctx.particles.emit(_p, aura, 10, { speed: 3, size: 0.2, life: 0.35, up: 1 });
          ctx.sound('keven.storm.flip');
        }
        break;
      }
      case 'flip': {
        const p = Math.min(1, seq.t / STORM_FLIP);
        this.air = 4 * STORM_APEX * p * (1 - p);
        ctx.pos.lerpVectors(seq.from, seq.to, p);
        ctx.pos.y = 0;
        this.poseState = { kind: 'flip', t: p, weight: 1 };
        // Energy gathers on the hands through the rise, then the barrage leaves them.
        if (p < STORM_FIRE_FROM) {
          if (Math.random() < 0.8) ctx.power.arcAt(['handL', 'handR'], 1, 0.7 + p, 0.1, 0.03);
          for (const key of ['handL', 'handR']) {
            if (ctx.power.anchorPosition(key, _p) && Math.random() < 0.6) ctx.particles.emit(_p, aura, 1, { speed: 0.6, size: 0.16, life: 0.25 });
          }
        }
        const due = Math.floor(THREE.MathUtils.clamp((p - STORM_FIRE_FROM) / (STORM_FIRE_TO - STORM_FIRE_FROM), 0, 1) * STORM_DARTS);
        while (seq.fired < due) this.fireDart(seq);
        if (Math.random() < 0.22) ctx.afterimages.spawn(0.1, 0.26);
        if (seq.t >= STORM_FLIP) {
          seq.phase = 'land';
          seq.t = 0;
          this.air = 0;
          ctx.camera.addShake(0.14);
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.08);
          ctx.particles.emit(_p, 0x6a6070, 8, { speed: 3, size: 0.22, life: 0.35, up: 0.6, gravity: 6 });
          ctx.rings.spawn(_p, aura, { radius: 1.3, duration: 0.25 });
          ctx.sound('keven.storm.land');
        }
        break;
      }
      case 'land': {
        const p = Math.min(1, seq.t / STORM_LAND);
        this.air = 0;
        this.poseState = { kind: 'crouch', t: 1 - p, weight: 1 - p };
        if (seq.t >= STORM_LAND) {
          this.seq = null;
          this.poseState = null;
        }
        break;
      }
    }
  }

  private fireDart(seq: Extract<Sequence, { kind: 'storm' }>) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    const alive = seq.targets.filter((t) => t.hp > 0);
    const target = alive.length ? alive[seq.fired % alive.length] : null;
    const key = seq.hand === 0 ? 'handL' : 'handR';
    seq.hand = seq.hand === 0 ? 1 : 0;
    if (!ctx.power.anchorPosition(key, _p)) _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + 1.2);
    if (target) {
      _dir.copy(target.pos).setY(1.05).sub(_p).normalize();
    } else {
      ctx.lookDir(_dir);
    }
    // A little scatter so the flurry reads as many shards, not one line.
    _q.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5);
    _dir.add(_q).normalize();
    this.darts.spawn(_p, _dir, { speed: STORM_DART_SPEED, damage: STORM_DART_DAMAGE, target, turnRate: target ? STORM_DART_TURN : 0, life: 1.6 });
    ctx.particles.emit(_p, aura, 2, { speed: 2, size: 0.16, life: 0.2 });
    seq.fired += 1;
    ctx.sound('keven.storm.dart');
  }

  // ---------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { dt } = frame;

    if (this.seq) {
      if (this.seq.kind === 'grab') this.updateGrab(this.seq, dt);
      else this.updateStorm(this.seq, dt);
    } else {
      this.poseState = null;
      this.air = 0;
      if (!this.phasing) this.bodyOpacity = 1;
      this.streak.intensity = Math.max(0, this.streak.intensity - dt * 3);
    }

    if (this.phasing) this.updatePhase(frame);

    this.streak.update(dt, ctx.cameraObject);
    this.darts.update(dt, {
      targets: ctx.targets(),
      camera: ctx.cameraObject,
      blocked: (x, z, r) => ctx.blocked(x, z, r),
      onHit: (target, dart) => {
        ctx.hurt(target, dart.damage, dart.dir, 'stagger', 0.5);
        ctx.flash(target, ctx.spec.visual.auraColor, 0.18);
        ctx.particles.emit(dart.pos, ctx.spec.visual.auraColor, 7, { speed: 4, size: 0.18, life: 0.28 });
        ctx.particles.emit(dart.pos, this.pinkSoft, 3, { speed: 1.2, size: 0.34, life: 0.18 });
        ctx.sound('keven.storm.impact');
      },
      onFizzle: (pos) => {
        ctx.particles.emit(pos, this.pinkSoft, 4, { speed: 2.5, size: 0.16, life: 0.2 });
      },
    });
  }
}
