import * as THREE from 'three';
import type { AbilityId } from '../config';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from '../ryderz/kit';
import type { PoseOverride } from '../skeletal';
import { BoomerAuraSystem } from './aura';
import { auraRing, beamVolume, livingFoes, pacify, warnMissingBoomerModel, xrayOverlay, type CrowdBody } from './fx';

export const DREAM_VISION = { radius: 12, pacify: 4, expand: 0.65, cooldown: 14 };
export const PROCLAIM_PEACE = { range: 16, duration: 3, tick: 0.5, damage: 8, cooldown: 16 };
export const FREE_AT_LAST = { duration: 12, strength: 2, speed: 2, endurance: 0.5, cooldown: 30 };

const BURGUNDY = 0x800020;
const _look = new THREE.Vector3();
const _forward = new THREE.Vector3(0, 0, 1);

interface Scan {
  target: KitTarget;
  group: THREE.Group;
  scan: THREE.Object3D;
  life: number;
}

/**
 * Martin Luther King Jr., the Burgundy Boomer. Justice.
 * Dream Vision pacifies without damage. Proclaim Peace is a beam that freezes
 * only while a body is inside it and damages on a half-second clock.
 * Free at Last doubles strength and speed and halves incoming damage, then
 * clears every multiplier together.
 */
export class MartinKit implements RyderKit {
  readonly airY = 0;
  private ctx: KitContext | null = null;
  private aura: BoomerAuraSystem | null = null;
  private wave: THREE.Mesh | null = null;
  private waveTime = 0;
  private waveHit = new Set<Object>();
  private scans: Scan[] = [];
  private beam: THREE.Object3D | null = null;
  private beamTime = 0;
  private beamClock = 0;
  private beamLength = PROCLAIM_PEACE.range;
  private empowered = 0;
  private poseTime = 0;
  private poseKind: PoseOverride['kind'] | null = null;
  private pulse = 0;
  private trail = 0;

  get locked() {
    return this.beamTime > 0;
  }

  get busy() {
    return this.poseTime > 0 && this.beamTime <= 0 && this.empowered <= 0;
  }

  get moveScale() {
    return this.empowered > 0 ? FREE_AT_LAST.speed : 1;
  }

  get outgoingScale() {
    return this.empowered > 0 ? FREE_AT_LAST.strength : 1;
  }

  get incomingScale() {
    return this.empowered > 0 ? FREE_AT_LAST.endurance : 1;
  }

  get glow() {
    if (this.empowered > 0) return 0.9;
    return this.beamTime > 0 || this.poseTime > 0 ? 0.45 : 0;
  }

  get pose(): PoseOverride | null {
    if (this.empowered > 0) return { kind: 'rush', t: 0.4, weight: 0.45 };
    if (!this.poseKind || this.poseTime <= 0) return null;
    return { kind: this.poseKind, t: 1 - Math.min(1, this.poseTime), weight: 1 };
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const fighter = ctx.fighter();
    if (fighter && fighter.meshSource !== 'gltf') warnMissingBoomerModel('martin-luther-king');
    this.aura = new BoomerAuraSystem({ primary: 0x800020, secondary: 0xb22242, highlight: 0xff5c78 });
    if (fighter) this.aura.attach(fighter.humanoid.group);
    this.wave = auraRing(BURGUNDY);
    this.wave.visible = false;
    ctx.scene.add(this.wave);
    this.beam = beamVolume(0xff2a3a, BURGUNDY);
    this.beam.visible = false;
    ctx.scene.add(this.beam);
  }

  detach() {
    this.interrupt();
    this.aura?.dispose();
    this.aura = null;
    this.clearScans();
    if (this.wave) {
      this.wave.removeFromParent();
      this.wave.geometry.dispose();
      (this.wave.material as THREE.Material).dispose();
      this.wave = null;
    }
    if (this.beam) {
      this.beam.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      this.beam.removeFromParent();
      this.beam = null;
    }
    this.ctx = null;
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.poseTime = Math.max(0, this.poseTime - frame.dt);
    if (this.poseTime <= 0 && this.empowered <= 0) this.poseKind = null;
    const wasEmpowered = this.empowered > 0;
    this.empowered = Math.max(0, this.empowered - frame.dt);
    if (wasEmpowered && this.empowered <= 0) ctx.sound('martin.freeAtLast.end');
    const ratio = frame.maxAura ? (frame.aura ?? 0) / frame.maxAura : 1;
    this.aura?.setCharge(frame.burnout ? 0 : ratio, this.pulse + (this.empowered > 0 ? 0.45 : 0));
    this.pulse = 0;
    this.aura?.update(frame.dt, frame.moving || this.empowered > 0);
    this.stepWave(ctx, frame.dt);
    this.stepScans(frame.dt);
    this.stepBeam(ctx, frame.dt);
    if (this.empowered > 0 && frame.moving) {
      this.trail -= frame.dt;
      if (this.trail <= 0) {
        this.trail = 0.08;
        ctx.particles.emit(ctx.pos.clone().setY(0.9), 0xb22242, 6, { speed: 1.4, size: 0.16, life: 0.35, up: 0.2 });
        ctx.afterimages.spawn(0.32, 0.28, 0x800020);
      }
    }
  }

  tryAbility(id: AbilityId) {
    if (id === 'dreamVision') return this.dreamVision();
    if (id === 'proclaimPeace') return this.proclaimPeace();
    if (id === 'freeAtLast') return this.freeAtLast();
    return false;
  }

  melee(): MeleeStep | null {
    return null;
  }

  interrupt() {
    this.empowered = 0;
    this.beamTime = 0;
    this.waveTime = 0;
    this.poseTime = 0;
    this.poseKind = null;
    if (this.wave) this.wave.visible = false;
    if (this.beam) this.beam.visible = false;
    this.clearScans();
  }

  private dreamVision() {
    const ctx = this.ctx;
    if (!ctx || !this.wave) return false;
    ctx.cooldown('dreamVision', DREAM_VISION.cooldown);
    ctx.sound('martin.dreamVision.scan');
    ctx.camera.addKick(0.16);
    this.pulse = 1;
    this.poseKind = 'cast';
    this.poseTime = 0.55;
    this.waveTime = DREAM_VISION.expand;
    this.waveHit.clear();
    this.wave.visible = true;
    this.wave.position.set(ctx.pos.x, 0.08, ctx.pos.z);
    return true;
  }

  private proclaimPeace() {
    const ctx = this.ctx;
    if (!ctx || !this.beam) return false;
    ctx.cooldown('proclaimPeace', PROCLAIM_PEACE.cooldown);
    ctx.sound('martin.proclaimPeace.beam');
    ctx.camera.addKick(0.12);
    this.pulse = 1;
    this.poseKind = 'channel';
    this.poseTime = PROCLAIM_PEACE.duration;
    this.beamTime = PROCLAIM_PEACE.duration;
    this.beamClock = PROCLAIM_PEACE.tick;
    this.beam.visible = true;
    this.placeBeam(ctx);
    return true;
  }

  private freeAtLast() {
    const ctx = this.ctx;
    if (!ctx) return false;
    ctx.cooldown('freeAtLast', FREE_AT_LAST.cooldown);
    ctx.sound('martin.freeAtLast.empower');
    ctx.camera.addKick(0.22);
    ctx.camera.addFovPunch(4);
    this.pulse = 1;
    this.empowered = FREE_AT_LAST.duration;
    return true;
  }

  private stepWave(ctx: KitContext, dt: number) {
    if (!this.wave || this.waveTime <= 0) return;
    this.waveTime -= dt;
    const age = DREAM_VISION.expand - this.waveTime;
    const radius = Math.min(DREAM_VISION.radius, (age / DREAM_VISION.expand) * DREAM_VISION.radius);
    this.wave.position.set(ctx.pos.x, 0.08, ctx.pos.z);
    this.wave.scale.setScalar(Math.max(0.15, radius));
    (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.75 * Math.max(0, this.waveTime / DREAM_VISION.expand);
    for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
      if (this.waveHit.has(foe)) continue;
      if (foe.pos.distanceTo(ctx.pos) > radius + foe.radius) continue;
      this.waveHit.add(foe);
      const before = foe.hp;
      pacify(foe, DREAM_VISION.pacify);
      foe.hp = before;
      ctx.flash(foe, 0xb22242, 0.35);
      this.attachScan(foe);
    }
    if (this.waveTime <= 0) this.wave.visible = false;
  }

  private attachScan(target: KitTarget) {
    const body = target as CrowdBody;
    const parent = body.fighter?.humanoid.group;
    const overlay = xrayOverlay(0xff5c78);
    if (parent) parent.add(overlay.group);
    else if (this.ctx) {
      overlay.group.position.copy(target.pos);
      this.ctx.scene.add(overlay.group);
    }
    this.scans.push({ target, group: overlay.group, scan: overlay.scan, life: (target as CrowdBody).pacified ?? DREAM_VISION.pacify });
  }

  private stepScans(dt: number) {
    for (let i = this.scans.length - 1; i >= 0; i -= 1) {
      const scan = this.scans[i];
      scan.life -= dt;
      scan.scan.position.y = 0.25 + ((Math.sin(scan.life * 6) + 1) * 0.5) * 1.35;
      const body = scan.target as CrowdBody;
      if (!body.fighter) scan.group.position.copy(scan.target.pos);
      if (scan.life <= 0 || scan.target.hp <= 0) {
        scan.group.removeFromParent();
        this.scans.splice(i, 1);
      }
    }
  }

  private stepBeam(ctx: KitContext, dt: number) {
    if (!this.beam || this.beamTime <= 0) return;
    this.beamTime -= dt;
    this.poseTime = Math.max(this.poseTime, this.beamTime);
    const length = this.placeBeam(ctx);
    const inside: KitTarget[] = [];
    for (const foe of livingFoes(ctx.targets(), ctx.canHit)) {
      if (!this.inBeam(ctx, foe, length)) continue;
      inside.push(foe);
      const body = foe as CrowdBody;
      const refresh = body.kind === 'heavy' || body.kind === 'broadcaster' ? 0.12 : 0.22;
      body.immobile = refresh;
      body.striker?.interrupt();
      ctx.flash(foe, 0xff5c78, 0.08);
    }
    this.beamClock -= dt;
    if (this.beamClock <= 0) {
      this.beamClock += PROCLAIM_PEACE.tick;
      for (const foe of inside) {
        ctx.hurt(foe, PROCLAIM_PEACE.damage * this.outgoingScale, _look, 'stagger', 0.2);
      }
    }
    if (this.beamTime <= 0) this.beam.visible = false;
  }

  private placeBeam(ctx: KitContext) {
    const flat = this.flatLook(ctx);
    let length = PROCLAIM_PEACE.range;
    for (let step = 0.5; step <= PROCLAIM_PEACE.range; step += 0.5) {
      const x = ctx.pos.x + flat.x * step;
      const z = ctx.pos.z + flat.z * step;
      if (ctx.blocked(x, z, 0.2)) {
        length = Math.max(0.4, step - 0.5);
        break;
      }
    }
    this.beamLength = length;
    const beam = this.beam!;
    beam.visible = true;
    beam.scale.set(1, 1, length);
    beam.position.set(ctx.pos.x + flat.x * length * 0.5, 1.15, ctx.pos.z + flat.z * length * 0.5);
    beam.quaternion.setFromUnitVectors(_forward, flat);
    return length;
  }

  private inBeam(ctx: KitContext, foe: KitTarget, length: number) {
    const flat = this.flatLook(ctx);
    const dx = foe.pos.x - ctx.pos.x;
    const dz = foe.pos.z - ctx.pos.z;
    const along = dx * flat.x + dz * flat.z;
    if (along < 0 || along > length + foe.radius) return false;
    const side = Math.abs(dx * flat.z - dz * flat.x);
    return side < 0.7 + foe.radius;
  }

  private flatLook(ctx: KitContext) {
    ctx.lookDir(_look);
    _look.y = 0;
    if (_look.lengthSq() < 1e-5) _look.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    return _look.normalize();
  }

  private clearScans() {
    for (const scan of this.scans) scan.group.removeFromParent();
    this.scans = [];
  }
}
