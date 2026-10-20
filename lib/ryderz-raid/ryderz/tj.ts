import * as THREE from 'three';
import type { AbilityId } from '../config';
import { targetsInArc, type HitReaction } from '../combat';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';
import {
  CONTROL_CAP,
  CONTROL_RADIUS,
  RIOT_CAP,
  RIOT_RADIUS,
  STRIKE_RANGE,
  STRIKE_SECONDS,
  applySway,
  influenceRank,
  swayCandidates,
  swaySeconds,
  type SwayMode,
} from './tj-influence';

/**
 * TJ, the Ringmaster of Death. Q is a dual-gun barrage, E turns a crowd on
 * itself, R is the same idea with a bullet storm and a wider frenzy.
 * None of them has a cooldown. The shared power blackout is the only stop.
 */

const FOREST = 0x228b22;
const DEEP = 0x145214;
const SMOKE = 0x101610;
const EYE = 0x8ed36a;

const SHOT_GAP = 0.09;
const PELLET = 7;
const FINISHER = 18;
const CONE = 0.62;
const RIOT_SPIN = 1.15;
const RIOT_PELLET = 9;

const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _arc: KitTarget[] = [];

type CrowdBody = KitTarget & {
  ally?: boolean;
  duelist?: boolean;
  tier?: number;
  pos: THREE.Vector3;
  radius: number;
};

interface Tracer {
  mesh: THREE.Line;
  life: number;
}

export class TjKit implements RyderKit {
  private ctx: KitContext | null = null;
  private barrage: { left: number; acc: number; finished: boolean } | null = null;
  private spin: { left: number; acc: number; turned: number; applied: boolean } | null = null;
  private gesture = 0;
  private fedDown = false;
  private tracers: Tracer[] = [];
  private tracerPool: Tracer[] = [];
  clipHint: string | null = null;
  clipToken = 0;
  clipSeconds = 0.38;

  get locked() {
    return false;
  }

  get busy() {
    return Boolean(this.barrage) || Boolean(this.spin) || this.gesture > 0;
  }

  get steerWhileBusy() {
    return true;
  }

  get airY() {
    return 0;
  }

  get pose(): PoseOverride | null {
    if (this.spin) return { kind: 'whirl', t: 1 - this.spin.left / RIOT_SPIN, weight: 1, lean: Math.sin(this.spin.turned) * 0.2 };
    if (this.barrage) {
      const t = 1 - this.barrage.left / STRIKE_SECONDS;
      return { kind: 'channel', t, weight: 0.92, lean: Math.sin(t * 18) * 0.35 };
    }
    if (this.gesture > 0) return { kind: 'cast', t: 1 - this.gesture / 0.45, weight: 0.8 };
    return null;
  }

  get bodyYaw() {
    return this.spin ? this.spin.turned : 0;
  }

  get powersDown() {
    return this.fedDown;
  }

  get glow() {
    if (this.fedDown) return 0;
    if (this.barrage || this.spin) return 0.85;
    return 0.22;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
  }

  detach() {
    this.interrupt();
    for (const tracer of this.tracerPool) {
      tracer.mesh.geometry.dispose();
      (tracer.mesh.material as THREE.Material).dispose();
    }
    this.tracerPool = [];
    this.ctx = null;
  }

  interrupt() {
    this.barrage = null;
    this.spin = null;
    this.gesture = 0;
    this.clipHint = null;
    for (const tracer of this.tracers) tracer.mesh.removeFromParent();
    this.tracers = [];
  }

  update(frame: KitFrame) {
    const down = Boolean(frame.powersDown);
    if (down && !this.fedDown) this.interrupt();
    this.fedDown = down;
    this.gesture = Math.max(0, this.gesture - frame.dt);
    this.stepBarrage(frame);
    this.stepSpin(frame);
    this.stepTracers(frame.dt);
  }

  tryAbility(id: AbilityId) {
    if (this.fedDown || !this.ctx) return false;
    if (id === 'deathStrike') return this.beginStrike();
    if (id === 'mindControl') return this.beginControl();
    if (id === 'riot') return this.beginRiot();
    return false;
  }

  melee(): MeleeStep | null {
    return null;
  }

  private beginStrike() {
    if (this.barrage) return true;
    this.barrage = { left: STRIKE_SECONDS, acc: 0, finished: false };
    this.playGuns('shooting from two pistols');
    this.ctx?.sound('tj.death-strike');
    return true;
  }

  private beginControl() {
    const ctx = this.ctx;
    if (!ctx) return false;
    this.gesture = Math.max(this.gesture, 0.45);
    this.playGuns('shooting guns');
    const caught = this.markCrowd('control', CONTROL_RADIUS, CONTROL_CAP);
    ctx.rings.spawn(ctx.pos.clone(), FOREST, { radius: CONTROL_RADIUS, duration: 0.7, y: 0.15 });
    ctx.rings.spawn(ctx.pos.clone(), DEEP, { radius: CONTROL_RADIUS * 0.55, duration: 0.5, y: 1.1 });
    ctx.particles.emit(ctx.pos.clone().setY(1.4), SMOKE, 16, { speed: 2.2, size: 0.45, life: 0.7, up: 0.6 });
    ctx.sound('tj.mind-control');
    return caught >= 0;
  }

  private beginRiot() {
    if (this.spin) return true;
    this.spin = { left: RIOT_SPIN, acc: 0, turned: 0, applied: false };
    this.playGuns('shooting from two pistols blowing arms back one after the other');
    this.ctx?.hitStop(0.06);
    this.ctx?.sound('tj.riot');
    return true;
  }

  private playGuns(hint: string) {
    this.clipHint = hint;
    this.clipToken += 1;
  }

  private stepBarrage(frame: KitFrame) {
    const barrage = this.barrage;
    const ctx = this.ctx;
    if (!barrage || !ctx || this.fedDown) return;
    barrage.left -= frame.dt;
    barrage.acc += frame.dt;
    while (barrage.acc >= SHOT_GAP && barrage.left > 0.16) {
      barrage.acc -= SHOT_GAP;
      this.volley(CONE, 0.35, PELLET, 'stagger', 0.7);
      if (Math.random() < 0.34) this.playGuns('shooting from two pistols');
    }
    if (barrage.left <= 0.16 && !barrage.finished) {
      barrage.finished = true;
      this.volley(0.2, 0.08, FINISHER, 'knockback', 1.1);
      this.volley(0.2, 0.08, FINISHER, 'knockback', 1.1);
      ctx.hitStop(0.04);
    }
    if (barrage.left <= 0) this.barrage = null;
  }

  private stepSpin(frame: KitFrame) {
    const spin = this.spin;
    const ctx = this.ctx;
    if (!spin || !ctx || this.fedDown) return;
    spin.left -= frame.dt;
    spin.turned += frame.dt * 9.5;
    spin.acc += frame.dt;
    while (spin.acc >= 0.07) {
      spin.acc -= 0.07;
      const yaw = ctx.yaw() + spin.turned;
      this.fireRay(yaw, RIOT_RADIUS, RIOT_PELLET, 'stagger', 0.85);
    }
    ctx.particles.emit(ctx.pos.clone().setY(1.2), SMOKE, 2, { speed: 3.4, size: 0.5, life: 0.45, up: 0.4 });
    if (spin.left <= 0) {
      if (!spin.applied) {
        spin.applied = true;
        this.markCrowd('riot', RIOT_RADIUS, RIOT_CAP);
        ctx.rings.spawn(ctx.pos.clone(), FOREST, { radius: RIOT_RADIUS, duration: 0.85, y: 0.2 });
        ctx.particles.emit(ctx.pos.clone().setY(0.4), SMOKE, 28, { speed: 6, size: 0.7, life: 0.8, up: 0.3 });
      }
      this.spin = null;
    }
  }

  private markCrowd(mode: SwayMode, radius: number, cap: number) {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.time();
    const crowd = swayCandidates(ctx.targets() as CrowdBody[], ctx.pos, radius, cap, mode);
    for (const body of crowd) {
      const seconds = swaySeconds(mode, influenceRank(body));
      applySway(body, mode, now, seconds);
      ctx.flash(body, EYE, 0.35);
      ctx.particles.emit(body.pos.clone().setY(1.55), FOREST, 6, { speed: 1.4, size: 0.16, life: 0.4, up: 0.8 });
    }
    return crowd.length;
  }

  private volley(cone: number, spread: number, damage: number, reaction: HitReaction, strength: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const look = ctx.lookDir(_dir);
    const yaw = Math.atan2(look.x, look.z) + (Math.random() - 0.5) * spread;
    this.fireRay(yaw, STRIKE_RANGE, damage, reaction, strength, cone);
  }

  private fireRay(yaw: number, range: number, damage: number, reaction: HitReaction, strength: number, cone = Math.PI) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    this.tracer(ctx.pos.x, ctx.pos.z, dx, dz, Math.min(range, 18));
    ctx.particles.emit(new THREE.Vector3(ctx.pos.x + dx * 0.55, 1.35, ctx.pos.z + dz * 0.55), FOREST, 3, {
      speed: 2,
      size: 0.08,
      life: 0.08,
    });
    if (cone < Math.PI) {
      targetsInArc(this.liveTargets(), ctx.pos, yaw, range, cone, _arc);
      for (const target of _arc) this.strikeTarget(target, damage, reaction, strength);
      return;
    }
    let nearest: CrowdBody | null = null;
    let best = range;
    for (const target of this.liveTargets()) {
      const tx = target.pos.x - ctx.pos.x;
      const tz = target.pos.z - ctx.pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist > range + target.radius || dist >= best) continue;
      const along = tx * dx + tz * dz;
      if (along < 0.4) continue;
      const side = Math.abs(tx * dz - tz * dx);
      if (side > target.radius + 0.45) continue;
      nearest = target;
      best = dist;
    }
    if (nearest) this.strikeTarget(nearest, damage, reaction, strength);
  }

  private liveTargets() {
    const ctx = this.ctx;
    if (!ctx) return [] as CrowdBody[];
    return (ctx.targets() as CrowdBody[]).filter((target) => target.hp > 0 && (!ctx.canHit || ctx.canHit(target)));
  }

  private strikeTarget(target: CrowdBody, damage: number, reaction: HitReaction, strength: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    _hit.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
    if (_hit.lengthSq() < 0.0001) _hit.set(0, 0, 1);
    else _hit.normalize();
    ctx.hurt(target, damage, _hit, reaction, strength);
    ctx.particles.emit(target.pos.clone().setY(1.15), FOREST, 4, { speed: 4, size: 0.1, life: 0.16, direction: _hit });
  }

  private tracer(x: number, z: number, dx: number, dz: number, length: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const tracer = this.tracerPool.pop() ?? this.makeTracer();
    const positions = tracer.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, x + dx * 0.7, 1.35, z + dz * 0.7);
    positions.setXYZ(1, x + dx * length, 1.32, z + dz * length);
    positions.needsUpdate = true;
    tracer.life = 0.08;
    tracer.mesh.visible = true;
    if (!tracer.mesh.parent) ctx.scene.add(tracer.mesh);
    this.tracers.push(tracer);
  }

  private makeTracer() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: FOREST, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Line(geometry, material);
    mesh.frustumCulled = false;
    const tracer = { mesh, life: 0 };
    return tracer;
  }

  private stepTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      if (tracer.life > 0) continue;
      tracer.mesh.removeFromParent();
      this.tracers.splice(i, 1);
      this.tracerPool.push(tracer);
    }
  }
}
