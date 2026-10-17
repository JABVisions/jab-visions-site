import * as THREE from 'three';
import type { AbilityId } from '../config';
import { POWER_DRY_MAX, POWER_DRY_MIN, POWER_LIVE_MAX, POWER_LIVE_MIN } from '../power-outage';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Marywantis fights with living water. Mercy is a procedural guardian, not a
 * second model. Fin Kick steers with her movement. Wave Pool pulls inside the
 * arena and lets walls stop the current. Shift while moving is a surf.
 */

export const MERCY_LIFE = 12;
export const MERCY_LIFE_PVP = 4;
export const MERCY_CAP = 3;
export const POOL_LIFE = 7;
export const POOL_LIFE_PVP = 4.2;
export const POOL_RADIUS = 7.2;
/**
 * The shared power blackout. Marywantis still calls the dry stretch a tide,
 * and the same windows apply to every fighter.
 */
export const TIDE_LIVE_MIN = POWER_LIVE_MIN;
export const TIDE_LIVE_MAX = POWER_LIVE_MAX;
export const TIDE_DRY_MIN = POWER_DRY_MIN;
export const TIDE_DRY_MAX = POWER_DRY_MAX;

const DROWN_EVERY = 0.5;
const DROWN_DAMAGE = 3.2;
const CARTWHEEL_DAMAGE = 7;
export const FINISHER_DAMAGE = 16;
const POOL_EVERY = 0.45;
const POOL_DAMAGE = 4.2;
const BURST_DAMAGE = 12;
const BOSS_SPLASH = 10;

const DEEP = new THREE.Color('#0a84ff');
const FOAM = new THREE.Color('#d8fbff');
const AQUA = new THREE.Color('#00e5ff');

const WATER_VERT = `
  varying vec3 vPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const WATER_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying vec3 vPos;
  void main() {
    float band = sin(vPos.y * 5.2 + vPos.x * 1.3 + uTime * 2.8);
    float crest = sin(vPos.z * 3.1 - uTime * 1.7);
    float foam = smoothstep(0.35, 0.92, band * 0.5 + 0.5 + crest * 0.12);
    vec3 col = mix(uDeep, uFoam, foam);
    gl_FragColor = vec4(col, uOpacity * (0.7 + foam * 0.3));
  }
`;

const BODY_GEO = new THREE.CylinderGeometry(0.42, 0.62, 2.15, 12);
const HEAD_GEO = new THREE.SphereGeometry(0.38, 14, 10);
const ARM_GEO = new THREE.CapsuleGeometry(0.1, 0.85, 3, 6);
const BUBBLE_GEO = new THREE.SphereGeometry(0.82, 16, 12);
const DROP_GEO = new THREE.SphereGeometry(0.07, 8, 6);
const VORTEX_GEO = new THREE.CylinderGeometry(0.45, 2.7, 2.8, 18, 1, true);
const RING_GEO = new THREE.TorusGeometry(3.1, 0.22, 8, 28);
const CRESCENT_GEO = new THREE.TorusGeometry(0.85, 0.07, 6, 18, Math.PI);
const SURF_GEO = new THREE.SphereGeometry(0.72, 12, 8);

const _dir = new THREE.Vector3();

type TideBody = KitTarget & {
  kind?: string;
  tier?: number;
  sink: number;
  held: number;
  fighter?: { humanoid: { group: THREE.Object3D } };
};

interface Prison {
  body: TideBody;
  mesh: THREE.Mesh;
  drown: number;
}

interface Mercy {
  group: THREE.Group;
  life: number;
  max: number;
  bossHit: Set<TideBody>;
}

interface Crescent {
  mesh: THREE.Mesh;
  age: number;
  x: number;
  z: number;
  yaw: number;
  touched: Set<TideBody>;
}

interface Fin {
  age: number;
  next: number;
  swings: number;
  wave: Crescent | null;
}

interface Pool {
  group: THREE.Group;
  life: number;
  max: number;
  x: number;
  z: number;
  spin: number;
  tick: number;
  held: Set<TideBody>;
}

export function tideBoss(body: { kind?: string; tier?: number }) {
  return body.kind === 'broadcaster' || (body.tier ?? 0) >= 5;
}

function waterMaterial(opacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uDeep: { value: DEEP.clone() },
      uFoam: { value: FOAM.clone() },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
}

function tryStep(ctx: KitContext, pos: THREE.Vector3, radius: number, x: number, z: number) {
  if (!ctx.blocked(x, z, radius)) {
    pos.x = x;
    pos.z = z;
  } else if (!ctx.blocked(x, pos.z, radius)) {
    pos.x = x;
  } else if (!ctx.blocked(pos.x, z, radius)) {
    pos.z = z;
  }
  ctx.resolve(pos);
}

export class MarywantisKit implements RyderKit {
  private ctx: KitContext | null = null;
  private mats: THREE.ShaderMaterial[] = [];
  private orbit: THREE.Group | null = null;
  private drops: THREE.Mesh[] = [];
  private surf: THREE.Mesh | null = null;
  private mercy: Mercy | null = null;
  private prisons: Prison[] = [];
  private fin: Fin | null = null;
  private pool: Pool | null = null;
  private castLeft = 0;
  private foot = 0;
  private surfing = false;
  /** The engine's blackout, mirrored so surf and casts stop the same frame. */
  private fedDown = false;
  clipHint: string | null = null;
  clipToken = 0;
  clipSeconds = 0.8;

  get locked() {
    return this.castLeft > 0;
  }

  get busy() {
    return this.fin !== null;
  }

  get steerWhileBusy() {
    return true;
  }

  get airY() {
    return this.surfing ? 0.34 : 0;
  }

  get moveScale() {
    if (this.fin) return 1.22;
    if (this.surfing) return 1.2;
    if (this.pool) return 0.9;
    return 1;
  }

  get glow() {
    if (this.mercy || this.pool || this.fin) return 0.35;
    return this.surfing ? 0.12 : 0;
  }

  get powersDown() {
    return this.fedDown;
  }

  get bodyYaw() {
    if (!this.fin) return 0;
    return Math.sin(this.fin.age * 16) * 0.4;
  }

  get pose(): PoseOverride | null {
    if (this.fin) return { kind: 'spin', t: Math.min(1, this.fin.age / 1.05), weight: 1 };
    if (this.castLeft > 0) return { kind: 'summon', t: 0.45, weight: 1 };
    if (this.pool) return { kind: 'whirl', t: (this.pool.max - this.pool.life) / this.pool.max, weight: 0.7 };
    if (this.surfing) return { kind: 'ride', t: 0.4, weight: 0.8 };
    return null;
  }

  melee(_time: number): MeleeStep | null {
    return null;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    this.fedDown = false;
    const orbit = new THREE.Group();
    orbit.name = 'TideOrbit';
    for (let i = 0; i < 7; i += 1) {
      const mat = waterMaterial(0.8);
      this.mats.push(mat);
      const drop = new THREE.Mesh(DROP_GEO, mat);
      drop.scale.setScalar(i % 2 === 0 ? 1 : 0.65);
      orbit.add(drop);
      this.drops.push(drop);
    }
    ctx.scene.add(orbit);
    this.orbit = orbit;

    const surfMat = waterMaterial(0.62);
    this.mats.push(surfMat);
    const surf = new THREE.Mesh(SURF_GEO, surfMat);
    surf.name = 'SurfWave';
    surf.scale.set(1.35, 0.22, 0.85);
    surf.visible = false;
    ctx.scene.add(surf);
    this.surf = surf;
  }

  detach() {
    this.interrupt();
    this.orbit?.removeFromParent();
    this.surf?.removeFromParent();
    this.orbit = null;
    this.surf = null;
    this.drops = [];
    for (const mat of this.mats) mat.dispose();
    this.mats = [];
    this.ctx = null;
  }

  interrupt() {
    this.releaseAll(false);
    this.mercy?.group.removeFromParent();
    this.mercy = null;
    this.dismissPool(false);
    this.clearFin();
    this.castLeft = 0;
    this.surfing = false;
    if (this.surf) this.surf.visible = false;
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const time = frame.time;
    for (const mat of this.mats) mat.uniforms.uTime.value = time;
    this.castLeft = Math.max(0, this.castLeft - frame.dt);
    const down = Boolean(frame.powersDown);
    if (down && !this.fedDown) this.onTideOut();
    this.fedDown = down;
    this.stepOrbit(time);
    this.stepSurf(frame);
    this.stepMercy(frame);
    this.stepFin(frame);
    this.stepPool(frame);
  }

  tryAbility(id: AbilityId) {
    if (this.powersDown) return false;
    if (id === 'callMercy') return this.beginMercy();
    if (id === 'finKick') return this.beginFin();
    if (id === 'wavePool') return this.beginPool();
    return false;
  }

  private onTideOut() {
    this.interrupt();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.rings.spawn(ctx.pos.clone(), 0x9ad7ff, { radius: 1.4, duration: 0.4, y: 0.08 });
    ctx.particles.emit(ctx.pos.clone().setY(1.1), FOAM, 14, { speed: 3.2, size: 0.2, life: 0.45, up: 1.2, gravity: 3 });
  }

  private beginMercy() {
    const ctx = this.ctx;
    if (!ctx || this.mercy) return Boolean(this.mercy);
    const pvp = ctx.pvp?.() ?? false;
    const mat = waterMaterial(0.58);
    this.mats.push(mat);
    const group = new THREE.Group();
    group.name = 'Mercy';
    const body = new THREE.Mesh(BODY_GEO, mat);
    body.position.y = 1.25;
    const head = new THREE.Mesh(HEAD_GEO, mat);
    head.position.y = 2.55;
    const armL = new THREE.Mesh(ARM_GEO, mat);
    armL.position.set(-0.55, 1.55, 0);
    armL.rotation.z = 0.5;
    const armR = new THREE.Mesh(ARM_GEO, mat);
    armR.position.set(0.55, 1.55, 0);
    armR.rotation.z = -0.5;
    group.add(body, head, armL, armR);
    const yaw = ctx.yaw();
    group.position.set(ctx.pos.x + Math.sin(yaw) * 1.2, ctx.heightAt(ctx.pos.x, ctx.pos.z), ctx.pos.z + Math.cos(yaw) * 1.2);
    ctx.scene.add(group);
    this.mercy = { group, life: pvp ? MERCY_LIFE_PVP : MERCY_LIFE, max: pvp ? MERCY_LIFE_PVP : MERCY_LIFE, bossHit: new Set() };
    this.castLeft = 0.35;
    this.playClip('conjuring', 1);
    ctx.sound('marywantis.mercy');
    ctx.rings.spawn(group.position.clone(), AQUA, { radius: 1.6, duration: 0.45, y: 0.08 });
    return true;
  }

  private beginFin() {
    const ctx = this.ctx;
    if (!ctx || this.fin) return Boolean(this.fin);
    this.fin = { age: 0, next: 0.1, swings: 0, wave: null };
    this.playClip('cartwheel', 0.85);
    ctx.sound('marywantis.fin');
    return true;
  }

  private beginPool() {
    const ctx = this.ctx;
    if (!ctx || this.pool) return Boolean(this.pool);
    const pvp = ctx.pvp?.() ?? false;
    const mat = waterMaterial(0.5);
    const ringMat = waterMaterial(0.72);
    this.mats.push(mat, ringMat);
    const group = new THREE.Group();
    group.name = 'WavePool';
    const cone = new THREE.Mesh(VORTEX_GEO, mat);
    cone.position.y = 1.3;
    const ring = new THREE.Mesh(RING_GEO, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(cone, ring);
    const yaw = ctx.yaw();
    const x = ctx.pos.x + Math.sin(yaw) * 1.4;
    const z = ctx.pos.z + Math.cos(yaw) * 1.4;
    group.position.set(x, ctx.heightAt(x, z), z);
    ctx.scene.add(group);
    this.pool = {
      group,
      life: pvp ? POOL_LIFE_PVP : POOL_LIFE,
      max: pvp ? POOL_LIFE_PVP : POOL_LIFE,
      x,
      z,
      spin: 0,
      tick: 0.15,
      held: new Set(),
    };
    this.castLeft = 0.32;
    this.playClip('conjuring', 1.05);
    ctx.sound('marywantis.pool');
    ctx.rings.spawn(group.position.clone(), AQUA, { radius: POOL_RADIUS, duration: 0.6, y: 0.05 });
    return true;
  }

  private playClip(hint: string, seconds: number) {
    this.clipHint = hint;
    this.clipSeconds = seconds;
    this.clipToken += 1;
  }

  private stepOrbit(time: number) {
    const ctx = this.ctx;
    const orbit = this.orbit;
    if (!ctx || !orbit) return;
    orbit.position.copy(ctx.pos);
    orbit.position.y += 1.15;
    this.drops.forEach((drop, index) => {
      const ang = time * (1.4 + index * 0.17) + index;
      const lift = 0.35 + (index % 3) * 0.28;
      drop.position.set(Math.cos(ang) * (0.55 + (index % 2) * 0.25), Math.sin(time * 2 + index) * 0.2 + lift, Math.sin(ang) * 0.6);
    });
  }

  private stepSurf(frame: KitFrame) {
    const ctx = this.ctx;
    const surf = this.surf;
    if (!ctx || !surf) return;
    this.surfing = Boolean(frame.boost && frame.moving && !this.fin && this.castLeft <= 0 && !this.powersDown);
    surf.visible = this.surfing;
    if (!this.surfing) return;
    const yaw = ctx.yaw();
    surf.position.set(ctx.pos.x, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.06, ctx.pos.z);
    surf.rotation.y = yaw;
    this.foot -= frame.dt;
    if (this.foot <= 0) {
      this.foot = 0.22;
      ctx.rings.spawn(surf.position.clone(), 0xbff7ff, { radius: 0.55, duration: 0.45, y: 0.03 });
      ctx.particles.emit(surf.position.clone(), FOAM, 6, { speed: 1.4, size: 0.16, life: 0.4, up: 0.4, gravity: 2 });
    }
  }

  private stepMercy(frame: KitFrame) {
    const ctx = this.ctx;
    const mercy = this.mercy;
    if (!ctx || !mercy) return;
    mercy.life -= frame.dt;
    const arms = mercy.group.children;
    const sway = Math.sin(frame.time * 3);
    if (arms[2]) arms[2].rotation.z = 0.4 + sway * 0.35;
    if (arms[3]) arms[3].rotation.z = -0.4 - sway * 0.35;
    const prey = this.nearestPrey(mercy.group.position);
    if (prey) {
      const dx = prey.pos.x - mercy.group.position.x;
      const dz = prey.pos.z - mercy.group.position.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const step = Math.min(dist, 6.4 * frame.dt);
      tryStep(ctx, mercy.group.position, 0.6, mercy.group.position.x + (dx / dist) * step, mercy.group.position.z + (dz / dist) * step);
      mercy.group.position.y = ctx.heightAt(mercy.group.position.x, mercy.group.position.z);
      mercy.group.rotation.y = Math.atan2(dx, dz);
      if (tideBoss(prey) && dist < 2.3 && !mercy.bossHit.has(prey)) {
        mercy.bossHit.add(prey);
        this.splash(prey, BOSS_SPLASH, 'stagger', 0.7);
      } else if (!tideBoss(prey) && dist < 1.7 && this.prisons.length < MERCY_CAP && !this.prisons.some((cell) => cell.body === prey)) {
        this.imprison(prey);
      }
    }
    for (const cell of [...this.prisons]) {
      if (cell.body.hp <= 0) {
        this.freePrison(cell, false);
        continue;
      }
      ctx.hold?.(cell.body, 0.35);
      cell.body.held = Math.max(cell.body.held, 0.35);
      cell.body.sink = -0.85 - Math.sin(frame.time * 4 + cell.body.pos.x) * 0.12;
      cell.mesh.position.set(cell.body.pos.x, ctx.heightAt(cell.body.pos.x, cell.body.pos.z) + 1.15 - cell.body.sink * 0.15, cell.body.pos.z);
      cell.mesh.rotation.y += frame.dt * 1.6;
      cell.drown -= frame.dt;
      if (cell.drown <= 0) {
        cell.drown = DROWN_EVERY;
        this.splash(cell.body, DROWN_DAMAGE, 'stagger', 0.15);
        ctx.particles.emit(cell.mesh.position.clone(), AQUA, 4, { speed: 1.2, size: 0.12, life: 0.35, up: 0.8, gravity: -0.4 });
      }
    }
    if (mercy.life <= 0) this.releaseAll(true);
  }

  private imprison(body: TideBody) {
    const ctx = this.ctx;
    if (!ctx) return;
    const mat = waterMaterial(0.42);
    this.mats.push(mat);
    const mesh = new THREE.Mesh(BUBBLE_GEO, mat);
    mesh.name = 'WaterPrison';
    ctx.scene.add(mesh);
    ctx.hold?.(body, 0.35);
    body.held = Math.max(body.held, 0.35);
    body.knock.set(0, 0, 0);
    this.prisons.push({ body, mesh, drown: DROWN_EVERY });
    ctx.sound('marywantis.prison');
  }

  private nearestPrey(from: THREE.Vector3) {
    let best: TideBody | null = null;
    let bestDist = 18;
    for (const body of this.bodies()) {
      if (this.prisons.some((cell) => cell.body === body)) continue;
      const dist = Math.hypot(body.pos.x - from.x, body.pos.z - from.z);
      if (dist < bestDist) {
        best = body;
        bestDist = dist;
      }
    }
    return best;
  }

  private stepFin(frame: KitFrame) {
    const ctx = this.ctx;
    const fin = this.fin;
    if (!ctx || !fin) return;
    fin.age += frame.dt;
    if (!frame.moving) {
      const yaw = ctx.yaw();
      const dist = 6.2 * frame.dt;
      tryStep(ctx, ctx.pos, ctx.radius, ctx.pos.x + Math.sin(yaw) * dist, ctx.pos.z + Math.cos(yaw) * dist);
    }
    if (fin.swings < 4 && fin.age >= fin.next) {
      fin.swings += 1;
      fin.next += 0.18;
      this.cartwheelHit();
    }
    if (fin.swings >= 4 && !fin.wave && fin.age >= 0.86) this.launchCrescent();
    const wave = fin.wave;
    if (wave) {
      wave.age += frame.dt;
      const travel = wave.age * 14;
      wave.mesh.position.set(
        wave.x + Math.sin(wave.yaw) * travel,
        ctx.heightAt(wave.x, wave.z) + 0.9,
        wave.z + Math.cos(wave.yaw) * travel,
      );
      wave.mesh.rotation.y = wave.yaw;
      wave.mesh.scale.setScalar(1 + wave.age * 1.4);
      for (const body of this.bodies()) {
        if (wave.touched.has(body)) continue;
        const dx = body.pos.x - wave.mesh.position.x;
        const dz = body.pos.z - wave.mesh.position.z;
        if (dx * dx + dz * dz > 1.7 * 1.7) continue;
        const ahead = dx * Math.sin(wave.yaw) + dz * Math.cos(wave.yaw);
        if (ahead < -0.45) continue;
        wave.touched.add(body);
        _dir.set(Math.sin(wave.yaw), 0, Math.cos(wave.yaw));
        this.splash(body, FINISHER_DAMAGE, tideBoss(body) ? 'stagger' : 'knockback', tideBoss(body) ? 0.55 : 1.05);
      }
      if (wave.age > 0.42) {
        wave.mesh.removeFromParent();
        fin.wave = null;
      }
    }
    if (fin.age > 1.2 && !fin.wave) this.clearFin();
  }

  private cartwheelHit() {
    const ctx = this.ctx;
    if (!ctx) return;
    const yaw = ctx.yaw();
    const x = ctx.pos.x + Math.sin(yaw) * 0.75;
    const z = ctx.pos.z + Math.cos(yaw) * 0.75;
    ctx.particles.emit(new THREE.Vector3(x, 0.8, z), AQUA, 8, { speed: 3, size: 0.16, life: 0.28, up: 0.5 });
    for (const body of this.bodies()) {
      if (Math.hypot(body.pos.x - x, body.pos.z - z) > 1.6) continue;
      _dir.set(body.pos.x - ctx.pos.x, 0, body.pos.z - ctx.pos.z);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
      else _dir.normalize();
      this.splash(body, CARTWHEEL_DAMAGE, 'stagger', 0.35);
    }
  }

  private launchCrescent() {
    const ctx = this.ctx;
    const fin = this.fin;
    if (!ctx || !fin) return;
    const mat = waterMaterial(0.78);
    this.mats.push(mat);
    const mesh = new THREE.Mesh(CRESCENT_GEO, mat);
    mesh.name = 'FinCrescent';
    const yaw = ctx.yaw();
    mesh.rotation.set(0, yaw, Math.PI / 2);
    ctx.scene.add(mesh);
    fin.wave = { mesh, age: 0, x: ctx.pos.x, z: ctx.pos.z, yaw, touched: new Set() };
  }

  private stepPool(frame: KitFrame) {
    const ctx = this.ctx;
    const pool = this.pool;
    if (!ctx || !pool) return;
    pool.life -= frame.dt;
    pool.spin += frame.dt * 2.6;
    pool.group.rotation.y = pool.spin;
    pool.tick -= frame.dt;
    const tick = pool.tick <= 0;
    if (tick) pool.tick = POOL_EVERY;
    const caught = this.bodies().filter((body) => Math.hypot(body.pos.x - pool.x, body.pos.z - pool.z) < POOL_RADIUS);
    caught.forEach((body, index) => {
      const boss = tideBoss(body);
      const ang = pool.spin * (boss ? 0.35 : 1) + index * 0.9;
      const dx = body.pos.x - pool.x;
      const dz = body.pos.z - pool.z;
      const dist = Math.hypot(dx, dz);
      const pull = boss ? 1.6 : 4.8;
      const next = Math.max(0.85, dist - pull * frame.dt);
      const x = pool.x + Math.sin(ang) * next;
      const z = pool.z + Math.cos(ang) * next;
      tryStep(ctx, body.pos, body.radius || 0.45, x, z);
      if (!boss) {
        ctx.hold?.(body, 0.3);
        body.held = Math.max(body.held, 0.3);
        pool.held.add(body);
        const risen = Math.sin(Math.min(1, 1 - pool.life / pool.max) * Math.PI);
        body.sink = -risen * 2.05;
        const group = body.fighter?.humanoid.group;
        if (group) group.rotation.y = ang;
      } else {
        body.sink = 0;
      }
      if (tick) {
        _dir.set(body.pos.x - pool.x, 0, body.pos.z - pool.z);
        if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
        else _dir.normalize();
        this.splash(body, boss ? POOL_DAMAGE * 0.45 : POOL_DAMAGE, 'stagger', boss ? 0.2 : 0.25);
      }
    });
    ctx.particles.emit(new THREE.Vector3(pool.x, 0.4, pool.z), AQUA, 3, { speed: 2, size: 0.18, life: 0.35, up: 1.2, gravity: -1 });
    if (pool.life <= 0) this.dismissPool(true);
  }

  private dismissPool(burst: boolean) {
    const ctx = this.ctx;
    const pool = this.pool;
    if (!pool) return;
    if (burst && ctx) {
      for (const body of pool.held) {
        body.held = 0;
        body.sink = 0;
      }
      for (const body of this.bodies()) {
        const dx = body.pos.x - pool.x;
        const dz = body.pos.z - pool.z;
        if (dx * dx + dz * dz > (POOL_RADIUS + 0.8) ** 2) continue;
        body.held = 0;
        body.sink = 0;
        ctx.hold?.(body, 0);
        body.sink = 0;
        _dir.set(dx, 0, dz);
        if (_dir.lengthSq() < 0.04) _dir.set(1, 0, 0);
        else _dir.normalize();
        const boss = tideBoss(body);
        this.splash(body, boss ? BURST_DAMAGE * 0.4 : BURST_DAMAGE, boss ? 'stagger' : 'knockback', boss ? 0.45 : 1);
        ctx.resolve(body.pos);
      }
      ctx.rings.spawn(new THREE.Vector3(pool.x, 0.1, pool.z), FOAM, { radius: POOL_RADIUS + 1, duration: 0.5 });
      ctx.particles.emit(new THREE.Vector3(pool.x, 0.6, pool.z), FOAM, 28, { speed: 7, size: 0.28, life: 0.5, up: 1.4, gravity: 3 });
      ctx.sound('marywantis.burst');
    } else {
      for (const body of pool.held) {
        body.held = 0;
        body.sink = 0;
        ctx?.hold?.(body, 0);
        body.sink = 0;
      }
    }
    pool.group.removeFromParent();
    this.pool = null;
  }

  private releaseAll(burst: boolean) {
    const mercy = this.mercy;
    for (const cell of [...this.prisons]) this.freePrison(cell, burst);
    if (burst && mercy && this.ctx) {
      this.ctx.particles.emit(mercy.group.position.clone().setY(1.2), FOAM, 18, { speed: 5, size: 0.24, life: 0.45, up: 1 });
    }
    mercy?.group.removeFromParent();
    this.mercy = null;
  }

  private freePrison(cell: Prison, burst: boolean) {
    const ctx = this.ctx;
    cell.mesh.removeFromParent();
    cell.body.held = 0;
    cell.body.sink = 0;
    ctx?.hold?.(cell.body, 0);
    cell.body.sink = 0;
    if (burst && ctx && cell.body.hp > 0) {
      const from = this.mercy?.group.position ?? ctx.pos;
      _dir.set(cell.body.pos.x - from.x, 0, cell.body.pos.z - from.z);
      if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
      else _dir.normalize();
      this.splash(cell.body, 6, 'knockback', 0.8);
      ctx.particles.emit(cell.body.pos.clone().setY(1), AQUA, 10, { speed: 4, size: 0.2, life: 0.35, direction: _dir.clone() });
    }
    this.prisons = this.prisons.filter((other) => other !== cell);
  }

  private clearFin() {
    this.fin?.wave?.mesh.removeFromParent();
    this.fin = null;
  }

  private bodies() {
    const ctx = this.ctx;
    if (!ctx) return [];
    const list: TideBody[] = [];
    for (const target of ctx.targets()) {
      if (target.hp <= 0) continue;
      if (ctx.canHit && !ctx.canHit(target)) continue;
      list.push(target as TideBody);
    }
    return list;
  }

  private splash(body: TideBody, damage: number, reaction: 'stagger' | 'knockback', strength: number) {
    const ctx = this.ctx;
    if (!ctx || body.hp <= 0) return;
    if (ctx.canHit && !ctx.canHit(body)) return;
    ctx.hurt(body, damage, _dir.clone(), reaction, strength);
    ctx.flash(body, 0x7ef0ff, 0.12);
  }
}
