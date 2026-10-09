import * as THREE from 'three';
import type { AbilityId } from '../config';
import { targetsInRadius } from '../combat';
import type { PoseOverride } from '../skeletal';
import { animalSummonRegistry, type AnimalDef } from './animal-registry';
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
  private puddle: THREE.Mesh | null = null;
  private puddleMat: THREE.ShaderMaterial | null = null;
  private tendrils: THREE.LineSegments | null = null;
  private tendrilPos: Float32Array | null = null;
  private circle: THREE.Group | null = null;
  private floaters: Floater[] = [];
  private animals: SummonedAnimal[] = [];

  get locked() {
    return this.summonT >= 0 || (this.grow !== null && this.grow.phase !== 'giant');
  }

  get airY() {
    return 0;
  }

  get pose() {
    return this.poseState;
  }

  get moveScale() {
    return this.grow?.phase === 'giant' ? GIANT_MOVE : 1;
  }

  get bodyScale() {
    return this.scale;
  }

  get radiusScale() {
    return radiusForScale(this.scale);
  }

  get cameraExtra() {
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
    this.buildPuddle(ctx);
    this.buildCircle(ctx);
    this.buildTendrils(ctx);
  }

  detach() {
    this.interrupt();
    const ctx = this.ctx;
    if (ctx) {
      if (this.puddle) ctx.scene.remove(this.puddle);
      if (this.tendrils) ctx.scene.remove(this.tendrils);
      if (this.circle) ctx.scene.remove(this.circle);
      for (const floater of this.floaters) ctx.scene.remove(floater.sprite);
      for (const animal of this.animals) animal.dispose(ctx.scene);
    }
    this.puddle?.geometry.dispose();
    this.puddleMat?.dispose();
    this.tendrils?.geometry.dispose();
    (this.tendrils?.material as THREE.Material | undefined)?.dispose();
    this.floaters = [];
    this.animals = [];
    this.puddle = null;
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
    this.applyScale(1);
    if (this.puddle) this.puddle.visible = false;
    if (this.circle) this.circle.visible = false;
    if (this.tendrils) this.tendrils.visible = false;
    const ctx = this.ctx;
    if (ctx) {
      for (const animal of this.animals) animal.dispose(ctx.scene);
    }
    this.animals = [];
  }

  melee(time: number): MeleeStep | null {
    if (this.locked) return null;
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + 0.9;
    const mul = this.grow?.phase === 'giant' ? 1.8 : 1;
    return { ...step, damageMul: step.damageMul * mul, range: step.range * (this.grow?.phase === 'giant' ? 1.8 : 1) };
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
    this.stepGrow(frame);
    this.stepSummon(frame);
    this.stepDrain(frame);
    this.stepAnimals(frame.dt);
    this.stepFloaters(frame.dt);
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
    if (!ctx || !this.puddle || !this.puddleMat) return;
    if (!this.drainOn) this.drainFade = Math.max(0, this.drainFade - frame.dt * 1.4);
    else this.drainFade = Math.min(1, this.drainFade + frame.dt * 1.8);
    const shown = this.drainFade > 0.02;
    this.puddle.visible = shown;
    if (this.tendrils) this.tendrils.visible = shown && this.drainOn;
    if (!shown) return;
    const radius = SOUL_RADIUS * this.drainFade;
    const y = ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.045;
    this.puddle.position.set(ctx.pos.x, y, ctx.pos.z);
    this.puddle.scale.setScalar(radius);
    this.puddleMat.uniforms.uTime.value = frame.time;
    this.puddleMat.uniforms.uStrength.value = this.drainFade;
    if (this.drainOn && frame.dt > 0 && Math.random() < 0.85) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.92;
      ctx.particles.emit(new THREE.Vector3(ctx.pos.x + Math.cos(a) * r, y + 0.05, ctx.pos.z + Math.sin(a) * r), GREEN, 1, {
        speed: 0.8,
        size: 0.16 + Math.random() * 0.14,
        life: 0.45,
        up: 1.6,
        gravity: -0.4,
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
    if (this.drainOn) return { kind: 'channel', t: this.drainFade, weight: frame.moving ? 0.45 : 0.82 };
    return null;
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

  private buildPuddle(ctx: KitContext) {
    const geometry = new THREE.CircleGeometry(1, 40);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
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
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float edge = smoothstep(1.0, 0.78, r);
          float boil = sin(p.x * 18.0 + uTime * 3.2) * sin(p.y * 16.0 - uTime * 2.6);
          float bubble = smoothstep(0.55, 0.95, boil);
          vec3 col = mix(vec3(0.02, 0.22, 0.08), vec3(0.45, 1.0, 0.55), 0.35 + bubble * 0.65);
          float alpha = edge * (0.28 + bubble * 0.38) * uStrength;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    ctx.scene.add(mesh);
    this.puddle = mesh;
    this.puddleMat = material;
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
