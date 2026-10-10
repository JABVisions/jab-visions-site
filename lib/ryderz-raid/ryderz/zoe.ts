import * as THREE from 'three';
import type { AbilityId } from '../config';
import { HitSet, sortByDistance, targetsInRadius } from '../combat';
import type { PlasmaOrbits } from '../plasma-orbs';
import { TrailRibbon } from '../speed-vfx';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Zoe Folie — the Blue Ryder. Plasma, force fields, aerial assault.
 *
 * Q  Levitate          rise into a rolling plasma sphere; steer it through
 *                      hosts. Contact damage + knockback, per-target cooldown.
 * E  Force Field       aim with the crosshair and launch a plasma disc that
 *                      knocks everything it crosses.
 * R  Heartbreak Blitz  snap into the sphere, strafe over nearby hosts, bomb
 *                      them from above, finish with a burst and a clean landing.
 *
 * The three orbiting orbs live on the fighter (see `PlasmaOrbits`); this kit
 * only retargets them. Visual language: electric cyan, translucent shells,
 * bright cores.
 */

const WHITE = new THREE.Color(0xffffff);
const CYAN = 0x7ad6ff;

const COMBO: MeleeStep[] = [
  { style: 'slap', damageMul: 0.85, hitDelay: 0.12, range: 2.3, halfArc: 0.85, reaction: 'stagger', strength: 0.9, recovery: 0.32, shake: 0.05, hitStop: 0, lunge: 0.2, sound: 'zoe.melee.slap' },
  { style: 'kick', damageMul: 1.05, hitDelay: 0.15, range: 2.55, halfArc: 0.7, reaction: 'knockback', strength: 0.95, recovery: 0.38, shake: 0.1, hitStop: 0.02, lunge: 0.25, sound: 'zoe.melee.kick' },
  { style: 'blast', damageMul: 1.45, hitDelay: 0.18, range: 2.7, halfArc: 0.9, reaction: 'heavy', strength: 1.05, recovery: 0.52, shake: 0.22, hitStop: 0.04, lunge: 0.35, sound: 'zoe.melee.blast' },
];
const COMBO_WINDOW = 1.05;

// Levitate
const LIFT_RISE = 0.2;
const LIFT_DROP = 0.22;
const LIFT_HEIGHT = 0.46;
const LIFT_MOVE = 1.22;
const LIFT_RADIUS = 1.55;
const LIFT_HIT = 14;
const LIFT_REHIT = 0.42;
const LIFT_BRACED = 0.55;

// Double-jump levitation. Same shell as Levitate, no contact damage, and it lands on its own.
const HOP_RISE = 0.32;
const HOP_HOLD = 1.05;
const HOP_DROP = 0.34;
const HOP_HEIGHT = 2.2;

// Force Field disc
const CAST_WIND = 0.16;
const CAST_HOLD = 0.22;
const DISC_SPEED = 26;
const DISC_LIFE = 1.05;
const DISC_HIT = 22;
const DISC_RADIUS0 = 0.85;
const DISC_RADIUS1 = 1.65;

// Heartbreak Blitz
const BLITZ_LAUNCH = 0.16;
const BLITZ_RUN = 1.02;
const BLITZ_FINISH = 0.4;
const BLITZ_HEIGHT = 4.35;
const BLITZ_SEEK = 16;
const BLITZ_MAX_TARGETS = 5;
const BLITZ_BOMBS = 10;
const BLITZ_BOMB_FROM = 0.08;
const BLITZ_BOMB_TO = 0.9;
const BLITZ_BOMB_DAMAGE = 13;
const BLITZ_BOMB_SPEED = 26;
const BLITZ_BOMB_AOE = 1.7;
const BLITZ_BURST_DAMAGE = 34;
const BLITZ_BURST_RADIUS = 4.2;
const BLITZ_DASH = 7.5;

type Sequence =
  | { kind: 'lift'; phase: 'rise' | 'hover' | 'drop'; t: number }
  | { kind: 'float'; phase: 'rise' | 'hover' | 'drop'; t: number; from: number }
  | { kind: 'cast'; phase: 'wind' | 'hold'; t: number; dir: THREE.Vector3; fired: boolean }
  | {
      kind: 'blitz';
      phase: 'launch' | 'run' | 'finish';
      t: number;
      waypoints: THREE.Vector3[];
      targets: KitTarget[];
      fired: number;
      burst: boolean;
      from: THREE.Vector3;
      land: THREE.Vector3;
    };

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _hits: KitTarget[] = [];
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function plasmaMat(color: THREE.ColorRepresentation, opacity: number, additive = true) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Translucent plasma sphere Zoe rides inside. Parent to the figure group. */
class ForceFieldShell {
  readonly group = new THREE.Group();
  private shell: THREE.Mesh;
  private inner: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private shellMat: THREE.MeshBasicMaterial;
  private innerMat: THREE.MeshBasicMaterial;
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private clock = 0;
  private open = 0;
  want = 0;

  constructor() {
    this.group.name = 'ForceFieldShell';
    this.group.position.y = 0.92;
    this.shellMat = plasmaMat(0x2aa9ff, 0.16);
    this.innerMat = plasmaMat(0x7ad6ff, 0.1);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1.52, 28, 20), this.shellMat);
    this.inner = new THREE.Mesh(new THREE.SphereGeometry(1.38, 20, 14), this.innerMat);
    this.shell.renderOrder = 3;
    this.inner.renderOrder = 3;
    this.group.add(this.shell, this.inner);
    const ringGeo = new THREE.TorusGeometry(1.46, 0.018, 8, 48);
    for (let i = 0; i < 3; i += 1) {
      const mat = plasmaMat(0x9ae8ff, 0.55);
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.rotation.set(i === 0 ? Math.PI / 2 : 0.55 * i, i * 1.1, i * 0.7);
      ring.renderOrder = 4;
      this.group.add(ring);
      this.rings.push(ring);
      this.ringMats.push(mat);
    }
    this.group.visible = false;
    this.group.scale.setScalar(0.08);
  }

  setColor(color: THREE.ColorRepresentation) {
    this.shellMat.color.set(color);
    this.innerMat.color.set(color).lerp(WHITE, 0.45);
    for (const mat of this.ringMats) mat.color.set(color).lerp(WHITE, 0.35);
  }

  update(dt: number) {
    this.clock += dt;
    this.open += (this.want - this.open) * Math.min(1, dt * 8);
    if (this.open < 0.02 && this.want <= 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const s = 0.12 + 0.88 * this.open;
    const pulse = 1 + 0.03 * Math.sin(this.clock * 7);
    this.group.scale.setScalar(s * pulse);
    this.shellMat.opacity = 0.1 + 0.12 * this.open;
    this.innerMat.opacity = 0.06 + 0.1 * this.open;
    this.rings[0].rotation.z += dt * 1.6;
    this.rings[1].rotation.y += dt * 2.1;
    this.rings[2].rotation.x += dt * 1.4;
    for (const mat of this.ringMats) mat.opacity = 0.25 + 0.4 * this.open;
  }

  dispose() {
    this.shell.geometry.dispose();
    this.inner.geometry.dispose();
    this.shellMat.dispose();
    this.innerMat.dispose();
    this.rings[0]?.geometry.dispose();
    for (const mat of this.ringMats) mat.dispose();
  }
}

const DISC_GEO = new THREE.CircleGeometry(1, 28);
const DISC_RING_GEO = new THREE.RingGeometry(0.82, 1.05, 36);
const BOMB_CORE_GEO = new THREE.SphereGeometry(0.11, 10, 8);
const BOMB_SHELL_GEO = new THREE.SphereGeometry(0.2, 10, 8);

interface Disc {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  damage: number;
  radius: number;
  mesh: THREE.Group;
  face: THREE.MeshBasicMaterial;
  rim: THREE.MeshBasicMaterial;
  trail: TrailRibbon;
  hits: HitSet<KitTarget>;
}

interface Bomb {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  mesh: THREE.Group;
  core: THREE.MeshBasicMaterial;
  shell: THREE.MeshBasicMaterial;
  trail: TrailRibbon;
}

class PlasmaDiscPool {
  readonly group = new THREE.Group();
  private items: Disc[] = [];
  private color = new THREE.Color();

  constructor(count: number, color: THREE.ColorRepresentation) {
    this.group.name = 'PlasmaDiscs';
    this.color.set(color);
    for (let i = 0; i < count; i += 1) {
      const face = plasmaMat(color, 0.28);
      const rim = plasmaMat(0xdeffff, 0.7);
      const mesh = new THREE.Group();
      const disc = new THREE.Mesh(DISC_GEO, face);
      const ring = new THREE.Mesh(DISC_RING_GEO, rim);
      disc.renderOrder = 4;
      ring.renderOrder = 5;
      mesh.add(disc, ring);
      mesh.visible = false;
      const trail = new TrailRibbon(color, { life: 0.22, width: 0.42, spacing: 0.1, points: 16 });
      this.group.add(mesh, trail.mesh);
      this.items.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        max: 1,
        damage: 0,
        radius: DISC_RADIUS0,
        mesh,
        face,
        rim,
        trail,
        hits: new HitSet(),
      });
    }
    this.setColor(color);
  }

  setColor(color: THREE.ColorRepresentation) {
    this.color.set(color);
    for (const d of this.items) {
      d.face.color.copy(this.color);
      d.rim.color.copy(this.color).lerp(WHITE, 0.65);
      d.trail.setColor(this.color);
    }
  }

  spawn(pos: THREE.Vector3, dir: THREE.Vector3, damage: number) {
    const d = this.items.find((i) => !i.active) ?? this.items.reduce((a, b) => (a.life < b.life ? a : b));
    if (d.active) d.trail.clear();
    d.active = true;
    d.pos.copy(pos);
    d.vel.copy(dir).normalize().multiplyScalar(DISC_SPEED);
    d.life = DISC_LIFE;
    d.max = DISC_LIFE;
    d.damage = damage;
    d.radius = DISC_RADIUS0;
    d.hits.clear();
    d.mesh.visible = true;
    d.mesh.position.copy(pos);
    d.mesh.quaternion.setFromUnitVectors(Z_AXIS, _dir.copy(d.vel).normalize());
    d.trail.clear();
    d.trail.feed(pos);
    d.trail.intensity = 1.1;
    return d;
  }

  update(
    dt: number,
    env: {
      targets: readonly KitTarget[];
      camera: THREE.Camera;
      blocked: (x: number, z: number, radius: number) => boolean;
      onHit: (target: KitTarget, disc: Disc) => void;
      onFizzle: (pos: THREE.Vector3) => void;
    },
  ) {
    for (const d of this.items) {
      if (!d.active) {
        d.trail.update(dt, env.camera);
        continue;
      }
      d.life -= dt;
      const p = 1 - d.life / d.max;
      d.radius = DISC_RADIUS0 + (DISC_RADIUS1 - DISC_RADIUS0) * p;
      d.pos.addScaledVector(d.vel, dt);
      if (d.pos.y < 0.9) {
        d.pos.y = 0.9;
        if (d.vel.y < 0) d.vel.y = 0;
      }
      d.mesh.position.copy(d.pos);
      d.mesh.scale.setScalar(d.radius);
      d.mesh.quaternion.setFromUnitVectors(Z_AXIS, _dir.copy(d.vel).normalize());
      d.face.opacity = 0.28 + 0.18 * (1 - p);
      d.rim.opacity = 0.55 + 0.35 * (1 - p * 0.5);
      d.trail.feed(d.pos);
      d.trail.update(dt, env.camera);

      if (d.life <= 0) {
        env.onFizzle(d.pos);
        this.retire(d);
        continue;
      }
      if (p > 0.06 && d.pos.y < 2.5 && env.blocked(d.pos.x, d.pos.z, 0.25)) {
        env.onFizzle(d.pos);
        this.retire(d);
        continue;
      }
      for (const t of env.targets) {
        if (t.hp <= 0) continue;
        const dx = t.pos.x - d.pos.x;
        const dz = t.pos.z - d.pos.z;
        const dy = 1.05 - d.pos.y;
        const r = t.radius + d.radius;
        if (dx * dx + dz * dz + dy * dy * 0.25 > r * r) continue;
        if (!d.hits.take(t, 0, Infinity)) continue;
        env.onHit(t, d);
      }
    }
  }

  private retire(d: Disc) {
    d.active = false;
    d.mesh.visible = false;
    d.trail.intensity = 0;
  }

  clear() {
    for (const d of this.items) {
      this.retire(d);
      d.trail.clear();
    }
  }

  dispose() {
    this.clear();
    for (const d of this.items) {
      d.face.dispose();
      d.rim.dispose();
      d.trail.dispose();
    }
  }
}

class PlasmaBombPool {
  readonly group = new THREE.Group();
  private items: Bomb[] = [];
  private color = new THREE.Color();

  constructor(count: number, color: THREE.ColorRepresentation) {
    this.group.name = 'PlasmaBombs';
    this.color.set(color);
    for (let i = 0; i < count; i += 1) {
      const core = plasmaMat(0xdeffff, 0.95);
      const shell = plasmaMat(color, 0.45);
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(BOMB_CORE_GEO, core), new THREE.Mesh(BOMB_SHELL_GEO, shell));
      mesh.visible = false;
      const trail = new TrailRibbon(color, { life: 0.28, width: 0.16, spacing: 0.08, points: 14 });
      this.group.add(mesh, trail.mesh);
      this.items.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        mesh,
        core,
        shell,
        trail,
      });
    }
    this.setColor(color);
  }

  setColor(color: THREE.ColorRepresentation) {
    this.color.set(color);
    for (const b of this.items) {
      b.shell.color.copy(this.color);
      b.core.color.copy(this.color).lerp(WHITE, 0.7);
      b.trail.setColor(this.color);
    }
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, damage: number, life = 1.1) {
    const b = this.items.find((i) => !i.active) ?? this.items.reduce((a, c) => (a.life < c.life ? a : c));
    if (b.active) b.trail.clear();
    b.active = true;
    b.pos.copy(pos);
    b.vel.copy(vel);
    b.life = life;
    b.damage = damage;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.trail.clear();
    b.trail.feed(pos);
    b.trail.intensity = 1.15;
    return b;
  }

  update(
    dt: number,
    env: {
      targets: readonly KitTarget[];
      camera: THREE.Camera;
      heightAt: (x: number, z: number) => number;
      blocked: (x: number, z: number, radius: number) => boolean;
      onExplode: (pos: THREE.Vector3, damage: number, direct: KitTarget | null) => void;
    },
  ) {
    for (const b of this.items) {
      if (!b.active) {
        b.trail.update(dt, env.camera);
        continue;
      }
      b.life -= dt;
      b.vel.y -= 18 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      const pulse = 1 + 0.15 * Math.sin(b.life * 18);
      b.mesh.scale.setScalar(pulse);
      b.trail.feed(b.pos);
      b.trail.update(dt, env.camera);

      const ground = env.heightAt(b.pos.x, b.pos.z);
      if (b.life <= 0 || b.pos.y <= ground + 0.12) {
        env.onExplode(b.pos, b.damage, null);
        this.retire(b);
        continue;
      }
      if (b.pos.y < 2.6 && env.blocked(b.pos.x, b.pos.z, 0.12)) {
        env.onExplode(b.pos, b.damage, null);
        this.retire(b);
        continue;
      }
      for (const t of env.targets) {
        if (t.hp <= 0) continue;
        const dx = t.pos.x - b.pos.x;
        const dz = t.pos.z - b.pos.z;
        const dy = 1.05 - b.pos.y;
        const r = t.radius + 0.28;
        if (dx * dx + dz * dz + dy * dy * 0.4 < r * r) {
          env.onExplode(b.pos, b.damage, t);
          this.retire(b);
          break;
        }
      }
    }
  }

  private retire(b: Bomb) {
    b.active = false;
    b.mesh.visible = false;
    b.trail.intensity = 0;
  }

  clear() {
    for (const b of this.items) {
      this.retire(b);
      b.trail.clear();
    }
  }

  dispose() {
    this.clear();
    for (const b of this.items) {
      b.core.dispose();
      b.shell.dispose();
      b.trail.dispose();
    }
  }
}

export class ZoeKit implements RyderKit {
  private ctx: KitContext | null = null;
  private seq: Sequence | null = null;
  private poseState: PoseOverride | null = null;
  private air = 0;
  private lifting = false;
  private bodyGlow = 0;
  private comboIndex = 0;
  private comboExpires = 0;
  private liftHits = new HitSet<KitTarget>();
  private shell = new ForceFieldShell();
  private discs = new PlasmaDiscPool(3, CYAN);
  private bombs = new PlasmaBombPool(12, CYAN);
  private sparkT = 0;
  private imageT = 0;
  private cyanSoft = 0xb8e8ff;
  private parented = false;

  get locked() {
    const seq = this.seq;
    if (!seq) return false;
    if (seq.kind === 'lift') return seq.phase !== 'hover';
    if (seq.kind === 'float') return false;
    return true;
  }

  get busy() {
    return this.lifting || this.seq?.kind === 'lift';
  }

  get airY() {
    return this.air;
  }

  get pose() {
    return this.poseState;
  }

  get glow() {
    return this.bodyGlow;
  }

  get intangible() {
    return this.seq?.kind === 'blitz';
  }

  get passthrough() {
    return this.lifting || this.seq?.kind === 'lift';
  }

  get moveScale() {
    return this.lifting ? LIFT_MOVE : 1;
  }

  get braced() {
    return this.lifting ? LIFT_BRACED : this.seq?.kind === 'blitz' ? 0.35 : 0;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const electric = ctx.spec.visual.electricityColor;
    this.shell.setColor(electric);
    this.discs.setColor(electric);
    this.bombs.setColor(electric);
    this.cyanSoft = new THREE.Color(electric).lerp(WHITE, 0.4).getHex();
    ctx.scene.add(this.discs.group, this.bombs.group);
    const fighter = ctx.fighter();
    if (fighter) {
      fighter.humanoid.group.add(this.shell.group);
      this.parented = true;
      ctx.afterimages.bind(fighter, electric);
    }
    this.bodyGlow = 0;
    this.comboIndex = 0;
    this.orbs()?.setColor(electric);
  }

  detach() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.scene.remove(this.discs.group, this.bombs.group);
      this.ctx.afterimages.unbind();
    }
    if (this.parented) this.shell.group.removeFromParent();
    this.parented = false;
    this.discs.clear();
    this.bombs.clear();
    this.ctx = null;
  }

  interrupt() {
    this.seq = null;
    this.poseState = null;
    this.air = 0;
    this.lifting = false;
    this.bodyGlow = 0;
    this.shell.want = 0;
    this.liftHits.clear();
    this.discs.clear();
    this.bombs.clear();
    const orbs = this.orbs();
    if (orbs) {
      orbs.mode = 'idle';
      orbs.castTarget = null;
    }
  }

  tryAirJump(sinceJump: number, height: number) {
    if (!this.ctx || this.seq || this.lifting || sinceJump > 0.9) return false;
    const from = Math.max(0.3, height);
    this.seq = { kind: 'float', phase: 'rise', t: 0, from };
    this.air = from;
    this.shell.want = 1;
    this.ctx.sound('zoe.lift.start');
    this.ctx.camera.addKick(-0.1);
    _p.copy(this.ctx.pos).setY(this.ctx.heightAt(this.ctx.pos.x, this.ctx.pos.z) + 0.05);
    this.ctx.rings.spawn(_p, this.ctx.spec.visual.auraColor, { radius: 1.7, duration: 0.4 });
    this.ctx.particles.emit(_p.clone().setY(_p.y + 1), this.ctx.spec.visual.electricityColor, 16, { speed: 4, size: 0.2, life: 0.4, up: 2.4 });
    return true;
  }

  melee(time: number): MeleeStep | null {
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + COMBO_WINDOW;
    this.ctx?.power.boost(0.7 + 0.25 * this.comboIndex);
    this.ctx?.power.arcAt(['handL', 'handR'], 1, 0.75, 0.1, 0.03);
    return step;
  }

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    switch (id) {
      case 'lift':
        return this.startLift();
      case 'forcefield':
        return this.seq ? true : this.startCast();
      case 'heartbreak':
        return this.seq ? true : this.startBlitz();
      default:
        return false;
    }
  }

  endAbility(id: AbilityId) {
    if (id === 'lift') this.endLift();
  }

  // ---------------------------------------------------------------------------
  // Orbs
  // ---------------------------------------------------------------------------

  private orbs(): PlasmaOrbits | undefined {
    const fighter = this.ctx?.fighter();
    return fighter?.orbs ?? fighter?.rig?.orbs;
  }

  private driveOrbs(frame: KitFrame) {
    const orbs = this.orbs();
    if (!orbs) return;
    const max = frame.maxAura || 1;
    orbs.power = frame.burnout ? 0 : THREE.MathUtils.clamp((frame.aura ?? max) / max, 0, 1);
    const fighting = this.seq !== null || this.lifting;
    orbs.drive = (frame.sprinting ? 1.55 : 1) * (1 + (fighting ? 0.35 : 0) + (frame.moving ? 0.15 : 0));
    if (this.seq?.kind === 'blitz') orbs.mode = 'blitz';
    else if (this.lifting || this.seq?.kind === 'lift' || this.seq?.kind === 'float') orbs.mode = 'levitate';
    else if (this.seq?.kind === 'cast') orbs.mode = 'cast';
    else {
      orbs.mode = 'idle';
      orbs.castTarget = null;
    }
  }

  private handLocal(out: THREE.Vector3) {
    const ctx = this.ctx!;
    const fighter = ctx.fighter();
    const socket = fighter?.humanoid.handR ?? fighter?.rig?.weaponSocket;
    if (socket) {
      socket.getWorldPosition(out);
      fighter!.humanoid.group.worldToLocal(out);
      return out;
    }
    return out.set(0.32, 1.12, 0.48);
  }

  // ---------------------------------------------------------------------------
  // Levitate
  // ---------------------------------------------------------------------------

  private startLift() {
    const ctx = this.ctx!;
    this.lifting = true;
    this.liftHits.clear();
    this.seq = { kind: 'lift', phase: 'rise', t: 0 };
    this.shell.want = 1;
    ctx.power.boost(1.3);
    ctx.power.arcAt(['chest', 'handL', 'handR'], 3, 0.9, 0.14, 0.03);
    ctx.camera.addKick(-0.08);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
    ctx.rings.spawn(_p, ctx.spec.visual.auraColor, { radius: 1.8, duration: 0.32 });
    ctx.particles.emit(_p.setY(_p.y + 1), ctx.spec.visual.electricityColor, 16, { speed: 5, size: 0.2, life: 0.35, up: 1.1 });
    ctx.sound('zoe.lift.start');
    return true;
  }

  private endLift() {
    if (!this.lifting && this.seq?.kind !== 'lift') return;
    this.lifting = false;
    this.seq = { kind: 'lift', phase: 'drop', t: 0 };
    this.shell.want = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.sound('zoe.lift.end');
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1);
    ctx.particles.emit(_p, ctx.spec.visual.electricityColor, 14, { speed: 4, size: 0.18, life: 0.32, up: 0.6 });
  }

  private updateFloat(seq: Extract<Sequence, { kind: 'float' }>, dt: number, frame: KitFrame) {
    seq.t += dt;
    this.shell.want = seq.phase === 'drop' ? 0 : 1;
    if (seq.phase === 'rise') {
      const p = Math.min(1, seq.t / HOP_RISE);
      const eased = 1 - (1 - p) * (1 - p);
      this.air = seq.from + (HOP_HEIGHT - seq.from) * eased;
      this.poseState = { kind: 'hover', t: p, weight: Math.min(1, p * 1.5) };
      this.bodyGlow = 0.22 * p;
      if (seq.t >= HOP_RISE) {
        seq.phase = 'hover';
        seq.t = 0;
      }
      return;
    }
    if (seq.phase === 'hover') {
      this.air = HOP_HEIGHT + Math.sin(frame.time * 2.6) * 0.07;
      this.poseState = { kind: 'hover', t: (frame.time * 0.4) % 1, weight: 1 };
      this.bodyGlow = 0.2;
      if (seq.t >= HOP_HOLD) {
        seq.phase = 'drop';
        seq.t = 0;
        this.shell.want = 0;
      }
      return;
    }
    const p = Math.min(1, seq.t / HOP_DROP);
    this.air = HOP_HEIGHT * (1 - p) * (1 - p);
    this.poseState = { kind: 'land', t: p, weight: 0.75 };
    this.bodyGlow = Math.max(0, 0.2 - p * 0.35);
    if (seq.t >= HOP_DROP) {
      this.seq = null;
      this.poseState = null;
      this.air = 0;
      this.bodyGlow = 0;
      this.shell.want = 0;
    }
  }

  private updateLift(seq: Extract<Sequence, { kind: 'lift' }>, dt: number, frame: KitFrame) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    seq.t += dt;
    switch (seq.phase) {
      case 'rise': {
        const p = Math.min(1, seq.t / LIFT_RISE);
        const eased = 1 - (1 - p) * (1 - p);
        this.air = LIFT_HEIGHT * eased;
        this.poseState = { kind: 'hover', t: p, weight: Math.min(1, p * 2) };
        this.bodyGlow = 0.25 * p;
        if (seq.t >= LIFT_RISE) {
          seq.phase = 'hover';
          seq.t = 0;
        }
        break;
      }
      case 'hover': {
        this.air = LIFT_HEIGHT + Math.sin(frame.time * 3.2) * 0.04;
        this.poseState = { kind: 'hover', t: (frame.time * 0.45) % 1, weight: 1 };
        this.bodyGlow = 0.22;
        this.contactHits();
        this.sparkT -= dt;
        if (this.sparkT <= 0) {
          const a = frame.time * 4 + Math.random();
          _p.set(ctx.pos.x + Math.cos(a) * 1.3, ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + 0.9, ctx.pos.z + Math.sin(a) * 1.3);
          ctx.particles.emit(_p, Math.random() < 0.6 ? electric : this.cyanSoft, 1, { speed: 1.6, size: 0.14, life: 0.4, up: 0.4 });
          this.sparkT = 0.05;
        }
        break;
      }
      case 'drop': {
        const p = Math.min(1, seq.t / LIFT_DROP);
        this.air = LIFT_HEIGHT * (1 - p) * (1 - p);
        this.poseState = { kind: 'land', t: p, weight: p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1 };
        this.bodyGlow = Math.max(0, 0.22 - p * 0.4);
        if (seq.t >= LIFT_DROP) {
          this.seq = null;
          this.poseState = null;
          this.air = 0;
          this.bodyGlow = 0;
        }
        break;
      }
    }
  }

  private contactHits() {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    const hits = targetsInRadius(ctx.targets(), ctx.pos, LIFT_RADIUS, _hits);
    for (const target of [...hits]) {
      if (target.hp <= 0) continue;
      if (!this.liftHits.take(target, ctx.time(), LIFT_REHIT)) continue;
      _dir.subVectors(target.pos, ctx.pos).setY(0);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
      _dir.normalize();
      ctx.hurt(target, LIFT_HIT, _dir, 'knockback', 1.05);
      ctx.flash(target, electric, 0.18);
      _p.copy(target.pos).setY(1.1);
      ctx.particles.emit(_p, electric, 10, { speed: 6, size: 0.2, life: 0.28, direction: _dir });
      ctx.particles.emit(_p, this.cyanSoft, 4, { speed: 3, size: 0.28, life: 0.18 });
      ctx.rings.spawn(_p, electric, { radius: 1.1, duration: 0.2, y: 1.1 });
      ctx.camera.addShake(0.06);
      ctx.power.boost(0.9);
      ctx.sound('zoe.lift.hit');
    }
  }

  // ---------------------------------------------------------------------------
  // Force Field
  // ---------------------------------------------------------------------------

  private aimAlongSight(out: THREE.Vector3) {
    const ctx = this.ctx!;
    ctx.lookDir(out);
    const xz = Math.hypot(out.x, out.z);
    if (xz < 0.18) {
      out.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
      return out;
    }
    // Camera aiming chooses the heading; the disc itself stays a chest-high wave.
    out.y = 0;
    return out.normalize();
  }

  private startCast() {
    const ctx = this.ctx!;
    this.aimAlongSight(_dir);
    this.seq = { kind: 'cast', phase: 'wind', t: 0, dir: _dir.clone(), fired: false };
    const orbs = this.orbs();
    if (orbs) orbs.castTarget = this.handLocal(_p).clone();
    ctx.power.boost(1.2);
    ctx.power.arcAt(['handL', 'handR', 'chest'], 2, 0.9, 0.12, 0.03);
    ctx.camera.addKick(-0.06);
    ctx.sound('zoe.field.charge');
    return true;
  }

  private fireDisc(seq: Extract<Sequence, { kind: 'cast' }>) {
    const ctx = this.ctx!;
    seq.fired = true;
    this.aimAlongSight(seq.dir);
    const origin = _p.copy(ctx.pos);
    origin.y = ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.15;
    origin.addScaledVector(seq.dir, 0.9);
    this.discs.spawn(origin, seq.dir, DISC_HIT);
    ctx.particles.emit(origin, ctx.spec.visual.electricityColor, 12, { speed: 7, size: 0.18, life: 0.28, direction: seq.dir });
    ctx.camera.addKick(0.22);
    ctx.camera.addShake(0.1);
    ctx.camera.addFovPunch(3);
    ctx.power.boost(1.5);
    ctx.sound('zoe.field.launch');
    const orbs = this.orbs();
    if (orbs) orbs.castTarget = null;
  }

  private updateCast(seq: Extract<Sequence, { kind: 'cast' }>, dt: number) {
    seq.t += dt;
    const orbs = this.orbs();
    if (seq.phase === 'wind') {
      if (orbs) {
        if (!orbs.castTarget) orbs.castTarget = new THREE.Vector3();
        this.handLocal(orbs.castTarget);
      }
      const p = Math.min(1, seq.t / CAST_WIND);
      this.poseState = { kind: 'cast', t: p * 0.4, weight: Math.min(1, p * 3) };
      this.bodyGlow = 0.2 * p;
      if (seq.t >= CAST_WIND) {
        this.fireDisc(seq);
        seq.phase = 'hold';
        seq.t = 0;
      }
    } else {
      const p = Math.min(1, seq.t / CAST_HOLD);
      this.poseState = { kind: 'cast', t: 0.4 + 0.6 * p, weight: p > 0.55 ? 1 - (p - 0.55) / 0.45 : 1 };
      this.bodyGlow = Math.max(0, 0.2 - p * 0.3);
      if (seq.t >= CAST_HOLD) {
        this.seq = null;
        this.poseState = null;
        this.bodyGlow = 0;
      }
    }
  }

  private discHit(target: KitTarget, disc: Disc) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    _dir.copy(disc.vel).setY(0);
    if (_dir.lengthSq() < 1e-4) _dir.subVectors(target.pos, ctx.pos).setY(0);
    _dir.normalize();
    ctx.hurt(target, disc.damage, _dir, 'heavy', 1.25);
    ctx.flash(target, electric, 0.22);
    _p.copy(target.pos).setY(1.15);
    ctx.particles.emit(_p, electric, 14, { speed: 7, size: 0.22, life: 0.3, direction: _dir });
    ctx.particles.emit(_p, this.cyanSoft, 6, { speed: 3, size: 0.32, life: 0.2 });
    ctx.rings.spawn(_p, electric, { radius: 1.6, duration: 0.26, y: 1.15 });
    ctx.camera.addShake(0.14);
    ctx.camera.addKick(0.12);
    ctx.hitStop(0.03);
    ctx.power.boost(1.3);
    ctx.sound('zoe.field.hit');
  }

  // ---------------------------------------------------------------------------
  // Heartbreak Blitz
  // ---------------------------------------------------------------------------

  private pickBlitzTargets() {
    const ctx = this.ctx!;
    const near = targetsInRadius(ctx.targets(), ctx.pos, BLITZ_SEEK, _hits).filter((t) => t.hp > 0);
    sortByDistance(near, ctx.pos);
    return near.slice(0, BLITZ_MAX_TARGETS);
  }

  private startBlitz() {
    const ctx = this.ctx!;
    if (this.lifting) this.endLift();
    const targets = this.pickBlitzTargets();
    const from = ctx.pos.clone();
    from.y = 0;
    const waypoints: THREE.Vector3[] = [from.clone()];
    ctx.lookDir(_dir);
    _dir.setY(0);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    _dir.normalize();
    if (targets.length) {
      for (const t of targets) {
        const side = waypoints.length % 2 === 0 ? 1 : -1;
        _q.set(-_dir.z, 0, _dir.x).multiplyScalar(side * 1.4);
        waypoints.push(new THREE.Vector3(t.pos.x, 0, t.pos.z).add(_q));
      }
    } else {
      waypoints.push(from.clone().addScaledVector(_dir, 6));
      waypoints.push(from.clone().addScaledVector(_dir, 11));
    }
    const land = waypoints[waypoints.length - 1].clone().addScaledVector(_dir, 2.4);
    for (let i = 0; i < 6 && ctx.blocked(land.x, land.z, ctx.radius + 0.15); i += 1) land.lerp(from, 0.18);
    waypoints.push(land.clone());
    this.seq = { kind: 'blitz', phase: 'launch', t: 0, waypoints, targets, fired: 0, burst: false, from, land };
    this.shell.want = 1;
    ctx.iframes(BLITZ_LAUNCH + 0.2);
    ctx.camera.addKick(0.18);
    ctx.camera.addFovPunch(8);
    ctx.power.boost(1.6);
    ctx.power.surge(0.4);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
    ctx.rings.spawn(_p, ctx.spec.visual.electricityColor, { radius: 2.2, duration: 0.34 });
    ctx.particles.emit(_p.setY(_p.y + 1), ctx.spec.visual.electricityColor, 18, { speed: 8, size: 0.22, life: 0.35, up: 1.4 });
    ctx.sound('zoe.blitz.launch');
    return true;
  }

  private alongPath(waypoints: THREE.Vector3[], u: number, out: THREE.Vector3) {
    if (waypoints.length === 1) return out.copy(waypoints[0]);
    const t = THREE.MathUtils.clamp(u, 0, 1) * (waypoints.length - 1);
    const i = Math.min(waypoints.length - 2, Math.floor(t));
    return out.copy(waypoints[i]).lerp(waypoints[i + 1], t - i);
  }

  private nextBombTarget(seq: Extract<Sequence, { kind: 'blitz' }>) {
    const live = seq.targets.filter((t) => t.hp > 0);
    if (!live.length) return null;
    return live[seq.fired % live.length];
  }

  private fireBomb(seq: Extract<Sequence, { kind: 'blitz' }>) {
    const ctx = this.ctx!;
    const orbs = this.orbs();
    if (orbs) orbs.worldPos(seq.fired % 3, _p);
    else _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air + 1.1);
    const target = this.nextBombTarget(seq);
    if (target) {
      _q.copy(target.pos).setY(ctx.heightAt(target.pos.x, target.pos.z) + 0.9);
    } else {
      ctx.lookDir(_dir);
      _q.copy(ctx.pos).addScaledVector(_dir, 3);
      _q.y = ctx.heightAt(_q.x, _q.z);
    }
    _dir.subVectors(_q, _p);
    const dist = _dir.length() || 1;
    _dir.multiplyScalar(BLITZ_BOMB_SPEED / dist);
    this.bombs.spawn(_p, _dir, BLITZ_BOMB_DAMAGE, Math.min(1.15, dist / BLITZ_BOMB_SPEED + 0.15));
    ctx.particles.emit(_p, ctx.spec.visual.electricityColor, 4, { speed: 4, size: 0.14, life: 0.18, direction: _dir });
    seq.fired += 1;
    ctx.sound('zoe.blitz.bomb');
  }

  private bombExplode(pos: THREE.Vector3, damage: number, direct: KitTarget | null) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    const hits = targetsInRadius(ctx.targets(), pos, BLITZ_BOMB_AOE, _hits);
    for (const target of [...hits]) {
      if (target.hp <= 0) continue;
      _dir.subVectors(target.pos, pos).setY(0);
      if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
      _dir.normalize();
      const mul = target === direct ? 1 : 0.7;
      ctx.hurt(target, damage * mul, _dir, 'knockback', 0.85);
      ctx.flash(target, electric, 0.16);
    }
    ctx.particles.emit(pos, electric, 12, { speed: 6, size: 0.2, life: 0.28, up: 0.7 });
    ctx.particles.emit(pos, this.cyanSoft, 5, { speed: 3, size: 0.28, life: 0.18, up: 0.4 });
    ctx.rings.spawn(pos, electric, { radius: 1.4, duration: 0.22, y: pos.y });
  }

  private finishBurst(seq: Extract<Sequence, { kind: 'blitz' }>) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    seq.burst = true;
    const hits = targetsInRadius(ctx.targets(), ctx.pos, BLITZ_BURST_RADIUS, _hits);
    let any = false;
    for (const target of [...hits]) {
      if (target.hp <= 0) continue;
      any = true;
      _dir.subVectors(target.pos, ctx.pos).setY(0);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
      _dir.normalize();
      ctx.hurt(target, BLITZ_BURST_DAMAGE, _dir, 'launch', 1.15);
      ctx.flash(target, electric, 0.24);
      _q.copy(target.pos).setY(1.1);
      ctx.particles.emit(_q, electric, 10, { speed: 8, size: 0.22, life: 0.3, direction: _dir });
    }
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + this.air * 0.4);
    ctx.rings.spawn(_p, electric, { radius: BLITZ_BURST_RADIUS, duration: 0.4, y: _p.y });
    ctx.particles.emit(_p, electric, 22, { speed: 9, size: 0.24, life: 0.4, up: 0.8 });
    ctx.particles.emit(_p, this.cyanSoft, 10, { speed: 4, size: 0.34, life: 0.22, up: 0.5 });
    ctx.camera.addShake(any ? 0.38 : 0.18);
    ctx.camera.addKick(0.22);
    if (any) ctx.hitStop(0.05);
    ctx.power.surge(0.55);
    ctx.sound(any ? 'zoe.blitz.burst' : 'zoe.blitz.burst.whiff');
  }

  private updateBlitz(seq: Extract<Sequence, { kind: 'blitz' }>, dt: number) {
    const ctx = this.ctx!;
    seq.t += dt;
    switch (seq.phase) {
      case 'launch': {
        const p = Math.min(1, seq.t / BLITZ_LAUNCH);
        const eased = 1 - (1 - p) * (1 - p) * (1 - p);
        this.air = BLITZ_HEIGHT * eased;
        this.poseState = { kind: 'launch', t: p, weight: Math.min(1, p * 4) };
        this.bodyGlow = 0.15 + 0.35 * p;
        if (seq.t >= BLITZ_LAUNCH) {
          seq.phase = 'run';
          seq.t = 0;
          ctx.iframes(BLITZ_RUN);
        }
        break;
      }
      case 'run': {
        const p = Math.min(1, seq.t / BLITZ_RUN);
        this.alongPath(seq.waypoints, p, _p);
        ctx.pos.x = _p.x;
        ctx.pos.z = _p.z;
        ctx.resolve(ctx.pos);
        this.air = BLITZ_HEIGHT + Math.sin(p * Math.PI * 2) * 0.28;
        this.poseState = { kind: 'flight', t: Math.min(1, p * 1.4), weight: 1 };
        this.bodyGlow = 0.4;
        const want = Math.floor(THREE.MathUtils.smootherstep(p, BLITZ_BOMB_FROM, BLITZ_BOMB_TO) * BLITZ_BOMBS);
        while (seq.fired < want && seq.fired < BLITZ_BOMBS) this.fireBomb(seq);
        this.imageT -= dt;
        if (this.imageT <= 0) {
          ctx.afterimages.spawn(0.22, 0.16);
          this.imageT = 0.09;
        }
        if (seq.t >= BLITZ_RUN) {
          seq.phase = 'finish';
          seq.t = 0;
        }
        break;
      }
      case 'finish': {
        const p = Math.min(1, seq.t / BLITZ_FINISH);
        const dash = Math.min(1, p / 0.45);
        ctx.lookDir(_dir);
        _dir.setY(0);
        if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
        _dir.normalize();
        ctx.pos.addScaledVector(_dir, BLITZ_DASH * dt * (1 - dash * 0.4));
        ctx.pos.lerp(seq.land, Math.min(1, dt * 3));
        ctx.resolve(ctx.pos);
        this.air = BLITZ_HEIGHT * (1 - p) * (1 - p);
        this.poseState = { kind: p < 0.45 ? 'flight' : 'land', t: p < 0.45 ? 1 : (p - 0.45) / 0.55, weight: 1 };
        this.bodyGlow = Math.max(0, 0.4 - p * 0.5);
        this.shell.want = p < 0.55 ? 1 : 0;
        if (!seq.burst && seq.t >= 0.12) this.finishBurst(seq);
        if (seq.t >= BLITZ_FINISH) {
          this.seq = null;
          this.poseState = null;
          this.air = 0;
          this.bodyGlow = 0;
          this.shell.want = 0;
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.9);
          ctx.particles.emit(_p, ctx.spec.visual.electricityColor, 16, { speed: 5, size: 0.18, life: 0.35, up: 0.8 });
          ctx.sound('zoe.blitz.land');
        }
        break;
      }
    }
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
        case 'lift':
          this.updateLift(this.seq, dt, frame);
          break;
        case 'float':
          this.updateFloat(this.seq, dt, frame);
          break;
        case 'cast':
          this.updateCast(this.seq, dt);
          break;
        case 'blitz':
          this.updateBlitz(this.seq, dt);
          break;
      }
    } else {
      this.poseState = null;
      this.bodyGlow = Math.max(0, this.bodyGlow - dt * 2);
    }

    this.driveOrbs(frame);
    this.shell.update(dt);
    this.discs.update(dt, {
      targets: ctx.targets(),
      camera: ctx.cameraObject,
      blocked: (x, z, r) => ctx.blocked(x, z, r),
      onHit: (target, disc) => this.discHit(target, disc),
      onFizzle: (pos) => {
        ctx.particles.emit(pos, ctx.spec.visual.electricityColor, 8, { speed: 4, size: 0.16, life: 0.22 });
      },
    });
    this.bombs.update(dt, {
      targets: ctx.targets(),
      camera: ctx.cameraObject,
      heightAt: (x, z) => ctx.heightAt(x, z),
      blocked: (x, z, r) => ctx.blocked(x, z, r),
      onExplode: (pos, damage, direct) => this.bombExplode(pos, damage, direct),
    });
  }
}
