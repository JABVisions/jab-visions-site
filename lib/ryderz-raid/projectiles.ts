import * as THREE from 'three';
import { TrailRibbon } from './speed-vfx';

/**
 * Kit-owned homing projectiles ("darts"): glowing shards with a short ribbon
 * trail that steer gently toward a target, hurt whatever they strike and
 * burst on impact. Pooled, so a barrage allocates nothing per shot, and a
 * kit can drop every live dart at once when it is interrupted.
 */

export interface DartTarget {
  pos: THREE.Vector3;
  radius: number;
  hp: number;
}

export interface DartEnv<T extends DartTarget> {
  targets: readonly T[];
  camera: THREE.Camera;
  blocked(x: number, z: number, radius: number): boolean;
  onHit(target: T, dart: { pos: THREE.Vector3; dir: THREE.Vector3; damage: number }): void;
  onFizzle(pos: THREE.Vector3): void;
}

interface Dart<T extends DartTarget> {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  speed: number;
  damage: number;
  life: number;
  turnRate: number;
  target: T | null;
  mesh: THREE.Group;
  core: THREE.MeshBasicMaterial;
  halo: THREE.MeshBasicMaterial;
  trail: TrailRibbon;
}

/** Arrow along +Y: the pool aims that axis down the flight path. */
const SHAFT = new THREE.CylinderGeometry(0.012, 0.016, 0.58, 5);
const TIP = new THREE.ConeGeometry(0.046, 0.2, 6);
const FLETCH = new THREE.PlaneGeometry(0.1, 0.16);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class DartPool<T extends DartTarget = DartTarget> {
  readonly group = new THREE.Group();
  private darts: Array<Dart<T>> = [];
  private color = new THREE.Color();

  constructor(capacity: number, color: THREE.ColorRepresentation) {
    this.group.name = 'Darts';
    this.color.set(color);
    for (let i = 0; i < capacity; i += 1) {
      const core = new THREE.MeshBasicMaterial({ color: 0xfff4fb, toneMapped: false });
      const halo = new THREE.MeshBasicMaterial({ color: this.color, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Group();
      const shaft = new THREE.Mesh(SHAFT, core);
      const tip = new THREE.Mesh(TIP, halo);
      tip.position.y = 0.38;
      const fletchA = new THREE.Mesh(FLETCH, halo);
      const fletchB = new THREE.Mesh(FLETCH, halo);
      fletchA.position.y = -0.22;
      fletchB.position.y = -0.22;
      fletchB.rotation.y = Math.PI / 2;
      mesh.add(shaft, tip, fletchA, fletchB);
      mesh.visible = false;
      const trail = new TrailRibbon(this.color, { life: 0.18, width: 0.16, spacing: 0.1 });
      trail.intensity = 0.9;
      this.group.add(mesh, trail.mesh);
      this.darts.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), speed: 30, damage: 0, life: 0, turnRate: 0, target: null, mesh, core, halo, trail });
    }
    this.setColor(color);
  }

  setColor(color: THREE.ColorRepresentation) {
    this.color.set(color);
    for (const d of this.darts) {
      d.halo.color.copy(this.color);
      d.core.color.copy(this.color).lerp(new THREE.Color(0xffffff), 0.55);
      d.trail.setColor(this.color);
    }
  }

  get live() {
    return this.darts.reduce((n, d) => n + (d.active ? 1 : 0), 0);
  }

  spawn(pos: THREE.Vector3, dir: THREE.Vector3, options: { speed?: number; damage: number; target?: T | null; turnRate?: number; life?: number }) {
    const dart = this.darts.find((d) => !d.active) ?? this.darts.reduce((a, b) => (a.life < b.life ? a : b));
    if (dart.active) dart.trail.clear();
    dart.active = true;
    dart.pos.copy(pos);
    dart.speed = options.speed ?? 30;
    dart.vel.copy(dir).normalize().multiplyScalar(dart.speed);
    dart.damage = options.damage;
    dart.life = options.life ?? 1.8;
    dart.turnRate = options.turnRate ?? 0;
    dart.target = options.target ?? null;
    dart.mesh.visible = true;
    dart.mesh.position.copy(pos);
    dart.mesh.quaternion.setFromUnitVectors(Y_AXIS, _dir.copy(dart.vel).normalize());
    dart.trail.clear();
    dart.trail.feed(pos);
    return dart;
  }

  update(dt: number, env: DartEnv<T>) {
    for (const dart of this.darts) {
      if (!dart.active) {
        dart.trail.update(dt, env.camera);
        continue;
      }
      dart.life -= dt;
      // Gentle homing: bend the velocity toward the target's chest by at most turnRate rad/s.
      const target = dart.target;
      if (target && target.hp > 0 && dart.turnRate > 0) {
        _aim.copy(target.pos).setY(1.05).sub(dart.pos);
        if (_aim.lengthSq() > 1e-4) {
          _aim.normalize();
          _dir.copy(dart.vel).normalize();
          const angle = Math.acos(THREE.MathUtils.clamp(_dir.dot(_aim), -1, 1));
          const step = Math.min(1, (dart.turnRate * dt) / Math.max(1e-4, angle));
          _dir.lerp(_aim, step).normalize();
          dart.vel.copy(_dir).multiplyScalar(dart.speed);
        }
      } else if (target && target.hp <= 0) {
        dart.target = null;
      }
      dart.pos.addScaledVector(dart.vel, dt);
      dart.mesh.position.copy(dart.pos);
      dart.mesh.quaternion.setFromUnitVectors(Y_AXIS, _dir.copy(dart.vel).normalize());
      dart.trail.feed(dart.pos);
      dart.trail.update(dt, env.camera);

      if (dart.life <= 0 || dart.pos.y < 0.05) {
        this.retire(dart);
        continue;
      }
      if (dart.pos.y < 2.6 && env.blocked(dart.pos.x, dart.pos.z, 0.1)) {
        env.onFizzle(dart.pos);
        this.retire(dart);
        continue;
      }
      for (const t of env.targets) {
        if (t.hp <= 0) continue;
        const dx = t.pos.x - dart.pos.x;
        const dz = t.pos.z - dart.pos.z;
        const dy = 1.05 - dart.pos.y;
        const r = t.radius + 0.28;
        if (dx * dx + dz * dz + dy * dy * 0.35 < r * r) {
          env.onHit(t, { pos: dart.pos, dir: _dir.copy(dart.vel).normalize(), damage: dart.damage });
          this.retire(dart);
          break;
        }
      }
    }
  }

  private retire(dart: Dart<T>) {
    dart.active = false;
    dart.mesh.visible = false;
    dart.target = null;
  }

  /** Drop every live dart immediately (kit interrupted / detached). */
  clear() {
    for (const dart of this.darts) {
      this.retire(dart);
      dart.trail.clear();
    }
  }

  dispose() {
    this.clear();
    for (const dart of this.darts) {
      dart.core.dispose();
      dart.halo.dispose();
      dart.trail.dispose();
    }
    this.darts = [];
  }
}
