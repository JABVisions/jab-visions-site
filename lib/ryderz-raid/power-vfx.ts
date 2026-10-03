import * as THREE from 'three';
import type { Fighter } from './characters';
import type { RyderVisualProfile } from './config';
import type { ParticleSystem } from './particles';
import type { BoneKey } from './skeletal';

/**
 * Ryder power electricity.
 *
 * `ArcPool` draws a fixed number of jagged lightning ribbons from one additive
 * mesh; nothing is allocated per frame or per arc. `RyderPowerVFX` reads the
 * real aura value every frame, derives HIGH / LOW / DEPLETED, and drives the
 * arcs, sparks and aura glow of whichever Ryder it is attached to.
 */

export type PowerState = 'HIGH' | 'LOW' | 'DEPLETED';

/** Power is "usable" when the combat system lets the Ryder spend it (not burnt out). */
export function powerState(current: number, max: number, usable = true): PowerState {
  const pct = max > 0 ? current / max : 0;
  if (!usable || pct <= 0) return 'DEPLETED';
  return pct >= 0.5 ? 'HIGH' : 'LOW';
}

const ARC_POINTS = 9;
const ARC_SEGMENTS = ARC_POINTS - 1;
const VERTS_PER_ARC = ARC_SEGMENTS * 6;
const REJITTER = 0.045;

interface Arc {
  active: boolean;
  life: number;
  maxLife: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  width: number;
  wobble: number;
  rejitter: number;
  points: THREE.Vector3[];
  /** Live anchors: when set, `from`/`to` are refreshed from them each frame. */
  fromAnchor: Anchor | null;
  toAnchor: Anchor | null;
}

export interface Anchor {
  object: THREE.Object3D;
  offset: THREE.Vector3;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _color = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export function anchorWorld(anchor: Anchor, out: THREE.Vector3) {
  return anchor.object.localToWorld(out.copy(anchor.offset));
}

/** Fixed-size pool of camera-facing lightning ribbons rendered as one mesh. */
export class ArcPool {
  readonly mesh: THREE.Mesh;
  private arcs: Arc[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private geometry: THREE.BufferGeometry;

  constructor(capacity: number) {
    this.positions = new Float32Array(capacity * VERTS_PER_ARC * 3);
    this.colors = new Float32Array(capacity * VERTS_PER_ARC * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < capacity; i += 1) {
      this.arcs.push({
        active: false,
        life: 0,
        maxLife: 1,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        color: new THREE.Color(),
        width: 0.04,
        wobble: 0.1,
        rejitter: 0,
        points: Array.from({ length: ARC_POINTS }, () => new THREE.Vector3()),
        fromAnchor: null,
        toAnchor: null,
      });
    }
  }

  get activeCount() {
    return this.arcs.reduce((n, arc) => n + (arc.active ? 1 : 0), 0);
  }

  /**
   * Light an arc. Returns false when the pool is saturated (the effect simply
   * skips a flicker rather than growing).
   */
  spawn(
    from: THREE.Vector3 | Anchor,
    to: THREE.Vector3 | Anchor,
    color: THREE.ColorRepresentation,
    options: { life?: number; width?: number; wobble?: number; brightness?: number } = {},
  ) {
    const arc = this.arcs.find((a) => !a.active);
    if (!arc) return false;
    arc.active = true;
    arc.maxLife = options.life ?? 0.22;
    arc.life = arc.maxLife;
    arc.width = options.width ?? 0.045;
    arc.wobble = options.wobble ?? 0.12;
    arc.color.set(color).multiplyScalar(options.brightness ?? 1);
    arc.fromAnchor = 'object' in from ? from : null;
    arc.toAnchor = 'object' in to ? to : null;
    if (arc.fromAnchor) anchorWorld(arc.fromAnchor, arc.from);
    else arc.from.copy(from as THREE.Vector3);
    if (arc.toAnchor) anchorWorld(arc.toAnchor, arc.to);
    else arc.to.copy(to as THREE.Vector3);
    arc.rejitter = 0;
    return true;
  }

  clear() {
    for (const arc of this.arcs) arc.active = false;
    this.geometry.setDrawRange(0, 0);
  }

  update(dt: number, camera: THREE.Camera) {
    let vertex = 0;
    for (const arc of this.arcs) {
      if (!arc.active) continue;
      arc.life -= dt;
      if (arc.life <= 0) {
        arc.active = false;
        continue;
      }
      if (arc.fromAnchor) anchorWorld(arc.fromAnchor, arc.from);
      if (arc.toAnchor) anchorWorld(arc.toAnchor, arc.to);
      arc.rejitter -= dt;
      if (arc.rejitter <= 0) {
        arc.rejitter = REJITTER;
        this.jitter(arc);
      }
      const t = arc.life / arc.maxLife;
      // Flicker: a sharp attack then a fast fall-off, with per-frame noise.
      const flick = (t > 0.85 ? (1 - t) / 0.15 : t / 0.85) * (0.75 + Math.random() * 0.25);
      vertex = this.writeRibbon(arc, vertex, flick, camera);
    }
    this.geometry.setDrawRange(0, vertex);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  private jitter(arc: Arc) {
    _dir.subVectors(arc.to, arc.from);
    const length = _dir.length() || 0.001;
    _dir.divideScalar(length);
    // Two perpendicular axes for the displacement.
    _up.set(0, 1, 0);
    if (Math.abs(_dir.y) > 0.9) _up.set(1, 0, 0);
    _side.crossVectors(_dir, _up).normalize();
    _up.crossVectors(_side, _dir).normalize();
    const amp = arc.wobble * Math.min(1, length);
    for (let i = 0; i < ARC_POINTS; i += 1) {
      const s = i / ARC_SEGMENTS;
      const p = arc.points[i];
      p.copy(arc.from).addScaledVector(_dir, length * s);
      // Endpoints stay pinned; the middle wanders most.
      const envelope = Math.sin(s * Math.PI);
      p.addScaledVector(_side, (Math.random() - 0.5) * 2 * amp * envelope);
      p.addScaledVector(_up, (Math.random() - 0.5) * 2 * amp * envelope);
    }
  }

  private writeRibbon(arc: Arc, vertex: number, intensity: number, camera: THREE.Camera) {
    // Core is pushed toward white so the ribbon reads as a hot filament.
    _color.copy(arc.color).lerp(WHITE, 0.35).multiplyScalar(intensity);
    for (let i = 0; i < ARC_SEGMENTS; i += 1) {
      const p0 = arc.points[i];
      const p1 = arc.points[i + 1];
      _dir.subVectors(p1, p0);
      _toCam.subVectors(camera.position, p0);
      _side.crossVectors(_dir, _toCam).normalize();
      const taper0 = Math.sin((i / ARC_SEGMENTS) * Math.PI) * 0.7 + 0.3;
      const taper1 = Math.sin(((i + 1) / ARC_SEGMENTS) * Math.PI) * 0.7 + 0.3;
      const w0 = arc.width * taper0 * 0.5;
      const w1 = arc.width * taper1 * 0.5;
      _a.copy(p0).addScaledVector(_side, w0);
      _b.copy(p0).addScaledVector(_side, -w0);
      _c.copy(p1).addScaledVector(_side, w1);
      _d.copy(p1).addScaledVector(_side, -w1);
      vertex = this.writeVertex(_a, vertex);
      vertex = this.writeVertex(_b, vertex);
      vertex = this.writeVertex(_c, vertex);
      vertex = this.writeVertex(_b, vertex);
      vertex = this.writeVertex(_d, vertex);
      vertex = this.writeVertex(_c, vertex);
    }
    return vertex;
  }

  private writeVertex(q: THREE.Vector3, vertex: number) {
    const o = vertex * 3;
    this.positions[o] = q.x;
    this.positions[o + 1] = q.y;
    this.positions[o + 2] = q.z;
    this.colors[o] = _color.r;
    this.colors[o + 1] = _color.g;
    this.colors[o + 2] = _color.b;
    return vertex + 1;
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------

const RING_GEOMETRY = new THREE.RingGeometry(0.5, 0.92, 40);
const DISC_GEOMETRY = new THREE.CircleGeometry(0.6, 32);

/** Where electricity can start and end on a figure. */
interface Route {
  from: Anchor;
  to: Anchor;
}

const GLB_ANCHORS: Array<[BoneKey, THREE.Vector3]> = [
  ['handL', new THREE.Vector3()],
  ['handR', new THREE.Vector3()],
  ['lowerArmL', new THREE.Vector3()],
  ['lowerArmR', new THREE.Vector3()],
  ['upperArmL', new THREE.Vector3()],
  ['upperArmR', new THREE.Vector3()],
  ['chest', new THREE.Vector3()],
  ['upperChest', new THREE.Vector3()],
  ['head', new THREE.Vector3()],
  ['hips', new THREE.Vector3()],
  ['lowerLegL', new THREE.Vector3()],
  ['lowerLegR', new THREE.Vector3()],
  ['footL', new THREE.Vector3()],
  ['footR', new THREE.Vector3()],
];

const SURGE_FLASH = 1.1;

export class RyderPowerVFX {
  readonly arcs: ArcPool;
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private discMat: THREE.MeshBasicMaterial;
  private particles: ParticleSystem;
  private fighter: Fighter | null = null;
  private profile: RyderVisualProfile | null = null;
  private anchors = new Map<string, Anchor>();
  private routes: Route[] = [];
  private auraRoutes: Anchor[] = [];
  private state: PowerState = 'DEPLETED';
  private hasState = false;
  private auraLevel = 0;
  private flash = 0;
  private nextArc = 0;
  private nextSpark = 0;
  private glowColor = new THREE.Color();
  private _pos = new THREE.Vector3();

  constructor(scene: THREE.Scene, particles: ParticleSystem) {
    this.particles = particles;
    this.arcs = new ArcPool(24);
    scene.add(this.arcs.mesh);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.discMat = this.ringMat.clone();
    this.ring = new THREE.Mesh(RING_GEOMETRY, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.disc = new THREE.Mesh(DISC_GEOMETRY, this.discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.visible = false;
    this.disc.renderOrder = 2;
    scene.add(this.ring, this.disc);
  }

  get currentState() {
    return this.state;
  }

  /** Point the system at a (new) figure. Safe to call on every Ryder switch. */
  attach(fighter: Fighter, profile: RyderVisualProfile) {
    this.fighter = fighter;
    this.profile = profile;
    this.anchors.clear();
    this.routes = [];
    this.auraRoutes = [];
    this.arcs.clear();
    this.hasState = false;

    const skeleton = fighter.rig?.skeleton;
    if (skeleton) {
      for (const [key, offset] of GLB_ANCHORS) {
        const bone = skeleton.bone(key);
        if (bone) this.anchors.set(key, { object: bone, offset });
      }
    } else {
      const h = fighter.humanoid;
      const add = (key: string, object: THREE.Object3D, offset: THREE.Vector3) =>
        this.anchors.set(key, { object, offset });
      add('handL', h.handL, new THREE.Vector3());
      add('handR', h.handR, new THREE.Vector3());
      add('lowerArmL', h.armL, new THREE.Vector3(0, -0.36, 0));
      add('lowerArmR', h.armR, new THREE.Vector3(0, -0.36, 0));
      add('upperArmL', h.armL, new THREE.Vector3(0, -0.05, 0));
      add('upperArmR', h.armR, new THREE.Vector3(0, -0.05, 0));
      add('chest', h.torso, new THREE.Vector3(0, 0.1, 0.17));
      add('upperChest', h.torso, new THREE.Vector3(0, 0.25, 0));
      add('head', h.head, new THREE.Vector3(0, 0.1, 0));
      add('hips', h.torso, new THREE.Vector3(0, -0.32, 0));
      add('lowerLegL', h.legL, new THREE.Vector3(0, -0.4, 0));
      add('lowerLegR', h.legR, new THREE.Vector3(0, -0.4, 0));
      add('footL', h.legL, new THREE.Vector3(0, -0.8, 0.05));
      add('footR', h.legR, new THREE.Vector3(0, -0.8, 0.05));
    }

    const pair = (a: string, b: string) => {
      const from = this.anchors.get(a);
      const to = this.anchors.get(b);
      if (from && to) this.routes.push({ from, to });
    };
    pair('handL', 'lowerArmL');
    pair('handR', 'lowerArmR');
    pair('lowerArmL', 'upperArmL');
    pair('lowerArmR', 'upperArmR');
    pair('upperArmL', 'chest');
    pair('chest', 'upperArmR');
    pair('upperChest', 'head');
    pair('chest', 'hips');
    pair('hips', 'lowerLegL');
    pair('hips', 'lowerLegR');
    pair('lowerLegL', 'footL');
    pair('lowerLegR', 'footR');
    for (const key of ['footL', 'footR', 'hips', 'handL', 'handR']) {
      const anchor = this.anchors.get(key);
      if (anchor) this.auraRoutes.push(anchor);
    }

    this.glowColor.setHex(profile.auraColor);
    this.ringMat.color.setHex(profile.auraColor);
    this.discMat.color.setHex(profile.auraColor);
    this.ring.visible = true;
    this.disc.visible = true;
    this.applyAura();
  }

  detach() {
    this.fighter = null;
    this.profile = null;
    this.routes = [];
    this.auraRoutes = [];
    this.arcs.clear();
    this.ring.visible = false;
    this.disc.visible = false;
    this.hasState = false;
  }

  /**
   * Power coming back online: a burst of arcs across the body, a spark shower
   * and a bright aura flash that decays over the next second.
   */
  surge(strength = 1) {
    if (!this.fighter || !this.profile) return;
    const count = Math.round(6 + 6 * strength);
    for (let i = 0; i < count; i += 1) this.lightRoute(1.0, 0.32 + Math.random() * 0.2, 0.06);
    this.flash = Math.max(this.flash, SURGE_FLASH * strength);
    this._pos.copy(this.fighter.humanoid.group.position).y += 1.05;
    this.particles.emit(this._pos, this.profile.electricityColor, Math.round(22 * strength), {
      speed: 7,
      size: 0.26,
      life: 0.5,
      up: 1,
      gravity: 4,
    });
  }

  /**
   * Called once per frame with the live aura values. `usable` is false while
   * the combat system has the Ryder burnt out, which reads as no power even if
   * the bar has started to creep back.
   */
  update(dt: number, time: number, current: number, max: number, usable: boolean, camera: THREE.Camera) {
    const fighter = this.fighter;
    const profile = this.profile;
    if (!fighter || !profile) {
      this.arcs.update(dt, camera);
      return;
    }
    const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    const next = powerState(current, max, usable);
    if (this.hasState && this.state === 'DEPLETED' && next !== 'DEPLETED') this.surge(1);
    this.state = next;
    this.hasState = true;

    // Electricity cadence per state.
    if (next === 'DEPLETED') {
      this.nextArc = 0.3;
    } else {
      this.nextArc -= dt;
      if (this.nextArc <= 0) {
        if (next === 'HIGH') {
          const count = Math.random() < 0.35 ? 2 : 1;
          for (let i = 0; i < count; i += 1) this.lightRoute(0.75 + 0.25 * pct, 0.16 + Math.random() * 0.14, 0.04);
          this.nextArc = 0.3 + Math.random() * 0.5;
        } else {
          // Weak, stuttering: shorter, dimmer, and rarer the lower the bar sits.
          this.lightRoute(0.4 + 0.5 * (pct / 0.5), 0.08 + Math.random() * 0.08, 0.03);
          this.nextArc = 1.1 + Math.random() * 1.6 + (0.5 - pct) * 2;
        }
      }
      this.nextSpark -= dt;
      if (this.nextSpark <= 0) {
        const anchor = this.auraRoutes[Math.floor(Math.random() * this.auraRoutes.length)];
        if (anchor) {
          anchorWorld(anchor, this._pos);
          this.particles.emit(this._pos, profile.electricityColor, next === 'HIGH' ? 3 : 1, {
            speed: next === 'HIGH' ? 2.2 : 1.2,
            size: 0.12,
            life: 0.28,
            up: 0.6,
            gravity: 5,
          });
        }
        this.nextSpark = next === 'HIGH' ? 0.5 + Math.random() * 0.7 : 1.6 + Math.random() * 1.8;
      }
    }

    // Aura brightness eases toward the state target; surges add a decaying flash.
    const span = profile.poweredAuraIntensity - profile.depletedAuraIntensity;
    const target =
      next === 'DEPLETED'
        ? profile.depletedAuraIntensity
        : next === 'HIGH'
          ? profile.poweredAuraIntensity
          : profile.depletedAuraIntensity + span * (0.3 + 0.3 * (pct / 0.5));
    const ease = next === 'DEPLETED' ? 4 : 2.5;
    this.auraLevel += (target - this.auraLevel) * Math.min(1, dt * ease);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.applyAura(time, pct);
    this.arcs.update(dt, camera);
  }

  private lightRoute(brightness: number, life: number, width: number) {
    if (!this.profile) return;
    // Mostly limb-to-limb; sometimes body → aura ring on the ground.
    if (this.auraRoutes.length && Math.random() < 0.22) {
      const from = this.auraRoutes[Math.floor(Math.random() * this.auraRoutes.length)];
      anchorWorld(from, this._pos);
      const angle = Math.random() * Math.PI * 2;
      const base = this.ring.position;
      _b.set(base.x + Math.cos(angle) * 0.75, base.y + 0.02, base.z + Math.sin(angle) * 0.75);
      this.arcs.spawn(from, _b, this.profile.electricityColor, { brightness, life, width, wobble: 0.16 });
      return;
    }
    if (!this.routes.length) return;
    const route = this.routes[Math.floor(Math.random() * this.routes.length)];
    this.arcs.spawn(route.from, route.to, this.profile.electricityColor, { brightness, life, width, wobble: 0.1 });
  }

  private applyAura(time = 0, pct = 1) {
    const fighter = this.fighter;
    const profile = this.profile;
    if (!fighter || !profile) return;
    const level = this.auraLevel + this.flash;
    // Weapon / orb glow: the existing "aura" meshes on the figure.
    fighter.glowMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.glowColor).multiplyScalar(Math.max(0.05, level));
    });
    // Block figures carry glowing eyes; GLB figures hide the material.
    const eyes = fighter.humanoid.eyeMaterial;
    if (eyes.visible) eyes.color.copy(this.glowColor).multiplyScalar(0.6 + Math.max(0, level) * 1.1);

    // Ground aura ring.
    const group = fighter.humanoid.group;
    const breathe = 1 + Math.sin(time * 3.2) * 0.05 * pct;
    this.ring.position.copy(group.position).y += 0.035;
    this.disc.position.copy(group.position).y += 0.03;
    this.ring.rotation.z = time * 0.8;
    this.ring.scale.setScalar(breathe);
    const powered = profile.poweredAuraIntensity || 1;
    const norm = Math.max(0, level) / powered;
    this.ringMat.opacity = Math.min(1, norm * 0.55);
    this.discMat.opacity = Math.min(1, norm * 0.22);
  }

  dispose() {
    this.arcs.dispose();
    this.ringMat.dispose();
    this.discMat.dispose();
  }
}
