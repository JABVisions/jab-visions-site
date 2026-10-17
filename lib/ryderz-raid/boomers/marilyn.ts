import * as THREE from 'three';
import type { AbilityId } from '../config';
import type { KitContext, KitFrame, MeleeStep, RyderKit } from '../ryderz/kit';
import type { PoseOverride } from '../skeletal';
import { BoomerAuraSystem } from './aura';
import {
  FairyDustPool,
  TORNADO_STEPS,
  auraRing,
  livingFoes,
  projectionFigure,
  tornadoRibbon,
  warnMissingBoomerModel,
  writeTornado,
} from './fx';

export const SHOWTIME = { count: 3, damage: 18, range: 18, speed: 14, life: 1.45 };
/**
 * Controllable spinning kick. She holds it until E is pressed again.
 * Contact and hit stun do not cancel it. `moveScale` is 85% of a sprint:
 * the engine turns sprint off while her hands are busy, and 1.28 is that
 * sprint rate. `guard` is the gap before a second press can switch it off.
 */
export const LETS_BE_BAD = {
  guard: 0.35,
  kickDamage: 9,
  kickInterval: 0.45,
  kickReach: 1.65,
  ribbonDamage: 5,
  ribbonInterval: 0.75,
  ribbonRadius: 2.5,
  moveScale: 0.85 * 1.28,
  spinSpeed: 11,
  kickKnock: 0.48,
  ribbonKnock: 0.22,
};
export const ABRACADABRA = { damage: 55, radius: 12, heal: 0.15, expand: 0.7 };

const BLUE = 0x168bff;
const _look = new THREE.Vector3();
const _sample = new THREE.Vector3();

interface Projection {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  life: number;
  active: boolean;
  hit: boolean;
}

interface TornadoRibbon {
  mesh: THREE.Mesh;
  positions: Float32Array;
  samples: THREE.Vector3[];
  phase: number;
  turns: number;
}

/** The spinning kick and the ribbon vortex stay up until she switches them off. */
interface LetsBeBadState {
  active: boolean;
  moveSpeedMultiplier: number;
  spinSpeed: number;
  kickDamage: number;
  ribbonDamage: number;
}

/**
 * Marilyn Monroe, the Blue Boomer. Charity.
 * Showtime sends three cartwheeling projections. Let's Be Bad is a spinning
 * kick under a reverse ribbon tornado. She steers through it, and it stays on
 * until she presses E again. Abracadabra
 * is one expanding wave: damage once, heal allies, and dust only the enemies
 * that wave actually kills.
 */
export class MarilynKit implements RyderKit {
  readonly airY = 0;
  private ctx: KitContext | null = null;
  private aura: BoomerAuraSystem | null = null;
  private projections: Projection[] = [];
  private tornado: TornadoRibbon[] = [];
  private glitter: THREE.Points | null = null;
  private footGlow: THREE.Mesh | null = null;
  private spin: LetsBeBadState | null = null;
  private spinAngle = 0;
  private spinClock = 0;
  private kickAt = new Map<object, number>();
  private ribbonAt = new Map<object, number>();
  private ribbonFlash = 0;
  private wave: THREE.Mesh | null = null;
  private waveTime = 0;
  private waveHit = new Set<Object>();
  private dust: FairyDustPool | null = null;
  private poseTime = 0;
  private poseKind: PoseOverride['kind'] | null = null;
  private channel = 0;
  private pulse = 0;

  private get spinning() {
    return this.spin?.active ?? false;
  }

  get locked() {
    return this.channel > 0;
  }

  get busy() {
    return this.spinning || (this.poseTime > 0 && this.channel <= 0);
  }

  /** Computer teammates keep chasing while the kick is spinning. */
  get steerWhileBusy() {
    return this.spinning;
  }

  /** E again switches the spin off. Other keys stay blocked while it is on. */
  get releaseId(): AbilityId | null {
    return this.spinning ? 'letsBeBad' : null;
  }

  get moveScale() {
    return this.spinning ? LETS_BE_BAD.moveScale : 1;
  }

  /** Visual spin only. Travel facing stays with the camera and the stick. */
  get bodyYaw() {
    return this.spinning ? this.spinAngle : 0;
  }

  get pose(): PoseOverride | null {
    if (this.spinning) {
      const weight = Math.min(1, this.spinClock / 0.18);
      const turns = this.spinAngle / (Math.PI * 2);
      return { kind: 'whirl', t: turns - Math.floor(turns), weight };
    }
    if (!this.poseKind || this.poseTime <= 0) return null;
    return { kind: this.poseKind, t: 1 - Math.min(1, this.poseTime), weight: 1 };
  }

  get glow() {
    return this.channel > 0 || this.poseTime > 0 ? 0.55 : 0;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const fighter = ctx.fighter();
    if (fighter && fighter.meshSource !== 'gltf') warnMissingBoomerModel('marilyn-monroe');
    this.aura = new BoomerAuraSystem({ primary: 0x168bff, secondary: 0x66cfff, highlight: 0xd8f4ff });
    if (fighter) this.aura.attach(fighter.humanoid.group);
    this.dust = new FairyDustPool(ctx.scene, 0x66cfff);
    for (let i = 0; i < SHOWTIME.count; i += 1) {
      const mesh = projectionFigure(BLUE);
      mesh.visible = false;
      ctx.scene.add(mesh);
      this.projections.push({
        mesh,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        traveled: 0,
        life: 0,
        active: false,
        hit: false,
      });
    }
    const layers: Array<[number, number, number]> = [
      [0x168bff, 0, 2.4],
      [0x66cfff, 2.1, 3.1],
      [0xd8f4ff, 4.2, 1.7],
    ];
    for (const [color, phase, turns] of layers) {
      const ribbon = tornadoRibbon(color);
      ribbon.mesh.visible = false;
      ctx.scene.add(ribbon.mesh);
      const samples = Array.from({ length: TORNADO_STEPS }, () => new THREE.Vector3());
      this.tornado.push({ mesh: ribbon.mesh, positions: ribbon.positions, samples, phase, turns });
    }
    const glitterCount = 42;
    const glitterPositions = new Float32Array(glitterCount * 3);
    const glitterGeometry = new THREE.BufferGeometry();
    glitterGeometry.setAttribute('position', new THREE.BufferAttribute(glitterPositions, 3));
    this.glitter = new THREE.Points(
      glitterGeometry,
      new THREE.PointsMaterial({ color: 0x66cfff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.glitter.name = 'lets-be-bad-glitter';
    this.glitter.frustumCulled = false;
    this.glitter.visible = false;
    ctx.scene.add(this.glitter);
    this.footGlow = auraRing(0x168bff);
    this.footGlow.name = 'lets-be-bad-glow';
    this.footGlow.visible = false;
    (this.footGlow.material as THREE.MeshBasicMaterial).opacity = 0.38;
    ctx.scene.add(this.footGlow);
    this.wave = auraRing(0x168bff);
    this.wave.visible = false;
    ctx.scene.add(this.wave);
  }

  detach() {
    this.interrupt();
    this.aura?.dispose();
    this.aura = null;
    this.dust?.dispose();
    this.dust = null;
    for (const projection of this.projections) {
      projection.mesh.removeFromParent();
      projection.mesh.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    }
    this.projections = [];
    for (const ribbon of this.tornado) {
      ribbon.mesh.removeFromParent();
      ribbon.mesh.geometry.dispose();
      (ribbon.mesh.material as THREE.Material).dispose();
    }
    this.tornado = [];
    if (this.glitter) {
      this.glitter.removeFromParent();
      this.glitter.geometry.dispose();
      (this.glitter.material as THREE.Material).dispose();
      this.glitter = null;
    }
    if (this.footGlow) {
      this.footGlow.removeFromParent();
      this.footGlow.geometry.dispose();
      (this.footGlow.material as THREE.Material).dispose();
      this.footGlow = null;
    }
    if (this.wave) {
      this.wave.removeFromParent();
      this.wave.geometry.dispose();
      (this.wave.material as THREE.Material).dispose();
      this.wave = null;
    }
    this.ctx = null;
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.poseTime = Math.max(0, this.poseTime - frame.dt);
    this.channel = Math.max(0, this.channel - frame.dt);
    if (this.poseTime <= 0 && this.channel <= 0) this.poseKind = null;
    const ratio = frame.maxAura ? (frame.aura ?? 0) / frame.maxAura : 1;
    this.aura?.setCharge(frame.burnout ? 0 : ratio, this.pulse);
    this.pulse = 0;
    this.aura?.update(frame.dt, frame.moving);
    // Contact hit stun must not end the spin. Death, grabs, and beacon recovery call interrupt.
    this.stepProjections(ctx, frame.dt);
    this.stepTornado(ctx, frame.dt);
    this.stepWave(ctx, frame.dt);
    this.dust?.update(frame.dt);
  }

  tryAbility(id: AbilityId) {
    if (id === 'showtime') return this.showtime();
    if (id === 'letsBeBad') return this.letsBeBad();
    if (id === 'abracadabra') return this.abracadabra();
    return false;
  }

  /** E again, or a computer teammate finishing a sweep. Death and grabs use interrupt. */
  endAbility(id: AbilityId) {
    if (id !== 'letsBeBad' || !this.spinning) return;
    this.endSpin();
  }

  melee(): MeleeStep | null {
    return null;
  }

  interrupt() {
    this.channel = 0;
    this.poseTime = 0;
    this.poseKind = null;
    this.waveTime = 0;
    this.endSpin();
    for (const projection of this.projections) this.retireProjection(projection);
    if (this.wave) this.wave.visible = false;
  }

  private showtime() {
    const ctx = this.ctx;
    if (!ctx) return false;
    ctx.sound('marilyn.showtime.spawn');
    ctx.camera.addKick(0.18);
    this.pulse = 1;
    this.poseKind = 'flip';
    this.poseTime = 0.7;
    const flat = this.flatLook(ctx);
    const yaw = Math.atan2(flat.x, flat.z);
    ctx.turn(yaw);
    const foes = livingFoes(ctx.targets(), ctx.canHit).sort(
      (a, b) => a.pos.distanceToSquared(ctx.pos) - b.pos.distanceToSquared(ctx.pos),
    );
    this.projections.forEach((projection, index) => {
      projection.active = true;
      projection.hit = false;
      projection.life = SHOWTIME.life;
      projection.traveled = 0;
      projection.pos.set(ctx.pos.x, 0, ctx.pos.z);
      if (foes[index]) {
        projection.dir.set(foes[index].pos.x - ctx.pos.x, 0, foes[index].pos.z - ctx.pos.z);
        if (projection.dir.lengthSq() < 1e-4) projection.dir.copy(flat);
      } else {
        const spread = (index - 1) * 0.48;
        projection.dir.set(Math.sin(yaw + spread), 0, Math.cos(yaw + spread));
      }
      projection.dir.y = 0;
      projection.dir.normalize();
      projection.mesh.visible = true;
      projection.mesh.position.set(projection.pos.x, 0, projection.pos.z);
    });
    return true;
  }

  private letsBeBad() {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (this.spinning) {
      this.endAbility('letsBeBad');
      return true;
    }
    ctx.cooldown('letsBeBad', LETS_BE_BAD.guard);
    ctx.sound('marilyn.letsBeBad.ribbon');
    ctx.camera.addKick(0.06);
    this.pulse = 1;
    this.spin = {
      active: true,
      moveSpeedMultiplier: LETS_BE_BAD.moveScale,
      spinSpeed: LETS_BE_BAD.spinSpeed,
      kickDamage: LETS_BE_BAD.kickDamage,
      ribbonDamage: LETS_BE_BAD.ribbonDamage,
    };
    this.spinAngle = 0;
    this.spinClock = 0;
    this.ribbonFlash = 0;
    this.kickAt.clear();
    this.ribbonAt.clear();
    for (const ribbon of this.tornado) ribbon.mesh.visible = true;
    if (this.glitter) this.glitter.visible = true;
    if (this.footGlow) this.footGlow.visible = true;
    return true;
  }

  private abracadabra() {
    const ctx = this.ctx;
    if (!ctx || !this.wave) return false;
    ctx.sound('marilyn.abracadabra.burst');
    ctx.camera.addKick(0.28);
    ctx.camera.addShake(0.16);
    this.pulse = 1;
    this.poseKind = 'finish';
    this.poseTime = 0.55;
    this.waveTime = ABRACADABRA.expand;
    this.waveHit.clear();
    this.wave.visible = true;
    this.wave.position.set(ctx.pos.x, 0.08, ctx.pos.z);
    this.wave.scale.setScalar(0.2);
    ctx.blessSquad?.(ABRACADABRA.heal);
    if (!ctx.blessSquad) {
      const vitals = ctx.vitals?.();
      if (vitals) ctx.heal(vitals.maxHp * ABRACADABRA.heal);
    }
    return true;
  }

  private stepProjections(ctx: KitContext, dt: number) {
    for (const projection of this.projections) {
      if (!projection.active) continue;
      projection.life -= dt;
      const step = SHOWTIME.speed * dt;
      const nextX = projection.pos.x + projection.dir.x * step;
      const nextZ = projection.pos.z + projection.dir.z * step;
      if (ctx.blocked(nextX, nextZ, 0.28) || projection.traveled >= SHOWTIME.range || projection.life <= 0) {
        this.retireProjection(projection);
        continue;
      }
      projection.pos.x = nextX;
      projection.pos.z = nextZ;
      projection.traveled += step;
      projection.mesh.position.set(projection.pos.x, 0, projection.pos.z);
      projection.mesh.rotation.x += dt * 11;
      projection.mesh.rotation.y = Math.atan2(projection.dir.x, projection.dir.z);
      if (projection.hit) continue;
      for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
        const reach = foe.radius + 0.55;
        if (foe.pos.distanceToSquared(projection.pos) > reach * reach) continue;
        ctx.hurt(foe, SHOWTIME.damage, projection.dir, 'knockback', 0.45);
        ctx.flash(foe, BLUE, 0.2);
        projection.hit = true;
        this.retireProjection(projection);
        break;
      }
    }
  }

  private stepTornado(ctx: KitContext, dt: number) {
    if (!this.spin?.active) return;
    this.spinClock += dt;
    this.spinAngle += LETS_BE_BAD.spinSpeed * dt;
    this.ribbonFlash = Math.max(0, this.ribbonFlash - dt);
    const spin = this.spinAngle;
    this.tornado.forEach((ribbon) => {
      const last = ribbon.samples.length - 1;
      for (let i = 0; i < ribbon.samples.length; i += 1) {
        const t = last <= 0 ? 0 : i / last;
        const height = 1.45 + t * 1.9;
        const radius = 0.22 + t * t * 2.15;
        const angle = spin * 0.72 + ribbon.phase + t * ribbon.turns * Math.PI * 2;
        ribbon.samples[i].set(ctx.pos.x + Math.cos(angle) * radius, height, ctx.pos.z + Math.sin(angle) * radius);
      }
      const count = writeTornado(ribbon.positions, ribbon.samples, (t) => 0.045 + t * 0.16);
      const position = ribbon.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      position.needsUpdate = true;
      const quads = Math.max(0, count / 2 - 1);
      ribbon.mesh.geometry.setDrawRange(0, quads * 6);
      ribbon.mesh.geometry.computeBoundingSphere();
      ribbon.mesh.visible = true;
      (ribbon.mesh.material as THREE.MeshBasicMaterial).opacity = this.ribbonFlash > 0 ? 1 : 0.72;
    });
    this.placeGlitter(ctx, spin);
    if (this.footGlow) {
      this.footGlow.visible = true;
      this.footGlow.position.set(ctx.pos.x, 0.05, ctx.pos.z);
      this.footGlow.rotation.z = spin;
      this.footGlow.scale.setScalar(1.15);
    }
    const legYaw = ctx.yaw() + this.spinAngle;
    _sample.set(ctx.pos.x + Math.sin(legYaw) * 1.15, 0.82, ctx.pos.z + Math.cos(legYaw) * 1.15);
    ctx.particles.emit(_sample, 0x66cfff, 2, { speed: 0.8, size: 0.1, life: 0.28, up: 0.35, spread: 0.4 });
    ctx.particles.emit(_look.set(ctx.pos.x, 1.1, ctx.pos.z), 0xd8f4ff, 1, { speed: 1.2, size: 0.08, life: 0.35, up: 0.6, spread: 1 });
    this.strikeSpin(ctx, legYaw);
  }

  private placeGlitter(ctx: KitContext, spin: number) {
    const glitter = this.glitter;
    if (!glitter) return;
    const position = glitter.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = position.count;
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const body = i < count - 8;
      const radius = body ? 0.35 + (i % 5) * 0.12 : 1.05;
      const y = body ? 0.25 + t * 1.7 : 0.7 + (i % 4) * 0.08;
      const angle = spin * (body ? 1.4 : 1) + t * Math.PI * 6;
      position.setXYZ(i, ctx.pos.x + Math.cos(angle) * radius, y, ctx.pos.z + Math.sin(angle) * radius);
    }
    position.needsUpdate = true;
    glitter.visible = true;
  }

  /** Kick and ribbon keep separate per-target clocks so a frame cannot double-dip one source. */
  private strikeSpin(ctx: KitContext, legYaw: number) {
    const now = this.spinClock;
    const lx = Math.sin(legYaw);
    const lz = Math.cos(legYaw);
    let ribbonHit = false;
    for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
      const dx = foe.pos.x - ctx.pos.x;
      const dz = foe.pos.z - ctx.pos.z;
      const dist = Math.hypot(dx, dz);
      const away = dist < 1e-4 ? _look.set(lx, 0, lz) : _look.set(dx / dist, 0, dz / dist);
      if (dist < LETS_BE_BAD.ribbonRadius + foe.radius && now >= (this.ribbonAt.get(foe) ?? 0)) {
        this.ribbonAt.set(foe, now + LETS_BE_BAD.ribbonInterval);
        ctx.hurt(foe, LETS_BE_BAD.ribbonDamage, away.clone(), 'stagger', LETS_BE_BAD.ribbonKnock);
        ctx.flash(foe, 0x66cfff, 0.12);
        this.dust?.burst(foe.pos.clone().setY(1.35));
        ribbonHit = true;
      }
      const align = dist < 0.2 ? 1 : (dx * lx + dz * lz) / Math.max(dist, 1e-4);
      if (dist <= LETS_BE_BAD.kickReach + foe.radius && align > 0.45 && now >= (this.kickAt.get(foe) ?? 0)) {
        this.kickAt.set(foe, now + LETS_BE_BAD.kickInterval);
        ctx.hurt(foe, LETS_BE_BAD.kickDamage, away.clone(), 'knockback', LETS_BE_BAD.kickKnock);
        ctx.flash(foe, 0xd8f4ff, 0.14);
        this.dust?.burst(foe.pos.clone().setY(0.65));
        ctx.camera.addShake(0.04);
      }
    }
    if (ribbonHit) this.ribbonFlash = 0.16;
  }

  private endSpin() {
    if (this.spin) this.spin.active = false;
    this.spin = null;
    this.spinAngle = 0;
    this.ribbonFlash = 0;
    for (const ribbon of this.tornado) ribbon.mesh.visible = false;
    if (this.glitter) this.glitter.visible = false;
    if (this.footGlow) this.footGlow.visible = false;
  }

  private stepWave(ctx: KitContext, dt: number) {
    if (!this.wave || this.waveTime <= 0) return;
    this.waveTime -= dt;
    const age = ABRACADABRA.expand - this.waveTime;
    const radius = Math.min(ABRACADABRA.radius, (age / ABRACADABRA.expand) * ABRACADABRA.radius);
    this.wave.position.set(ctx.pos.x, 0.08, ctx.pos.z);
    this.wave.scale.setScalar(Math.max(0.15, radius));
    (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, this.waveTime / ABRACADABRA.expand);
    for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
      if (this.waveHit.has(foe)) continue;
      if (foe.pos.distanceTo(ctx.pos) > radius + foe.radius) continue;
      this.waveHit.add(foe);
      const removed = ctx.hurt(foe, ABRACADABRA.damage, _look.set(foe.pos.x - ctx.pos.x, 0, foe.pos.z - ctx.pos.z).normalize(), 'knockback', 0.8);
      if (removed > 0 && foe.hp <= 0) {
        ctx.sound('marilyn.abracadabra.dust');
        this.dust?.burst(foe.pos.clone().setY(0.4));
      }
    }
    if (this.waveTime <= 0) this.wave.visible = false;
  }

  private retireProjection(projection: Projection) {
    projection.active = false;
    projection.mesh.visible = false;
  }

  private flatLook(ctx: KitContext) {
    ctx.lookDir(_look);
    _look.y = 0;
    if (_look.lengthSq() < 1e-5) _look.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    return _look.normalize();
  }
}
