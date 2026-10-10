import * as THREE from 'three';
import type { AbilityId } from '../config';
import type { KitContext, KitFrame, MeleeStep, RyderKit } from '../ryderz/kit';
import type { PoseOverride } from '../skeletal';
import { BoomerAuraSystem } from './aura';
import {
  FairyDustPool,
  auraRing,
  handPoint,
  livingFoes,
  projectionFigure,
  ribbonMesh,
  warnMissingBoomerModel,
  writeRibbon,
} from './fx';

export const SHOWTIME = { count: 3, damage: 18, range: 18, speed: 14, life: 1.45, cooldown: 10 };
export const LETS_BE_BAD = { damage: 7, maxHits: 6, interval: 0.42, duration: 2.5, reach: 2.6, hold: 0.75, cooldown: 12 };
export const ABRACADABRA = { damage: 55, radius: 12, heal: 0.15, expand: 0.7, cooldown: 25 };

const BLUE = 0x168bff;
const _look = new THREE.Vector3();
const _hand = new THREE.Vector3();
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

interface Ribbon {
  mesh: THREE.Mesh;
  positions: Float32Array;
  samples: THREE.Vector3[];
}

/**
 * Marilyn Monroe, the Blue Boomer. Charity.
 * Showtime sends three cartwheeling projections. Let's Be Bad draws ribbons
 * that hit on a timer. Abracadabra is one expanding wave: damage once, heal
 * allies, and dust only the enemies that wave actually kills.
 */
export class MarilynKit implements RyderKit {
  readonly airY = 0;
  private ctx: KitContext | null = null;
  private aura: BoomerAuraSystem | null = null;
  private projections: Projection[] = [];
  private ribbons: Ribbon[] = [];
  private ribbonHits = new Map<Object, number>();
  private ribbonTime = 0;
  private ribbonTick = 0;
  private wave: THREE.Mesh | null = null;
  private waveTime = 0;
  private waveHit = new Set<Object>();
  private dust: FairyDustPool | null = null;
  private poseTime = 0;
  private poseKind: PoseOverride['kind'] | null = null;
  private channel = 0;
  private pulse = 0;

  get locked() {
    return this.channel > 0;
  }

  get busy() {
    return this.poseTime > 0 && this.channel <= 0;
  }

  get pose(): PoseOverride | null {
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
    for (let i = 0; i < 2; i += 1) {
      const ribbon = ribbonMesh(i === 0 ? 0x66cfff : 0xd8f4ff);
      ribbon.mesh.visible = false;
      ctx.scene.add(ribbon.mesh);
      this.ribbons.push({ mesh: ribbon.mesh, positions: ribbon.positions, samples: [] });
    }
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
    for (const ribbon of this.ribbons) {
      ribbon.mesh.removeFromParent();
      ribbon.mesh.geometry.dispose();
      (ribbon.mesh.material as THREE.Material).dispose();
    }
    this.ribbons = [];
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
    this.stepProjections(ctx, frame.dt);
    this.stepRibbons(ctx, frame.dt);
    this.stepWave(ctx, frame.dt);
    this.dust?.update(frame.dt);
  }

  tryAbility(id: AbilityId) {
    if (id === 'showtime') return this.showtime();
    if (id === 'letsBeBad') return this.letsBeBad();
    if (id === 'abracadabra') return this.abracadabra();
    return false;
  }

  melee(): MeleeStep | null {
    return null;
  }

  interrupt() {
    this.channel = 0;
    this.poseTime = 0;
    this.poseKind = null;
    this.ribbonTime = 0;
    this.waveTime = 0;
    for (const projection of this.projections) this.retireProjection(projection);
    for (const ribbon of this.ribbons) ribbon.mesh.visible = false;
    if (this.wave) this.wave.visible = false;
  }

  private showtime() {
    const ctx = this.ctx;
    if (!ctx) return false;
    ctx.cooldown('showtime', SHOWTIME.cooldown);
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
    ctx.cooldown('letsBeBad', LETS_BE_BAD.cooldown);
    ctx.sound('marilyn.letsBeBad.ribbon');
    ctx.camera.addKick(0.12);
    this.pulse = 1;
    this.poseKind = 'channel';
    this.poseTime = LETS_BE_BAD.duration;
    this.channel = LETS_BE_BAD.duration;
    this.ribbonTime = LETS_BE_BAD.duration;
    this.ribbonTick = LETS_BE_BAD.interval;
    this.ribbonHits.clear();
    for (const ribbon of this.ribbons) ribbon.mesh.visible = true;
    return true;
  }

  private abracadabra() {
    const ctx = this.ctx;
    if (!ctx || !this.wave) return false;
    ctx.cooldown('abracadabra', ABRACADABRA.cooldown);
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

  private stepRibbons(ctx: KitContext, dt: number) {
    if (this.ribbonTime <= 0) return;
    this.ribbonTime -= dt;
    const group = ctx.fighter()?.humanoid.group;
    const flat = this.flatLook(ctx);
    const yaw = Math.atan2(flat.x, flat.z);
    this.ribbons.forEach((ribbon, index) => {
      const side = (index === 0 ? 1 : -1) as 1 | -1;
      ribbon.samples.length = 0;
      const origin = group ? handPoint(group, side, _hand) : _hand.set(ctx.pos.x + 0.35 * side, 1.25, ctx.pos.z);
      for (let i = 0; i < 28; i += 1) {
        const t = i / 27;
        const weave = Math.sin(ctx.time() * 9 + t * 7 + index) * 0.28;
        _sample.set(
          origin.x + flat.x * t * 3.1 + Math.cos(yaw) * (0.15 * side + weave),
          origin.y + Math.sin(t * Math.PI) * 0.35 + Math.sin(ctx.time() * 6 + t * 8) * 0.08,
          origin.z + flat.z * t * 3.1 + Math.sin(yaw) * (0.15 * side + weave),
        );
        ribbon.samples.push(_sample.clone());
      }
      const count = writeRibbon(ribbon.positions, ribbon.samples, 0.07);
      const position = ribbon.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      position.needsUpdate = true;
      const quads = Math.max(0, count / 2 - 1);
      ribbon.mesh.geometry.setDrawRange(0, quads * 6);
      ribbon.mesh.geometry.computeBoundingSphere();
      ribbon.mesh.visible = true;
    });
    this.ribbonTick -= dt;
    if (this.ribbonTick <= 0) {
      this.ribbonTick += LETS_BE_BAD.interval;
      this.ribbonStrike(ctx, flat);
    }
    if (this.ribbonTime <= 0) {
      for (const ribbon of this.ribbons) ribbon.mesh.visible = false;
    }
  }

  private ribbonStrike(ctx: KitContext, flat: THREE.Vector3) {
    for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
      const dx = foe.pos.x - ctx.pos.x;
      const dz = foe.pos.z - ctx.pos.z;
      const dist = Math.hypot(dx, dz);
      const ahead = dist < 0.2 || (dx * flat.x + dz * flat.z) / dist > 0.15;
      let nearRibbon = false;
      for (const ribbon of this.ribbons) {
        for (const sample of ribbon.samples) {
          const gap = Math.hypot(sample.x - foe.pos.x, sample.z - foe.pos.z);
          if (gap < foe.radius + 0.7) nearRibbon = true;
        }
      }
      if (!nearRibbon && !(ahead && dist < LETS_BE_BAD.reach + foe.radius)) continue;
      const hits = this.ribbonHits.get(foe) ?? 0;
      if (hits >= LETS_BE_BAD.maxHits) continue;
      this.ribbonHits.set(foe, hits + 1);
      ctx.hurt(foe, LETS_BE_BAD.damage, flat, 'stagger', 0.35);
      ctx.hold?.(foe, LETS_BE_BAD.hold);
      ctx.flash(foe, 0x66cfff, 0.16);
    }
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
