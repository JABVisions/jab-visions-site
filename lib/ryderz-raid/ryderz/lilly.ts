import * as THREE from 'three';
import type { AbilityId } from '../config';
import { targetsInRadius } from '../combat';
import type { PoseOverride } from '../skeletal';
import { animalSummonRegistry, type AnimalDef } from './animal-registry';
import { forkOn, type LillyFork } from './lilly-fork';
import {
  BOOST_DRAIN,
  BOOST_SPEED,
  FLY_DRAIN,
  FLY_SPEED,
  MOUNT_TIME,
  forkArmed,
  forkVisible,
  inArc,
  shouldStartFlight,
  stepAltitude,
  type FlightPhase,
} from './lilly-flight';
import type { HazardZone, KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';
import {
  GIANT_COOLDOWN,
  GIANT_HOLD,
  GIANT_MOVE,
  GIANT_SCALE,
  SOUL_COOLDOWN,
  SOUL_DPS,
  SOUL_HEAL_RATIO,
  SOUL_RADIUS,
  STOMP_CORE,
  STOMP_CORE_DAMAGE,
  STOMP_SHOCK,
  STOMP_SHOCK_DAMAGE,
  STOMP_TELEGRAPH,
  SUMMON_COOLDOWN,
  SUMMON_DURATION,
  healFromDamage,
  radiusForScale,
  scaleForGrow,
  stompBand,
  summonOffset,
  type GrowPhase,
} from './lilly-combat';

const GREEN = 0x39f07a;

const COMBO: MeleeStep[] = [
  { style: 'slap', damageMul: 0.8, hitDelay: 0.14, range: 2.3, halfArc: 0.85, reaction: 'stagger', strength: 0.9, recovery: 0.3, shake: 0.04, hitStop: 0, lunge: 0.16, sound: 'lilly.melee.slap' },
  { style: 'kick', damageMul: 1.05, hitDelay: 0.16, range: 2.45, halfArc: 0.7, reaction: 'knockback', strength: 1, recovery: 0.36, shake: 0.08, hitStop: 0.02, lunge: 0.22, sound: 'lilly.melee.kick' },
  { style: 'smash', damageMul: 1.35, hitDelay: 0.18, range: 2.6, halfArc: 0.8, reaction: 'heavy', strength: 1.05, recovery: 0.48, shake: 0.16, hitStop: 0.04, lunge: 0.28, sound: 'lilly.melee.smash' },
];

interface GrowState {
  phase: GrowPhase;
  t: number;
  held: number;
  stride: number;
  foot: number;
  telegraph: { x: number; z: number; life: number; core: number; shock: number } | null;
}

interface Floater {
  sprite: THREE.Sprite;
  life: number;
  vy: number;
}

const _hits: KitTarget[] = [];
const _dir = new THREE.Vector3();

export class LillyKit implements RyderKit {
  private ctx: KitContext | null = null;
  private drainOn = false;
  private drainFade = 0;
  private drainTick = 0;
  private grow: GrowState | null = null;
  private summonT = -1;
  private poseState: PoseOverride | null = null;
  private comboIndex = 0;
  private comboExpires = 0;
  private scale = 1;
  private vortex: THREE.Group | null = null;
  private vortexMats: THREE.ShaderMaterial[] = [];
  private vortexField: THREE.Mesh | null = null;
  private tendrils: THREE.LineSegments | null = null;
  private tendrilPos: Float32Array | null = null;
  private circle: THREE.Group | null = null;
  private floaters: Floater[] = [];
  private animals: SummonedAnimal[] = [];
  private flight: FlightPhase = 'ground';
  private altitude = 0;
  private mountT = 0;
  private mountFrom = 0;
  private auraNow = 0;
  private auraBurnout = false;
  private fork: LillyFork | null = null;
  private bank = 0;
  private lastYaw = 0;
  private airKind: 'punch' | 'kick' | 'melee' | null = null;
  private airT = 0;
  private airLock = 0;
  private airHit = false;
  private pendingAir: 'punch' | 'kick' | 'melee' | null = null;
  private boosting = false;

  get locked() {
    return this.summonT >= 0 || (this.grow !== null && this.grow.phase !== 'giant');
  }

  get airY() {
    return this.altitude;
  }

  get flying() {
    return this.flight !== 'ground';
  }

  get forkArmed() {
    return forkArmed({ aura: this.auraNow, burnout: this.auraBurnout, phase: this.flight });
  }

  get pose() {
    return this.poseState;
  }

  get moveScale() {
    if (this.flight === 'flying' || this.flight === 'attacking') return this.boosting ? BOOST_SPEED : FLY_SPEED;
    if (this.flight === 'mounting') return 1.2;
    return this.grow?.phase === 'giant' ? GIANT_MOVE : 1;
  }

  get bodyScale() {
    return this.scale;
  }

  get radiusScale() {
    return radiusForScale(this.scale);
  }

  get cameraExtra() {
    if (this.flight !== 'ground') return { distance: 3.4, height: 1.8, targetHeight: 1.15 };
    const extra = this.scale - 1;
    if (extra < 0.02) return null;
    return { distance: extra * 2.55, height: extra * 1.15, targetHeight: extra * 0.9 };
  }

  get glow() {
    if (this.summonT >= 0) return 0.55 + Math.sin(this.summonT * 14) * 0.15;
    if (this.grow && this.grow.phase !== 'giant') return 0.7;
    if (this.drainOn) return 0.28;
    return 0;
  }

  hazards(): HazardZone[] {
    const zones: HazardZone[] = [];
    const ctx = this.ctx;
    if (!ctx) return zones;
    if (this.drainOn || this.drainFade > 0.05) {
      zones.push({ x: ctx.pos.x, z: ctx.pos.z, radius: SOUL_RADIUS * Math.max(this.drainFade, this.drainOn ? 1 : 0), kind: 'drain' });
    }
    const mark = this.grow?.telegraph;
    if (mark && mark.life > 0) zones.push({ x: mark.x, z: mark.z, radius: mark.shock, kind: 'stomp' });
    return zones;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    this.scale = 1;
    this.buildVortex(ctx);
    this.buildCircle(ctx);
    this.buildTendrils(ctx);
  }

  detach() {
    this.interrupt();
    const ctx = this.ctx;
    if (ctx) {
      if (this.vortex) ctx.scene.remove(this.vortex);
      if (this.tendrils) ctx.scene.remove(this.tendrils);
      if (this.circle) ctx.scene.remove(this.circle);
      for (const floater of this.floaters) ctx.scene.remove(floater.sprite);
      for (const animal of this.animals) animal.dispose(ctx.scene);
    }
    this.vortex?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
    });
    for (const material of this.vortexMats) material.dispose();
    this.vortexMats = [];
    this.tendrils?.geometry.dispose();
    (this.tendrils?.material as THREE.Material | undefined)?.dispose();
    this.floaters = [];
    this.animals = [];
    this.vortex = null;
    this.vortexField = null;
    this.circle = null;
    this.tendrils = null;
    this.ctx = null;
  }

  interrupt() {
    this.drainOn = false;
    this.drainFade = 0;
    this.grow = null;
    this.summonT = -1;
    this.poseState = null;
    this.scale = 1;
    this.endFlight(true);
    this.applyScale(1);
    if (this.vortex) this.vortex.visible = false;
    if (this.circle) this.circle.visible = false;
    if (this.tendrils) this.tendrils.visible = false;
    const ctx = this.ctx;
    if (ctx) {
      for (const animal of this.animals) animal.dispose(ctx.scene);
    }
    this.animals = [];
  }

  melee(time: number): MeleeStep | null {
    if (this.locked || this.flying) return null;
    if (this.forkArmed) return this.harvestSlam();
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + 0.9;
    const mul = this.grow?.phase === 'giant' ? 1.8 : 1;
    return { ...step, damageMul: step.damageMul * mul, range: step.range * (this.grow?.phase === 'giant' ? 1.8 : 1) };
  }

  tryAirJump(sinceJump: number, height: number) {
    if (!shouldStartFlight({ airborne: true, sinceJump, giant: this.grow !== null, phase: this.flight })) return false;
    this.flight = 'mounting';
    this.mountT = 0;
    this.mountFrom = Math.max(0.35, height);
    this.altitude = this.mountFrom;
    this.pendingAir = null;
    this.airLock = 0;
    this.fork?.ride();
    this.ctx?.sound('lilly.fork.mount');
    this.ctx?.camera.addShake(0.08);
    return true;
  }

  airStrike(kind: 'punch' | 'kick' | 'melee') {
    if (this.flight === 'mounting' || this.flight === 'dismounting') {
      this.pendingAir = kind;
      return;
    }
    if (this.flight !== 'flying' && this.flight !== 'attacking') return;
    if (this.airLock > 0) return;
    this.beginAir(kind);
  }

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    if (id === 'soulDrain') return this.startDrain();
    if (id === 'giantStep') return this.startGiant();
    if (id === 'animalAllegiance') return this.startSummon();
    return false;
  }

  endAbility(id: AbilityId) {
    if (id !== 'soulDrain') return;
    this.drainOn = false;
    this.ctx?.sound('lilly.drain.end');
    this.ctx?.cooldown('soulDrain', SOUL_COOLDOWN);
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.auraNow = frame.aura ?? 0;
    this.auraBurnout = frame.burnout ?? false;
    this.stepGrow(frame);
    this.stepFlight(frame);
    this.stepSummon(frame);
    this.stepDrain(frame);
    this.stepAnimals(frame.dt);
    this.stepFloaters(frame.dt);
    this.syncFork();
    this.poseState = this.pickPose(frame);
    this.applyScale(this.scale);
  }

  private startDrain() {
    if (this.drainOn) return true;
    this.drainOn = true;
    this.drainFade = 0.15;
    this.drainTick = 0;
    this.ctx?.sound('lilly.drain.start');
    this.ctx?.camera.addShake(0.12);
    return true;
  }

  private startGiant() {
    if (this.grow) return true;
    if (this.flight !== 'ground') this.endFlight(true);
    this.grow = { phase: 'plant', t: 0, held: 0, stride: 0, foot: 0, telegraph: null };
    this.ctx?.sound('lilly.giant.start');
    this.ctx?.camera.addShake(0.2);
    this.ctx?.cooldown('giantStep', GIANT_COOLDOWN);
    return true;
  }

  private startSummon() {
    if (this.summonT >= 0 || (this.grow && this.grow.phase !== 'giant')) return true;
    this.summonT = 0;
    this.ctx?.sound('lilly.summon.start');
    this.ctx?.cooldown('animalAllegiance', SUMMON_COOLDOWN);
    return true;
  }

  private stepGrow(frame: KitFrame) {
    const grow = this.grow;
    const ctx = this.ctx;
    if (!grow || !ctx) return;
    const dt = frame.dt;
    if (grow.phase === 'plant') {
      grow.t += dt / 0.42;
      this.scale = scaleForGrow('plant', grow.t);
      if (grow.t >= 1) {
        grow.phase = 'expand';
        grow.t = 0;
        ctx.camera.addShake(0.45);
        ctx.sound('lilly.giant.expand');
      }
    } else if (grow.phase === 'expand') {
      grow.t += dt / 0.7;
      this.scale = scaleForGrow('expand', grow.t);
      if (Math.random() < dt * 18) this.spiral(ctx, this.scale);
      if (grow.t >= 1) {
        grow.phase = 'giant';
        grow.t = 0;
        grow.held = GIANT_HOLD;
        this.scale = GIANT_SCALE;
      }
    } else if (grow.phase === 'giant') {
      grow.held -= dt;
      this.scale = GIANT_SCALE;
      this.stepFeet(frame, grow);
      if (grow.held <= 0) {
        grow.phase = 'shrink';
        grow.t = 0;
        ctx.sound('lilly.giant.end');
      }
    } else {
      grow.t += dt / 0.65;
      this.scale = scaleForGrow('shrink', grow.t);
      if (grow.t >= 1) {
        this.grow = null;
        this.scale = 1;
      }
    }
  }

  private stepFeet(frame: KitFrame, grow: GrowState) {
    const ctx = this.ctx;
    if (!ctx) return;
    const moving = frame.speed > 0.45;
    const rate = moving ? frame.speed : 1.15;
    grow.stride += rate * frame.dt;
    const span = moving ? 1.55 * this.scale * 0.55 : 1.25;
    if (grow.stride < span) {
      if (grow.telegraph) {
        grow.telegraph.life -= frame.dt;
        if (grow.telegraph.life <= 0) {
          this.impact(grow.telegraph.x, grow.telegraph.z, grow.telegraph.core, grow.telegraph.shock);
          grow.telegraph = null;
        }
      }
      return;
    }
    grow.stride = 0;
    grow.foot = 1 - grow.foot;
    const yaw = ctx.yaw();
    const side = grow.foot === 0 ? -1 : 1;
    const x = ctx.pos.x + Math.cos(yaw) * side * 0.45 * this.scale;
    const z = ctx.pos.z - Math.sin(yaw) * side * 0.45 * this.scale;
    grow.telegraph = {
      x,
      z,
      life: STOMP_TELEGRAPH,
      core: STOMP_CORE * (0.55 + this.scale * 0.22),
      shock: STOMP_SHOCK * (0.45 + this.scale * 0.2),
    };
  }

  private impact(x: number, z: number, core: number, shock: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const y = ctx.heightAt(x, z);
    ctx.rings.spawn(new THREE.Vector3(x, y, z), GREEN, { radius: shock, duration: 0.42 });
    ctx.cracks.spawn(new THREE.Vector3(x, y, z), shock * 0.85, 3.2);
    ctx.particles.emit(new THREE.Vector3(x, y + 0.15, z), 0xc8b49a, 16, { speed: 7, size: 0.28, life: 0.55, up: 2.2, gravity: 12 });
    ctx.particles.emit(new THREE.Vector3(x, y + 0.2, z), GREEN, 10, { speed: 5, size: 0.34, life: 0.4, up: 1.4 });
    ctx.camera.addShake(0.28);
    ctx.sound('lilly.giant.stomp');
    const hit = new Set<KitTarget>();
    for (const target of ctx.targets()) {
      if (target.hp <= 0 || hit.has(target)) continue;
      const dist = Math.hypot(target.pos.x - x, target.pos.z - z);
      const band = stompBand(dist, core + target.radius, shock + target.radius);
      if (!band) continue;
      hit.add(target);
      _dir.set(target.pos.x - x, 0, target.pos.z - z);
      if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0);
      _dir.normalize();
      const damage = band === 'crush' ? STOMP_CORE_DAMAGE : STOMP_SHOCK_DAMAGE;
      const dealt = ctx.hurt(target, damage, _dir, band === 'crush' ? 'slam' : 'knockback', band === 'crush' ? 1.25 : 0.85);
      this.floater(target.pos.x, target.pos.y + 1.6, target.pos.z, `-${Math.round(dealt || damage)}`, 0xfff1c2);
    }
  }

  private stepDrain(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx || !this.vortex) return;
    if (!this.drainOn) this.drainFade = Math.max(0, this.drainFade - frame.dt * 1.4);
    else this.drainFade = Math.min(1, this.drainFade + frame.dt * 1.8);
    const shown = this.drainFade > 0.02;
    this.vortex.visible = shown;
    if (this.tendrils) this.tendrils.visible = shown && this.drainOn;
    if (!shown) return;
    const radius = SOUL_RADIUS * this.drainFade;
    const y = ctx.heightAt(ctx.pos.x, ctx.pos.z);
    this.vortex.position.set(ctx.pos.x, y + this.altitude, ctx.pos.z);
    if (this.vortexField) {
      const span = radius / SOUL_RADIUS;
      this.vortexField.scale.set(span, 1, span);
    }
    for (const material of this.vortexMats) {
      material.uniforms.uTime.value = frame.time;
      material.uniforms.uStrength.value = this.drainFade;
    }
    if (this.drainOn && frame.dt > 0 && Math.random() < 0.9) {
      const a = frame.time * 2.6 + Math.random() * 0.5;
      const r = 0.4 + Math.random() * 0.85;
      const h = 0.25 + Math.random() * 1.7;
      _dir.set(-Math.sin(a), 0.85, Math.cos(a));
      ctx.particles.emit(new THREE.Vector3(ctx.pos.x + Math.cos(a) * r, y + h, ctx.pos.z + Math.sin(a) * r), GREEN, 1, {
        speed: 1.6,
        direction: _dir,
        spread: 0.2,
        size: 0.14 + Math.random() * 0.1,
        life: 0.5,
        gravity: -0.8,
      });
    }
    if (!this.drainOn) {
      this.clearTendrils();
      return;
    }
    this.drainTick -= frame.dt;
    const inside = targetsInRadius(ctx.targets(), ctx.pos, radius, _hits).filter((target) => target.hp > 0);
    this.drawTendrils(inside, y);
    if (this.drainTick > 0) return;
    this.drainTick = 0.25;
    let dealtSum = 0;
    for (const target of inside) {
      _dir.set(ctx.pos.x - target.pos.x, 0, ctx.pos.z - target.pos.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
      _dir.normalize();
      const dealt = ctx.hurt(target, SOUL_DPS * 0.25, _dir, 'stagger', 0.25);
      if (dealt <= 0) continue;
      dealtSum += dealt;
      ctx.flash(target, GREEN, 0.2);
      this.floater(target.pos.x, target.pos.y + 1.5, target.pos.z, `-${Math.round(dealt)}`, 0xb8ffc8);
      ctx.particles.emit(target.pos.clone().setY(1.1), GREEN, 3, { speed: 2.2, size: 0.16, life: 0.35, up: 1.2 });
    }
    if (dealtSum > 0) {
      const healed = ctx.heal(dealtSum * SOUL_HEAL_RATIO);
      if (healed > 0) this.floater(ctx.pos.x, 2.1, ctx.pos.z, `+${Math.round(healed)}`, 0x7dff9a);
    }
  }

  private stepSummon(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx || !this.circle || this.summonT < 0) {
      if (this.circle) this.circle.visible = false;
      return;
    }
    this.summonT += frame.dt;
    const y = ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05;
    this.circle.visible = true;
    this.circle.position.set(ctx.pos.x, y, ctx.pos.z);
    const spin = this.circle.children[1];
    if (spin) spin.rotation.z = frame.time * 1.8;
    const gather = Math.min(1, this.summonT / 0.55);
    this.circle.scale.setScalar(0.4 + gather * 1.5);
    if (Math.random() < frame.dt * 14) {
      ctx.particles.emit(new THREE.Vector3(ctx.pos.x, y + 0.2, ctx.pos.z), GREEN, 2, { speed: 3.5, size: 0.2, life: 0.4, up: 2 });
    }
    ctx.power.arcAt(['handL', 'handR'], 1, 0.7, 0.1, 0.03);
    if (this.summonT >= SUMMON_DURATION * 0.72 && this.summonT - frame.dt < SUMMON_DURATION * 0.72) {
      ctx.rings.spawn(new THREE.Vector3(ctx.pos.x, y, ctx.pos.z), GREEN, { radius: 3.2, duration: 0.5 });
      ctx.camera.addShake(0.22);
      ctx.sound('lilly.summon.pulse');
      this.callAnimal();
    }
    if (this.summonT >= SUMMON_DURATION) {
      this.summonT = -1;
      this.circle.visible = false;
    }
  }

  private callAnimal() {
    const ctx = this.ctx;
    if (!ctx) return;
    const def = animalSummonRegistry.pick();
    if (!def) return;
    const offset = summonOffset(ctx.yaw(), ctx.radius * this.radiusScale);
    const pos = new THREE.Vector3(ctx.pos.x + offset.x, 0, ctx.pos.z + offset.z);
    if (ctx.blocked(pos.x, pos.z, 0.45)) {
      pos.set(ctx.pos.x - offset.x, 0, ctx.pos.z - offset.z);
    }
    pos.y = ctx.heightAt(pos.x, pos.z);
    const animal = new SummonedAnimal(def, pos);
    this.animals.push(animal);
    void animal.attach(ctx.scene);
  }

  private stepAnimals(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = this.animals.length - 1; i >= 0; i -= 1) {
      const animal = this.animals[i];
      animal.update(dt, ctx.targets(), (target, damage) => {
        _dir.set(target.pos.x - animal.pos.x, 0, target.pos.z - animal.pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0);
        _dir.normalize();
        ctx.hurt(target, damage, _dir, 'stagger', 0.6);
      }, (x, z) => ctx.heightAt(x, z));
      if (!animal.alive) {
        animal.dispose(ctx.scene);
        this.animals.splice(i, 1);
      }
    }
  }

  private pickPose(frame: KitFrame): PoseOverride | null {
    if (this.summonT >= 0) {
      return { kind: 'summon', t: Math.min(1, this.summonT / SUMMON_DURATION), weight: 1 };
    }
    if (this.grow) {
      if (this.grow.phase === 'plant' || this.grow.phase === 'expand') {
        return { kind: 'grow', t: this.grow.phase === 'plant' ? this.grow.t : 1, weight: 1 };
      }
      if (this.grow.phase === 'shrink') return { kind: 'grow', t: 1 - this.grow.t, weight: 0.8 };
      if (this.grow.telegraph) return { kind: 'stomp', t: this.grow.foot, weight: 0.85 };
      return { kind: 'grow', t: 0.35 + (frame.moving ? 0.2 : 0), weight: 0.28 };
    }
    if (this.flight !== 'ground') {
      const mounting = this.flight === 'mounting' ? Math.min(1, this.mountT) : 1;
      const leaving = this.flight === 'dismounting' ? Math.min(1, this.altitude / 1.6) : 1;
      const attacking = this.flight === 'attacking' ? 0.4 : 1;
      return {
        kind: 'ride',
        t: 0.5 + Math.sin(frame.time * 2.2) * 0.5,
        weight: mounting * leaving * (this.flight === 'attacking' ? attacking : 0.96),
        lean: this.bank * 0.35,
        bank: this.bank,
      };
    }
    if (this.drainOn) return { kind: 'channel', t: this.drainFade, weight: frame.moving ? 0.45 : 0.82 };
    return null;
  }

  private harvestSlam(): MeleeStep {
    const giant = this.grow?.phase === 'giant';
    const mul = giant ? 1.8 : 1;
    return {
      style: 'forkSlam',
      damageMul: 1.45 * mul,
      hitDelay: 0.2,
      range: 2.55 * mul,
      halfArc: 0.5,
      reaction: 'heavy',
      strength: 1.15,
      recovery: 0.52,
      shake: 0.22,
      hitStop: 0.05,
      lunge: 0.18,
      sound: 'lilly.fork.slam',
      shockRange: 4.4 * (giant ? 1.6 : 1),
      shockMul: 0.42,
    };
  }

  private ensureFork() {
    if (this.fork) return this.fork;
    this.fork = forkOn(this.ctx?.fighter()?.humanoid.group ?? null);
    return this.fork;
  }

  private syncFork() {
    const fork = this.ensureFork();
    if (!fork) return;
    const shown = forkVisible({ aura: this.auraNow, burnout: this.auraBurnout });
    if (shown && this.flight !== 'ground') fork.ride();
    else fork.hold();
    fork.setShown(shown);
    fork.setGlow(shown);
  }

  /** Snap puts her on the ground at once. Otherwise she descends and then lands. */
  private endFlight(snap: boolean) {
    this.pendingAir = null;
    this.airKind = null;
    this.airLock = 0;
    this.airHit = false;
    this.boosting = false;
    if (snap || this.altitude <= 0.08) {
      this.flight = 'ground';
      this.altitude = 0;
      this.mountT = 0;
      this.fork?.hold();
      return;
    }
    this.flight = 'dismounting';
  }

  private beginAir(kind: 'punch' | 'kick' | 'melee') {
    const ctx = this.ctx;
    if (!ctx) return;
    this.flight = 'attacking';
    this.airKind = kind;
    this.airT = 0;
    this.airHit = false;
    this.airLock = kind === 'melee' ? 0.7 : 0.42;
    const style = kind === 'punch' ? 'forkThrust' : kind === 'kick' ? 'forkSweep' : 'forkSlam';
    ctx.strike(style);
    ctx.sound(kind === 'melee' ? 'lilly.fork.dive' : 'lilly.fork.swing');
  }

  private stepFlight(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.airLock = Math.max(0, this.airLock - frame.dt);
    if (frame.stunned && this.flight !== 'ground' && this.flight !== 'dismounting') this.endFlight(false);
    if (this.flight === 'ground') return;

    const yaw = ctx.yaw();
    let dy = yaw - this.lastYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.lastYaw = yaw;
    const targetBank = Math.max(-0.45, Math.min(0.45, -dy * 2.4));
    this.bank += (targetBank - this.bank) * Math.min(1, frame.dt * 8);

    if (this.flight === 'mounting') {
      this.mountT += frame.dt / MOUNT_TIME;
      const rise = Math.max(this.mountFrom, 1.75);
      const u = Math.min(1, this.mountT);
      const s = u * u * (3 - 2 * u);
      this.altitude = this.mountFrom + (rise - this.mountFrom) * s;
      if (this.mountT >= 1) {
        this.flight = 'flying';
        this.altitude = rise;
        if (this.pendingAir) {
          const next = this.pendingAir;
          this.pendingAir = null;
          this.beginAir(next);
        }
      }
    } else if (this.flight === 'dismounting') {
      this.altitude = Math.max(0, this.altitude - 9 * frame.dt);
      if (this.altitude <= 0.04) this.endFlight(true);
    } else {
      this.boosting = (frame.boost ?? false) && this.flight === 'flying';
      const climb: -1 | 0 | 1 = frame.ascend ? 1 : frame.descend ? -1 : 0;
      if (this.flight === 'attacking' && this.airKind === 'melee') {
        this.altitude = Math.max(0, this.altitude - 22 * frame.dt);
      } else if (this.flight === 'attacking') {
        this.altitude = stepAltitude(this.altitude, frame.dt, frame.descend ? -1 : 0);
      } else {
        this.altitude = stepAltitude(this.altitude, frame.dt, climb);
      }
      this.stepAirAttack(frame);
      const phase = this.flight as FlightPhase;
      const rate = this.boosting ? BOOST_DRAIN : FLY_DRAIN;
      const left = ctx.spendAura(rate * frame.dt);
      if ((left <= 0 || frame.burnout) && phase !== 'ground') this.endFlight(false);
      if (this.altitude <= 0.04 && phase === 'flying') this.endFlight(true);
      if (phase !== 'ground' && Math.random() < frame.dt * 16) {
        ctx.particles.emit(
          new THREE.Vector3(ctx.pos.x - Math.sin(yaw) * 0.85, this.altitude + 0.7, ctx.pos.z - Math.cos(yaw) * 0.85),
          GREEN,
          1,
          { speed: 1.2, size: 0.18, life: 0.45, up: 0.3, gravity: 1.5 },
        );
      }
    }
  }

  /** The swing is already playing. Damage lands once, inside the active window. */
  private stepAirAttack(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx || this.flight !== 'attacking' || !this.airKind) return;
    this.airT += frame.dt;
    const yaw = ctx.yaw();
    if (this.airKind === 'punch' && this.airT < 0.18) {
      ctx.pos.x += Math.sin(yaw) * 8 * frame.dt;
      ctx.pos.z += Math.cos(yaw) * 8 * frame.dt;
      ctx.resolve(ctx.pos);
    }
    if (this.airKind === 'kick' && this.airT < 0.16) {
      ctx.pos.x += Math.sin(yaw) * 3 * frame.dt;
      ctx.pos.z += Math.cos(yaw) * 3 * frame.dt;
      ctx.resolve(ctx.pos);
    }
    const window =
      this.airKind === 'punch' ? this.airT >= 0.1
      : this.airKind === 'kick' ? this.airT >= 0.12
      : this.altitude <= 0.35;
    if (window && !this.airHit) {
      this.airHit = true;
      this.connectAir(yaw);
    }
    const done = this.airKind === 'melee' ? this.airHit && this.airT > 0.15 : this.airT >= this.airLock;
    if (!done) return;
    this.airKind = null;
    this.airT = 0;
    if (this.auraNow <= 0 || this.auraBurnout) {
      this.endFlight(this.altitude <= 0.2);
      return;
    }
    if (this.altitude < 1.2) this.altitude = Math.min(1.6, this.altitude + 1.2);
    this.flight = 'flying';
  }

  private connectAir(yaw: number) {
    const ctx = this.ctx;
    if (!ctx || !this.airKind) return;
    const kind = this.airKind;
    if (kind === 'melee') {
      const y = ctx.heightAt(ctx.pos.x, ctx.pos.z);
      ctx.rings.spawn(new THREE.Vector3(ctx.pos.x, y + 0.05, ctx.pos.z), GREEN, { radius: 3.4, duration: 0.4 });
      ctx.cracks.spawn(new THREE.Vector3(ctx.pos.x, y, ctx.pos.z), 2.4, 2.2);
      ctx.particles.emit(new THREE.Vector3(ctx.pos.x, y + 0.2, ctx.pos.z), GREEN, 14, { speed: 6, size: 0.28, life: 0.4, up: 1.6 });
      ctx.camera.addShake(0.24);
      ctx.sound('lilly.fork.slam');
      for (const target of ctx.targets()) {
        if (target.hp <= 0) continue;
        const dist = Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z);
        if (dist > 3.4 + target.radius) continue;
        _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
        _dir.normalize();
        ctx.hurt(target, ctx.meleeDamage() * 1.35, _dir, 'slam', 1.1);
      }
      return;
    }
    const range = kind === 'punch' ? 2.8 : 3.2;
    const halfArc = kind === 'punch' ? 0.4 : 1.35;
    const mul = kind === 'punch' ? 0.7 : 1.05;
    let connected = false;
    for (const target of ctx.targets()) {
      if (target.hp <= 0) continue;
      if (!inArc(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z, yaw, range, halfArc, target.radius)) continue;
      connected = true;
      _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
      _dir.normalize();
      ctx.hurt(target, ctx.meleeDamage() * mul, _dir, kind === 'punch' ? 'stagger' : 'knockback', kind === 'punch' ? 0.75 : 1);
      ctx.particles.emit(target.pos.clone().setY(1.2), GREEN, 4, { speed: 3, size: 0.22, life: 0.2 });
    }
    ctx.sound(connected ? 'lilly.fork.hit' : 'lilly.fork.whiff');
    if (kind === 'kick') {
      ctx.particles.emit(ctx.pos.clone().setY(this.altitude + 1), GREEN, 8, { speed: 5, size: 0.2, life: 0.25, up: 0.2 });
    }
  }

  private applyScale(scale: number) {
    const group = this.ctx?.fighter()?.humanoid.group;
    if (group && Math.abs(group.scale.x - scale) > 0.0001) group.scale.setScalar(scale);
  }

  private spiral(ctx: KitContext, scale: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.5 * scale;
    ctx.particles.emit(new THREE.Vector3(ctx.pos.x + Math.cos(a) * r, 0.2, ctx.pos.z + Math.sin(a) * r), GREEN, 1, {
      speed: 2 + scale,
      size: 0.22,
      life: 0.5,
      up: 3 + scale,
    });
  }

  private buildVortex(ctx: KitContext) {
    const group = new THREE.Group();
    const swirl = (spin: number, bands: number, alpha: number) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uStrength: { value: 1 },
          uSpin: { value: spin },
          uBands: { value: bands },
          uAlpha: { value: alpha },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          uniform float uStrength;
          uniform float uSpin;
          uniform float uBands;
          uniform float uAlpha;
          void main() {
            float stripe = abs(fract(vUv.x * 3.0 + vUv.y * uBands - uTime * uSpin) - 0.5);
            float streak = smoothstep(0.46, 0.04, stripe);
            float lift = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
            vec3 col = mix(vec3(0.04, 0.42, 0.16), vec3(0.72, 1.0, 0.78), streak);
            float alpha = (0.04 + streak * 0.7) * lift * uStrength * uAlpha;
            if (alpha < 0.02) discard;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });

    const add = (top: number, bottom: number, height: number, spin: number, bands: number, alpha: number) => {
      const material = swirl(spin, bands, alpha);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 48, 1, true), material);
      mesh.position.y = height * 0.5;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.vortexMats.push(material);
      group.add(mesh);
      return mesh;
    };

    // A column around her body, and a wider spiral out to the drain's edge.
    add(0.42, 1.05, 2.6, 1.8, 2.4, 0.85);
    this.vortexField = add(SOUL_RADIUS * 0.42, SOUL_RADIUS * 0.9, 2.8, -0.9, 3.4, 0.28);
    group.visible = false;
    ctx.scene.add(group);
    this.vortex = group;
  }

  private buildTendrils(ctx: KitContext) {
    const count = 8;
    this.tendrilPos = new Float32Array(count * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.tendrilPos, 3));
    const material = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.75 });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.visible = false;
    ctx.scene.add(lines);
    this.tendrils = lines;
  }

  private drawTendrils(targets: KitTarget[], y: number) {
    const ctx = this.ctx;
    const data = this.tendrilPos;
    const lines = this.tendrils;
    if (!ctx || !data || !lines) return;
    data.fill(0);
    const n = Math.min(8, targets.length);
    for (let i = 0; i < n; i += 1) {
      const target = targets[i];
      const base = i * 6;
      data[base] = ctx.pos.x;
      data[base + 1] = y + 1.15;
      data[base + 2] = ctx.pos.z;
      data[base + 3] = target.pos.x;
      data[base + 4] = target.pos.y + 1.05;
      data[base + 5] = target.pos.z;
    }
    (lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    lines.geometry.setDrawRange(0, n * 2);
  }

  private clearTendrils() {
    if (!this.tendrils || !this.tendrilPos) return;
    this.tendrilPos.fill(0);
    (this.tendrils.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.tendrils.geometry.setDrawRange(0, 0);
  }

  private buildCircle(ctx: KitContext) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const symbols = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xd8ffe4, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
      );
      const a = (i / 6) * Math.PI * 2;
      mark.position.set(Math.cos(a) * 1.25, 0.04, Math.sin(a) * 1.25);
      mark.lookAt(0, 0.04, 0);
      symbols.add(mark);
    }
    group.add(ring);
    group.add(symbols);
    group.visible = false;
    ctx.scene.add(group);
    this.circle = group;
  }

  private floater(x: number, y: number, z: number, text: string, color: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    let slot = this.floaters.find((item) => item.life <= 0);
    if (!slot) {
      if (this.floaters.length >= 12) slot = this.floaters[0];
      else {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.7, 0.35, 1);
        sprite.renderOrder = 6;
        ctx.scene.add(sprite);
        slot = { sprite, life: 0, vy: 1.2 };
        this.floaters.push(slot);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 128, 64);
    g.font = '700 40px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.fillText(text, 64, 44);
    const texture = new THREE.CanvasTexture(canvas);
    const material = slot.sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.map = texture;
    material.opacity = 1;
    slot.sprite.position.set(x, y, z);
    slot.life = 0.7;
    slot.vy = 1.3;
  }

  private stepFloaters(dt: number) {
    for (const floater of this.floaters) {
      if (floater.life <= 0) continue;
      floater.life -= dt;
      floater.sprite.position.y += floater.vy * dt;
      (floater.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, floater.life / 0.7);
      if (floater.life <= 0) floater.sprite.visible = false;
      else floater.sprite.visible = true;
    }
  }
}

/** A registered animal. Constructed only after a GLB is on the book. */
export class SummonedAnimal {
  readonly pos = new THREE.Vector3();
  hp: number;
  alive = true;
  private root: THREE.Object3D | null = null;
  private attack = 0.4;
  private age = 0;

  constructor(readonly def: AnimalDef, pos: THREE.Vector3) {
    this.hp = def.health;
    this.pos.copy(pos);
  }

  async attach(scene: THREE.Scene) {
    if (!this.def.glb) {
      this.alive = false;
      return;
    }
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(this.def.glb);
      this.root = gltf.scene;
      this.root.position.copy(this.pos);
      scene.add(this.root);
    } catch (error) {
      console.warn('[raid] animal model failed', this.def.id, error);
      this.alive = false;
    }
  }

  update(
    dt: number,
    targets: readonly KitTarget[],
    attack: (target: KitTarget, damage: number) => void,
    heightAt: (x: number, z: number) => number,
  ) {
    if (!this.alive) return;
    this.age += dt;
    if (this.age >= this.def.life || this.hp <= 0) {
      this.alive = false;
      return;
    }
    let best: KitTarget | null = null;
    let bestD = Infinity;
    for (const target of targets) {
      if (target.hp <= 0) continue;
      const d = this.pos.distanceToSquared(target.pos);
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    this.attack = Math.max(0, this.attack - dt);
    if (best) {
      const dist = Math.sqrt(bestD);
      if (dist > 1.15) {
        _dir.set(best.pos.x - this.pos.x, 0, best.pos.z - this.pos.z).normalize();
        const speed = this.def.behavior === 'leap' ? this.def.speed * 1.25 : this.def.speed;
        this.pos.addScaledVector(_dir, speed * dt);
      } else if (this.attack <= 0) {
        attack(best, this.def.damage);
        this.attack = this.def.behavior === 'orbit' ? 0.85 : 0.55;
      }
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    if (this.root) {
      this.root.position.copy(this.pos);
      if (best) this.root.lookAt(best.pos.x, this.pos.y, best.pos.z);
    }
  }

  dispose(scene: THREE.Scene) {
    if (!this.root) return;
    scene.remove(this.root);
    this.root = null;
  }
}

/** Heal helper re-exported so a tick can clamp without the kit. */
export function healedAmount(hp: number, maxHp: number, dealt: number) {
  return healFromDamage(hp, maxHp, dealt).healed;
}
