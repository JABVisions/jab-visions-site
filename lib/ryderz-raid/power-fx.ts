import * as THREE from 'three';
import type { ParticleSystem } from './particles';
import { TrailRibbon } from './speed-vfx';

/**
 * The things a tree-earned power actually puts in the street: shaped
 * projectiles (darts, blades, bullets, stars...), sprays of them, waves,
 * pillars, flashes and the bindings a snare wraps around each held body.
 * `progression/power-looks.ts` says which of these each Ryder's powers use;
 * the engine owns damage and calls in here for what the player sees.
 */

export type ShotShape = 'dart' | 'blade' | 'shard' | 'orb' | 'spine' | 'star' | 'bullet' | 'droplet' | 'stone' | 'bolt' | 'sliver';
export type BindStyle = 'pins' | 'threads' | 'hands' | 'cage' | 'roots' | 'clock' | 'spotlight' | 'current' | 'cuffs' | 'ward';
export type WaveStyle = 'shock' | 'water' | 'shadow' | 'blight';
export type PillarStyle = 'column' | 'slash' | 'spotlight' | 'geyser' | 'spikes';
export type AuraStyle = 'flame' | 'spark' | 'bubble' | 'smoke' | 'star' | 'tick';

export const SHOT_SHAPES: ShotShape[] = ['dart', 'blade', 'shard', 'orb', 'spine', 'star', 'bullet', 'droplet', 'stone', 'bolt', 'sliver'];
export const BIND_STYLES: BindStyle[] = ['pins', 'threads', 'hands', 'cage', 'roots', 'clock', 'spotlight', 'current', 'cuffs', 'ward'];
export const WAVE_STYLES: WaveStyle[] = ['shock', 'water', 'shadow', 'blight'];
export const PILLAR_STYLES: PillarStyle[] = ['column', 'slash', 'spotlight', 'geyser', 'spikes'];

export interface FxTarget {
  pos: THREE.Vector3;
  hp: number;
  radius: number;
}

// --- Shared geometry. Every projectile flies down its local +Z. -------------

const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

function starShape(outer: number, inner: number, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(shape);
}

const GEO = {
  dartShaft: new THREE.CylinderGeometry(0.014, 0.018, 0.56, 5).rotateX(Math.PI / 2),
  dartTip: new THREE.ConeGeometry(0.05, 0.2, 6).rotateX(Math.PI / 2).translate(0, 0, 0.36),
  dartFletch: new THREE.PlaneGeometry(0.11, 0.16).rotateX(Math.PI / 2).translate(0, 0, -0.24),
  blade: new THREE.TorusGeometry(0.34, 0.05, 4, 18, Math.PI * 1.1).rotateX(-Math.PI / 2),
  bladeCore: new THREE.TorusGeometry(0.34, 0.018, 3, 18, Math.PI * 1.1).rotateX(-Math.PI / 2),
  shard: new THREE.OctahedronGeometry(0.1).scale(0.75, 0.75, 3.4),
  orbCore: new THREE.SphereGeometry(0.11, 10, 8),
  orbHalo: new THREE.SphereGeometry(0.24, 12, 10),
  spine: new THREE.ConeGeometry(0.04, 0.72, 5).rotateX(Math.PI / 2),
  spineTip: new THREE.ConeGeometry(0.045, 0.16, 5).rotateX(Math.PI / 2).translate(0, 0, 0.36),
  star: starShape(0.24, 0.1),
  starCore: starShape(0.12, 0.05),
  bullet: new THREE.CapsuleGeometry(0.032, 0.1, 3, 6).rotateX(Math.PI / 2),
  tracer: new THREE.CylinderGeometry(0.01, 0.034, 1.2, 5).rotateX(Math.PI / 2).translate(0, 0, -0.62),
  droplet: new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1, 1.5),
  dropletTail: new THREE.ConeGeometry(0.1, 0.46, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.3),
  stone: new THREE.DodecahedronGeometry(0.13),
  bolt: new THREE.OctahedronGeometry(0.11).scale(0.8, 0.8, 3.8),
  sliverHand: new THREE.BoxGeometry(0.03, 0.09, 0.62),
  sliverRing: new THREE.TorusGeometry(0.12, 0.016, 4, 20).translate(0, 0, -0.26),
  // Effects
  beam: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0),
  rod: new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, 0.5, 0),
  claw: new THREE.ConeGeometry(0.075, 0.95, 5).translate(0, 0.475, 0),
  root: new THREE.ConeGeometry(0.09, 1.15, 5).translate(0, 0.575, 0),
  spike: new THREE.ConeGeometry(0.16, 1.4, 5).translate(0, 0.7, 0),
  column: new THREE.CylinderGeometry(0.5, 0.72, 3.4, 16, 1, true).translate(0, 1.7, 0),
  cone: new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0),
  disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2),
  arc: new THREE.TorusGeometry(1, 0.05, 5, 32, Math.PI * 1.3).rotateX(Math.PI / 2),
  slash: new THREE.TorusGeometry(1.3, 0.09, 4, 26, Math.PI).rotateY(Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  tick: new THREE.BoxGeometry(0.05, 0.02, 0.18),
  cuff: new THREE.TorusGeometry(0.15, 0.03, 5, 16).rotateX(Math.PI / 2),
};

function basic(color: THREE.ColorRepresentation, glow = 1) {
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide });
  material.color.multiplyScalar(glow);
  return material;
}

function additive(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function solid(color: THREE.ColorRepresentation) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 1 });
}

interface ShotSpinSpec {
  axis: 'x' | 'y' | 'z' | null;
  rate: number;
  trail: number;
}

const SPIN: Record<ShotShape, ShotSpinSpec> = {
  dart: { axis: 'z', rate: 9, trail: 0.05 },
  blade: { axis: 'y', rate: 26, trail: 0.12 },
  shard: { axis: 'z', rate: 7, trail: 0.07 },
  orb: { axis: null, rate: 0, trail: 0.16 },
  spine: { axis: 'z', rate: 5, trail: 0.05 },
  star: { axis: 'z', rate: 14, trail: 0.1 },
  bullet: { axis: null, rate: 0, trail: 0.03 },
  droplet: { axis: null, rate: 0, trail: 0.14 },
  stone: { axis: 'x', rate: 11, trail: 0.08 },
  bolt: { axis: 'z', rate: 4, trail: 0.12 },
  sliver: { axis: 'z', rate: 18, trail: 0.06 },
};

/** Builds one projectile model. Exported for the check script. */
export function buildShot(shape: ShotShape, color: THREE.ColorRepresentation): THREE.Group {
  const root = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  };
  switch (shape) {
    case 'dart': {
      add(GEO.dartShaft, basic(0xf4fff6));
      add(GEO.dartTip, basic(color, 1.6));
      const fin = basic(color, 1.2);
      add(GEO.dartFletch, fin);
      add(GEO.dartFletch, fin).rotation.z = Math.PI / 2;
      break;
    }
    case 'blade':
      add(GEO.blade, basic(color, 1.7));
      add(GEO.bladeCore, basic(0xffffff));
      break;
    case 'shard':
      add(GEO.shard, basic(color, 1.4));
      add(GEO.orbCore, additive(color, 0.5)).scale.setScalar(1.4);
      break;
    case 'orb':
      add(GEO.orbCore, basic(0xffffff));
      add(GEO.orbHalo, additive(color, 0.6));
      break;
    case 'spine':
      add(GEO.spine, basic(0xeae4c8));
      add(GEO.spineTip, basic(color, 1.6));
      break;
    case 'star':
      add(GEO.star, basic(color, 1.6));
      add(GEO.starCore, basic(0xffffff)).position.z = 0.01;
      break;
    case 'bullet':
      add(GEO.bullet, basic(0xd8b15a));
      add(GEO.tracer, additive(color, 0.85));
      break;
    case 'droplet':
      add(GEO.droplet, additive(color, 0.9));
      add(GEO.dropletTail, additive(0xe8fbff, 0.45));
      break;
    case 'stone':
      add(GEO.stone, basic(color, 1.15));
      add(GEO.orbHalo, additive(color, 0.35));
      break;
    case 'bolt':
      add(GEO.bolt, basic(color, 1.8));
      add(GEO.orbHalo, additive(color, 0.4)).scale.set(0.8, 0.8, 2.2);
      break;
    case 'sliver':
      add(GEO.sliverHand, basic(color, 1.6));
      add(GEO.sliverRing, basic(0xffffff));
      break;
  }
  return root;
}

// --- Projectiles ------------------------------------------------------------

export interface ShotInstance {
  key: string;
  shape: ShotShape;
  root: THREE.Group;
  trail: TrailRibbon;
  spin: number;
}

interface Flyer {
  shot: ShotInstance;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Stops and sticks into the floor at the end of its flight. */
  pin: boolean;
}

interface Stuck {
  shot: ShotInstance;
  target: FxTarget;
  offset: THREE.Vector3;
  dir: THREE.Vector3;
  life: number;
  color: number;
}

// --- Timed effects -------------------------------------------------------------

interface Timed {
  root: THREE.Object3D;
  age: number;
  life: number;
  materials: THREE.MeshBasicMaterial[];
  base: number[];
  step(fx: Timed, k: number, dt: number): void;
  /** Followed body for bindings and auras. */
  follow?: { pos: THREE.Vector3; hp?: number };
  dispose?: boolean;
}

const _spin = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export class PowerFx {
  readonly group = new THREE.Group();
  private pools = new Map<string, ShotInstance[]>();
  private live = new Set<ShotInstance>();
  private trails: TrailRibbon[] = [];
  private flyers: Flyer[] = [];
  private stuck: Stuck[] = [];
  private timed: Timed[] = [];
  private light = new THREE.PointLight(0xffffff, 0, 16, 2);
  private lightT = 0;
  private lightPeak = 0;
  private time = 0;

  constructor(
    private particles: ParticleSystem,
    private floor: (x: number, z: number) => number,
  ) {
    this.group.name = 'PowerFx';
    this.light.position.set(0, -50, 0);
    this.group.add(this.light);
  }

  setFloor(floor: (x: number, z: number) => number) {
    this.floor = floor;
  }

  // --- Projectiles -----------------------------------------------------------

  acquireShot(shape: ShotShape, color: number, scale = 1): ShotInstance {
    const key = `${shape}:${color}`;
    const pooled = this.pools.get(key)?.pop();
    const shot = pooled ?? this.makeShot(key, shape, color);
    shot.root.visible = true;
    shot.root.scale.setScalar(scale);
    shot.trail.intensity = 0.9 * Math.sqrt(scale);
    shot.trail.clear();
    shot.spin = Math.random() * Math.PI * 2;
    this.live.add(shot);
    return shot;
  }

  private makeShot(key: string, shape: ShotShape, color: number): ShotInstance {
    const root = buildShot(shape, color);
    root.visible = false;
    const trail = new TrailRibbon(color, { life: 0.18, width: SPIN[shape].trail, spacing: 0.08, points: 10 });
    trail.intensity = 0.9;
    this.group.add(root, trail.mesh);
    this.trails.push(trail);
    return { key, shape, root, trail, spin: 0 };
  }

  /** Place a flying shot down its velocity, spinning on its own axis, and grow its trail. */
  placeShot(shot: ShotInstance, pos: THREE.Vector3, vel: THREE.Vector3, dt: number) {
    shot.root.position.copy(pos);
    if (vel.lengthSq() > 1e-6) shot.root.quaternion.setFromUnitVectors(Z, _v.copy(vel).normalize());
    const spin = SPIN[shot.shape];
    if (spin.axis) {
      shot.spin += spin.rate * dt;
      shot.root.quaternion.multiply(_spin.setFromAxisAngle(AXES[spin.axis], shot.spin));
    }
    shot.trail.feed(pos);
  }

  releaseShot(shot: ShotInstance) {
    if (!this.live.delete(shot)) return;
    shot.root.visible = false;
    let pool = this.pools.get(shot.key);
    if (!pool) {
      pool = [];
      this.pools.set(shot.key, pool);
    }
    pool.push(shot);
  }

  /** Cosmetic shots fanned around `yaw` (an arc of `arc` radians), flying `range` metres. */
  spray(origin: THREE.Vector3, yaw: number, arc: number, shape: ShotShape, color: number, count: number, range: number, speed = 26, pin = false) {
    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? i / (count - 1) - 0.5 : 0;
      const a = yaw + t * arc + (Math.random() - 0.5) * 0.08;
      const vel = new THREE.Vector3(Math.sin(a), pin ? -0.18 : (Math.random() - 0.4) * 0.12, Math.cos(a)).normalize().multiplyScalar(speed * (0.9 + Math.random() * 0.2));
      const shot = this.acquireShot(shape, color);
      this.flyers.push({ shot, pos: origin.clone(), vel, life: range / speed, pin });
    }
  }

  /** Every direction at once. */
  radial(origin: THREE.Vector3, shape: ShotShape, color: number, count: number, range: number, speed = 24) {
    this.spray(origin, Math.random() * Math.PI * 2, Math.PI * 2 * (1 - 1 / Math.max(1, count)), shape, color, count, range, speed);
  }

  /** A shot left standing in a body until `detonateStuck` sets it off. */
  stick(target: FxTarget, shape: ShotShape, color: number, from: THREE.Vector3) {
    const shot = this.acquireShot(shape, color);
    const dir = _v.set(target.pos.x - from.x, 0, target.pos.z - from.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const side = (Math.random() - 0.5) * 0.5;
    const offset = new THREE.Vector3(-dir.x * target.radius * 0.6 + dir.z * side, 0.85 + Math.random() * 0.6, -dir.z * target.radius * 0.6 - dir.x * side);
    this.stuck.push({ shot, target, offset, dir: dir.clone().setY(-0.25).normalize(), life: 8, color });
  }

  /** Sets off every stuck shot and returns the bodies they were in. */
  detonateStuck(): FxTarget[] {
    const hit = new Set<FxTarget>();
    for (const s of this.stuck) {
      _v.copy(s.target.pos).add(s.offset);
      this.flash(_v, s.color, 0.9, 0.22);
      this.particles.emit(_v, s.color, 10, { speed: 7, size: 0.22, life: 0.3 });
      if (s.target.hp > 0) hit.add(s.target);
      this.releaseShot(s.shot);
    }
    this.stuck = [];
    return [...hit];
  }

  // --- Ground and air effects ---------------------------------------------------

  private push(fx: Omit<Timed, 'age' | 'base'>) {
    const entry: Timed = { ...fx, age: 0, base: fx.materials.map((m) => m.opacity) };
    this.group.add(entry.root);
    this.timed.push(entry);
    entry.step(entry, 0, 0);
    return entry;
  }

  private ground(pos: THREE.Vector3) {
    return this.floor(pos.x, pos.z) + 0.04;
  }

  /** An expanding ring wave from `pos` out to `radius`. */
  wave(pos: THREE.Vector3, style: WaveStyle, color: number, radius: number) {
    const root = new THREE.Group();
    root.position.set(pos.x, this.ground(pos), pos.z);
    const materials: THREE.MeshBasicMaterial[] = [];
    const ringMat = style === 'shadow' ? solid(0x1a0d2e) : additive(style === 'water' ? 0xe8fbff : color, 0.9);
    const rimMat = additive(color, style === 'blight' ? 0.55 : 0.75);
    materials.push(ringMat, rimMat);
    const torus = new THREE.Mesh(GEO.torus, ringMat);
    const rim = new THREE.Mesh(style === 'blight' ? GEO.disc : GEO.torus, rimMat);
    root.add(torus, rim);
    const tall = style === 'water' ? 7 : style === 'shadow' ? 5 : 2.2;
    this.push({
      root,
      life: style === 'blight' ? 0.9 : 0.6,
      materials,
      step: (fx, k) => {
        const ease = 1 - (1 - k) * (1 - k);
        const r = 0.4 + (radius - 0.4) * ease;
        torus.scale.set(r, tall * (1 - k * 0.6), r);
        torus.position.y = 0.05 + (style === 'water' ? 0.25 * (1 - k) : 0);
        if (style === 'blight') rim.scale.set(r, 1, r);
        else rim.scale.set(r * 1.04, 1.4, r * 1.04);
        fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * (1 - k)));
      },
    });
    if (style === 'water') {
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * Math.PI * 2;
        _w.set(pos.x + Math.sin(a) * 0.8, this.ground(pos) + 0.3, pos.z + Math.cos(a) * 0.8);
        this.particles.emit(_w, 0xe8fbff, 2, { speed: 9, size: 0.3, life: 0.6, up: 1.6, gravity: 14, direction: _v.set(Math.sin(a), 0.6, Math.cos(a)) });
      }
    }
  }

  /** A blinding burst of light. */
  flash(pos: THREE.Vector3, color: number, radius: number, life = 0.32) {
    const material = additive(color, 1);
    const core = additive(0xffffff, 1);
    const root = new THREE.Group();
    root.position.copy(pos);
    const shell = new THREE.Mesh(GEO.sphere, material);
    const hot = new THREE.Mesh(GEO.sphere, core);
    root.add(shell, hot);
    this.push({
      root,
      life,
      materials: [material, core],
      step: (fx, k) => {
        const r = 0.2 + radius * (1 - (1 - k) * (1 - k));
        shell.scale.setScalar(r);
        hot.scale.setScalar(r * 0.45 * (1 - k));
        fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * (1 - k) * (1 - k)));
      },
    });
    if (radius > 1.5 || this.lightT <= 0) {
      this.light.color.setHex(color);
      this.light.position.copy(pos);
      this.light.distance = radius * 5;
      this.lightPeak = Math.min(60, 8 + radius * 6);
      this.lightT = life;
    }
  }

  /** A charged field drawing in on `pos` before a release. */
  implode(pos: THREE.Vector3, color: number, radius: number, life: number) {
    const shellMat = additive(color, 0.35);
    const ringMat = additive(color, 0.9);
    const root = new THREE.Group();
    root.position.set(pos.x, this.ground(pos), pos.z);
    const shell = new THREE.Mesh(GEO.sphere, shellMat);
    shell.position.y = 1;
    const ring = new THREE.Mesh(GEO.torus, ringMat);
    root.add(shell, ring);
    this.push({
      root,
      life,
      materials: [shellMat, ringMat],
      step: (fx, k, dt) => {
        const r = radius * (1 - k * 0.9);
        shell.scale.setScalar(r);
        ring.scale.set(r, 1, r);
        fx.materials[0].opacity = fx.base[0] * (0.3 + k);
        fx.materials[1].opacity = fx.base[1] * (0.4 + k * 0.6);
        if (dt > 0 && Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          _w.set(pos.x + Math.sin(a) * r, this.ground(pos) + 0.5 + Math.random() * 1.4, pos.z + Math.cos(a) * r);
          this.particles.emit(_w, color, 1, { speed: r * 2.5, size: 0.24, life: 0.3, direction: _v.set(-Math.sin(a), 0, -Math.cos(a)), spread: 0.1 });
        }
      },
    });
  }

  /** Spiral arcs whirling in on `pos`. */
  vortex(pos: THREE.Vector3, color: number, radius: number, life: number) {
    const root = new THREE.Group();
    root.position.set(pos.x, this.ground(pos), pos.z);
    const materials: THREE.MeshBasicMaterial[] = [];
    const arcs: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i += 1) {
      const m = additive(i % 2 ? 0xffffff : color, 0.8);
      materials.push(m);
      const arc = new THREE.Mesh(GEO.arc, m);
      arc.position.y = 0.15 + i * 0.35;
      arc.rotation.y = (i * Math.PI) / 2;
      arcs.push(arc);
      root.add(arc);
    }
    this.push({
      root,
      life,
      materials,
      step: (fx, k, dt) => {
        arcs.forEach((arc, i) => {
          const r = radius * (1 - k * 0.75) * (1 - i * 0.12);
          arc.scale.set(r, 3, r);
          arc.rotation.y -= dt * (7 + i * 2);
        });
        fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * Math.min(1, (1 - k) * 2.5)));
      },
    });
  }

  /** A power rising out of the street at `pos`, turned toward `yaw`. */
  pillar(pos: THREE.Vector3, style: PillarStyle, color: number, yaw: number, size = 1) {
    const root = new THREE.Group();
    root.position.set(pos.x, this.ground(pos), pos.z);
    root.rotation.y = yaw;
    const materials: THREE.MeshBasicMaterial[] = [];
    const parts: THREE.Mesh[] = [];
    const add = (geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial) => {
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      root.add(mesh);
      parts.push(mesh);
      return mesh;
    };
    let life = 0.7;
    let step: Timed['step'];
    switch (style) {
      case 'column':
      case 'geyser': {
        const water = style === 'geyser';
        const shell = add(GEO.column, additive(water ? 0xe8fbff : color, 0.75));
        const core = add(GEO.column, water ? additive(color, 0.8) : solid(0x150a26));
        core.scale.set(0.6, 1, 0.6);
        step = (fx, k) => {
          const rise = Math.min(1, k * 5);
          shell.scale.set(size * (1 + k * 0.4), size * rise, size * (1 + k * 0.4));
          core.scale.set(size * 0.6, size * rise * 0.92, size * 0.6);
          fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * (1 - k)));
        };
        if (water) this.particles.emit(_w.set(pos.x, this.ground(pos) + 3, pos.z), 0xe8fbff, 26, { speed: 6, size: 0.32, life: 0.8, up: 2, gravity: 16 });
        break;
      }
      case 'slash': {
        const arc = add(GEO.slash, basic(color, 1.8));
        const core = add(GEO.slash, basic(0xffffff));
        core.scale.setScalar(0.96);
        arc.material.transparent = true;
        core.material.transparent = true;
        life = 0.45;
        step = (fx, k) => {
          const y = 0.2 + k * 1.8;
          arc.position.set(0, y, 0.9);
          core.position.set(0, y, 0.9);
          arc.scale.setScalar(size * (0.8 + k * 0.5));
          core.scale.setScalar(size * (0.78 + k * 0.5));
          fx.materials.forEach((m) => (m.opacity = 1 - k * k));
        };
        break;
      }
      case 'spotlight': {
        const cone = add(GEO.cone, additive(0xfff2fa, 0.32));
        const pool = add(GEO.disc, additive(color, 0.8));
        life = 0.9;
        step = (fx, k) => {
          cone.position.y = 7;
          cone.scale.set(1.3 * size, 7, 1.3 * size);
          pool.scale.setScalar(1.3 * size * (1 + k * 0.2));
          pool.position.y = 0.02;
          const a = Math.min(1, k * 8) * (1 - k);
          fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * a * 1.4));
        };
        break;
      }
      case 'spikes': {
        const count = 10;
        for (let i = 0; i < count; i += 1) {
          const spike = add(GEO.spike, i % 2 ? basic(color, 1.3) : solid(0x3b4a16));
          const a = (i / count) * Math.PI * 2;
          const r = 0.9 + (i % 3) * 0.55;
          spike.position.set(Math.sin(a) * r * size, 0, Math.cos(a) * r * size);
          spike.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
        }
        life = 0.8;
        step = (fx, k) => {
          const rise = Math.min(1, k * 6);
          const fall = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
          parts.forEach((p, i) => p.scale.set(1, rise * fall * (0.7 + (i % 3) * 0.25) * size, 1));
        };
        break;
      }
    }
    this.push({ root, life, materials, step: step! });
  }

  /** A bright line along a dash. */
  streak(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const material = additive(color, 0.9);
    const length = from.distanceTo(to);
    if (length < 0.2) return;
    const mesh = new THREE.Mesh(GEO.rod, material);
    mesh.position.copy(from).setY(from.y + 1);
    mesh.quaternion.setFromUnitVectors(UP, _v.subVectors(to, from).normalize());
    this.push({
      root: mesh,
      life: 0.32,
      materials: [material],
      step: (fx, k) => {
        mesh.scale.set(4 * (1 - k) + 0.5, length, 4 * (1 - k) + 0.5);
        material.opacity = fx.base[0] * (1 - k);
      },
    });
  }

  // --- Bindings and auras --------------------------------------------------------

  /** Wraps a held body in the snare's binding for `duration` seconds. */
  bind(target: FxTarget, style: BindStyle, color: number, duration: number) {
    const root = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];
    const parts: THREE.Object3D[] = [];
    const r = Math.max(0.45, target.radius);
    const add = (geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, parent: THREE.Object3D = root) => {
      if (!materials.includes(material)) materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      parent.add(mesh);
      parts.push(mesh);
      return mesh;
    };
    let animate: (k: number, rise: number, dt: number) => void = () => undefined;
    switch (style) {
      case 'pins': {
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          const dart = buildShot('dart', color);
          dart.position.set(Math.sin(a) * r * 0.75, 0.16, Math.cos(a) * r * 0.75);
          dart.quaternion.setFromUnitVectors(Z, _v.set(-Math.sin(a) * 0.35, -1, -Math.cos(a) * 0.35).normalize());
          dart.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
            if (m && !materials.includes(m)) {
              m.transparent = true;
              materials.push(m);
            }
          });
          root.add(dart);
          parts.push(dart);
        }
        const glowRing = add(GEO.ring, additive(color, 0.6));
        glowRing.scale.setScalar(r * 0.9);
        animate = (_k, rise) => {
          parts.forEach((p, i) => {
            if (i < 6) p.position.y = 0.16 + (1 - rise) * 1.4;
          });
        };
        break;
      }
      case 'threads': {
        const thread = additive(color, 0.95);
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const from = new THREE.Vector3(Math.sin(a) * 0.12, 0.6 + (i % 3) * 0.35, Math.cos(a) * 0.12);
          const to = new THREE.Vector3(Math.sin(a) * (r + 1.1), 0, Math.cos(a) * (r + 1.1));
          const rod = add(GEO.rod, thread);
          rod.position.copy(to);
          rod.quaternion.setFromUnitVectors(UP, _v.subVectors(from, to).normalize());
          rod.userData.len = from.distanceTo(to);
          rod.scale.set(0.5, 0.01, 0.5);
        }
        animate = (_k, rise) => parts.forEach((p) => p.scale.set(0.5, p.userData.len * rise, 0.5));
        break;
      }
      case 'hands': {
        const dark = solid(0x120a20);
        const edge = additive(color, 0.75);
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          const hand = new THREE.Group();
          hand.position.set(Math.sin(a) * r * 0.9, 0, Math.cos(a) * r * 0.9);
          hand.rotation.set(-Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
          for (let f = -1; f <= 1; f += 1) {
            const claw = add(GEO.claw, dark, hand);
            claw.position.x = f * 0.07;
            claw.rotation.z = f * 0.18;
            const rim = add(GEO.claw, edge, hand);
            rim.position.x = f * 0.07;
            rim.rotation.z = f * 0.18;
            rim.scale.setScalar(1.18);
          }
          root.add(hand);
        }
        animate = (_k, rise) => root.children.forEach((hand, i) => (hand.position.y = -1 + rise + Math.sin(this.time * 9 + i) * 0.03));
        break;
      }
      case 'cage': {
        const bar = additive(color, 0.9);
        for (let i = 0; i < 3; i += 1) {
          const ring = add(GEO.torus, bar);
          ring.position.y = 0.3 + i * 0.7;
          ring.scale.set(r + 0.3, 1, r + 0.3);
        }
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          const rod = add(GEO.rod, bar);
          rod.position.set(Math.sin(a) * (r + 0.3), 0, Math.cos(a) * (r + 0.3));
          rod.scale.set(0.6, 1.8, 0.6);
        }
        animate = (_k, rise, dt) => {
          parts.forEach((p, i) => {
            if (i < 3) {
              p.rotation.y += dt * (i % 2 ? -3 : 3);
              p.scale.set((r + 0.3) * (2 - rise), 1, (r + 0.3) * (2 - rise));
            } else p.scale.y = 1.8 * rise;
          });
        };
        break;
      }
      case 'roots': {
        const bark = solid(0x4a3a1c);
        const vein = basic(color, 1.2);
        vein.transparent = true;
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
          const root2 = add(GEO.root, i % 3 === 0 ? vein : bark);
          root2.position.set(Math.sin(a) * (r + 0.15), -0.1, Math.cos(a) * (r + 0.15));
          root2.rotation.set(-Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
        }
        animate = (_k, rise) => parts.forEach((p, i) => p.scale.set(1, rise * (0.8 + (i % 3) * 0.2), 1));
        break;
      }
      case 'clock': {
        const face = additive(color, 0.75);
        const bubble = additive(color, 0.16);
        const dial = add(GEO.ring, face);
        dial.scale.setScalar(r + 0.45);
        dial.position.y = 0.03;
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2;
          const tick = add(GEO.tick, face);
          tick.position.set(Math.sin(a) * (r + 0.25), 0.04, Math.cos(a) * (r + 0.25));
          tick.rotation.y = a;
        }
        const hand = add(GEO.tick, face);
        hand.scale.set(1, 1, (r + 0.2) / 0.18);
        hand.position.y = 0.05;
        const sphere = add(GEO.sphere, bubble);
        sphere.position.y = 0.95;
        animate = (_k, rise, dt) => {
          hand.rotation.y -= dt * 0.6;
          hand.position.set(Math.sin(hand.rotation.y) * (r + 0.2) * 0.5, 0.05, Math.cos(hand.rotation.y) * (r + 0.2) * 0.5);
          sphere.scale.setScalar((r + 0.55) * rise);
        };
        break;
      }
      case 'spotlight': {
        const cone = add(GEO.cone, additive(0xfff2fa, 0.22));
        cone.position.y = 6.5;
        cone.scale.set(r + 0.4, 6.5, r + 0.4);
        const pool = add(GEO.disc, additive(color, 0.55));
        pool.scale.setScalar(r + 0.4);
        pool.position.y = 0.03;
        animate = (_k, rise) => {
          cone.scale.set((r + 0.4) * rise, 6.5, (r + 0.4) * rise);
        };
        break;
      }
      case 'current': {
        const foam = additive(0xe8fbff, 0.8);
        const water = additive(color, 0.85);
        for (let i = 0; i < 3; i += 1) {
          const arc = add(GEO.arc, i === 1 ? foam : water);
          arc.position.y = 0.15 + i * 0.32;
          arc.scale.set(r + 0.3 - i * 0.06, 2.5, r + 0.3 - i * 0.06);
        }
        animate = (_k, rise, dt) => {
          parts.forEach((p, i) => {
            p.rotation.y += dt * (6 + i * 1.5);
            p.position.y = (0.15 + i * 0.32) * rise;
          });
        };
        break;
      }
      case 'cuffs': {
        const steel = basic(0xaab3bd);
        steel.transparent = true;
        const glowMat = additive(color, 0.8);
        const left = add(GEO.cuff, steel);
        left.position.set(-0.14, 0.14, 0);
        const right = add(GEO.cuff, steel);
        right.position.set(0.14, 0.14, 0);
        const wrists = add(GEO.cuff, glowMat);
        wrists.position.y = 1.0;
        wrists.scale.setScalar(2.2);
        const chain = add(GEO.rod, glowMat);
        chain.position.set(0, 0.02, 0);
        chain.rotation.z = Math.PI / 2.4;
        chain.scale.set(0.5, 1.3, 0.5);
        animate = (_k, rise) => {
          wrists.scale.setScalar(2.2 * (2 - rise));
        };
        break;
      }
      case 'ward': {
        const gold = additive(color, 0.85);
        const base = add(GEO.ring, gold);
        base.scale.setScalar(r + 0.5);
        base.position.y = 0.03;
        const crown = add(GEO.torus, gold);
        crown.scale.set(r + 0.5, 1, r + 0.5);
        crown.position.y = 1.6;
        for (let i = 0; i < 4; i += 1) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const post = add(GEO.rod, gold);
          post.position.set(Math.sin(a) * (r + 0.5), 0, Math.cos(a) * (r + 0.5));
          post.scale.set(1.4, 1.6, 1.4);
        }
        animate = (_k, rise) => {
          crown.position.y = 1.6 * rise;
          parts.forEach((p, i) => {
            if (i >= 2) p.scale.y = 1.6 * rise;
          });
        };
        break;
      }
    }
    const fade = Math.min(0.35, duration * 0.3);
    this.push({
      root,
      life: duration,
      materials,
      follow: target,
      step: (fx, k, dt) => {
        const age = k * duration;
        const rise = Math.min(1, age / 0.22);
        const left = duration - age;
        const alpha = Math.min(1, left / fade);
        animate(k, rise, dt);
        fx.materials.forEach((m, i) => (m.opacity = fx.base[i] * alpha));
      },
    });
  }

  /** The surge's ring at the Ryder's feet for as long as the tempo lasts. */
  aura(anchor: THREE.Vector3, color: number, duration: number) {
    this.timed = this.timed.filter((fx) => {
      if (fx.root.name !== 'SurgeAura') return true;
      this.drop(fx);
      return false;
    });
    const root = new THREE.Group();
    root.name = 'SurgeAura';
    const ringMat = additive(color, 0.7);
    const bandMat = additive(color, 0.55);
    const ring = new THREE.Mesh(GEO.ring, ringMat);
    ring.scale.setScalar(0.85);
    const band = new THREE.Mesh(GEO.arc, bandMat);
    band.scale.set(0.55, 1.6, 0.55);
    band.position.y = 1.05;
    root.add(ring, band);
    this.push({
      root,
      life: duration,
      materials: [ringMat, bandMat],
      follow: { pos: anchor },
      step: (fx, k, dt) => {
        ring.rotation.y += dt * 4;
        band.rotation.y -= dt * 7;
        band.position.y = 1.05 + Math.sin(this.time * 3) * 0.35;
        const pulse = 0.75 + Math.sin(this.time * 10) * 0.25;
        const tail = Math.min(1, (1 - k) * duration * 2);
        fx.materials[0].opacity = fx.base[0] * pulse * tail;
        fx.materials[1].opacity = fx.base[1] * pulse * tail;
      },
    });
  }

  // --- Frame -------------------------------------------------------------------

  update(dt: number, camera: THREE.Camera) {
    this.time += dt;
    for (let i = this.flyers.length - 1; i >= 0; i -= 1) {
      const f = this.flyers[i];
      f.life -= dt;
      f.pos.addScaledVector(f.vel, dt);
      const floor = this.floor(f.pos.x, f.pos.z);
      if (f.life <= 0 || f.pos.y < floor + 0.05) {
        if (f.pin && f.pos.y > floor - 1) {
          // Planted: the shot stands in the pavement a moment before it goes.
          f.pos.y = Math.max(f.pos.y, floor + 0.08);
          f.vel.set(0, 0, 0);
          f.pin = false;
          f.life = 0.8;
          continue;
        }
        this.particles.emit(f.pos, 0xffffff, 2, { speed: 3, size: 0.14, life: 0.18 });
        this.releaseShot(f.shot);
        this.flyers.splice(i, 1);
        continue;
      }
      if (f.vel.lengthSq() > 0) this.placeShot(f.shot, f.pos, f.vel, dt);
    }
    for (let i = this.stuck.length - 1; i >= 0; i -= 1) {
      const s = this.stuck[i];
      s.life -= dt;
      if (s.life <= 0 || s.target.hp <= 0) {
        this.releaseShot(s.shot);
        this.stuck.splice(i, 1);
        continue;
      }
      s.shot.root.position.copy(s.target.pos).add(s.offset);
      s.shot.root.quaternion.setFromUnitVectors(Z, s.dir);
    }
    for (let i = this.timed.length - 1; i >= 0; i -= 1) {
      const fx = this.timed[i];
      fx.age += dt;
      const gone = fx.follow?.hp !== undefined && fx.follow.hp <= 0;
      if (fx.age >= fx.life || gone) {
        this.drop(fx);
        this.timed.splice(i, 1);
        continue;
      }
      if (fx.follow) fx.root.position.set(fx.follow.pos.x, this.floor(fx.follow.pos.x, fx.follow.pos.z) + 0.03, fx.follow.pos.z);
      fx.step(fx, fx.age / fx.life, dt);
    }
    for (const trail of this.trails) trail.update(dt, camera);
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt);
      this.light.intensity = this.lightPeak * (this.lightT > 0 ? this.lightT / 0.32 : 0);
    } else this.light.intensity = 0;
  }

  private drop(fx: Timed) {
    this.group.remove(fx.root);
    fx.materials.forEach((m) => m.dispose());
    fx.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && !fx.materials.includes(mat as THREE.MeshBasicMaterial)) mat.dispose();
    });
  }

  /** Everything off the street at once (round reset, arena change). */
  clear() {
    for (const f of this.flyers) this.releaseShot(f.shot);
    for (const s of this.stuck) this.releaseShot(s.shot);
    for (const shot of [...this.live]) this.releaseShot(shot);
    this.flyers = [];
    this.stuck = [];
    this.timed.forEach((fx) => this.drop(fx));
    this.timed = [];
    this.trails.forEach((t) => t.clear());
    this.light.intensity = 0;
    this.lightT = 0;
  }

  get activeCount() {
    return this.timed.length + this.flyers.length + this.stuck.length;
  }

  dispose() {
    this.clear();
    this.pools.forEach((pool) =>
      pool.forEach((shot) => {
        shot.trail.dispose();
        shot.root.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
      }),
    );
    this.pools.clear();
  }
}