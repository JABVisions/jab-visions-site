import * as THREE from 'three';
import type { KitContext } from './kit';

/**
 * Shared landing search for a double-jump teleport. Gameplay picks the cell;
 * each Ryder only dresses the departure and the arrival.
 */
export function leapAhead(ctx: KitContext, distance: number, yawJitter = 0): THREE.Vector3 | null {
  const yaw = ctx.yaw() + yawJitter;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const from = ctx.pos.clone();
  let landed = false;
  for (let step = distance; step >= 2.4; step -= 0.7) {
    const x = from.x + fx * step;
    const z = from.z + fz * step;
    if (ctx.blocked(x, z, ctx.radius)) continue;
    ctx.pos.x = x;
    ctx.pos.z = z;
    ctx.resolve(ctx.pos);
    landed = true;
    break;
  }
  if (!landed || Math.hypot(ctx.pos.x - from.x, ctx.pos.z - from.z) < 1.6) {
    ctx.pos.copy(from);
    return null;
  }
  return from;
}

/** Farther relocation. Prefers the way she is facing, then other headings, and keeps the longest clear cell. */
export function transferAhead(ctx: KitContext, minDist: number, maxDist: number): THREE.Vector3 | null {
  const yaw = ctx.yaw();
  const from = ctx.pos.clone();
  const angles = [0, 0.4, -0.4, 0.85, -0.85, 1.35, -1.35, Math.PI];
  let best: { x: number; z: number; score: number } | null = null;
  for (const turn of angles) {
    const dir = yaw + turn;
    const fx = Math.sin(dir);
    const fz = Math.cos(dir);
    for (let step = maxDist; step >= minDist; step -= 1.4) {
      const x = from.x + fx * step;
      const z = from.z + fz * step;
      if (ctx.blocked(x, z, ctx.radius)) continue;
      const score = step - Math.abs(turn) * 3;
      if (!best || score > best.score) best = { x, z, score };
      break;
    }
  }
  if (!best) return null;
  ctx.pos.x = best.x;
  ctx.pos.z = best.z;
  ctx.resolve(ctx.pos);
  if (Math.hypot(ctx.pos.x - from.x, ctx.pos.z - from.z) < minDist * 0.55) {
    ctx.pos.copy(from);
    return null;
  }
  return from;
}

const TORUS = new THREE.TorusGeometry(1, 0.03, 6, 22);
const SPHERE = new THREE.SphereGeometry(0.2, 7, 6);
const CUBE = new THREE.BoxGeometry(0.07, 0.07, 0.07);

type Kind = 'atoms' | 'vortex' | 'goo';

interface Bit {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

interface Burst {
  kind: Kind;
  group: THREE.Group;
  life: number;
  max: number;
  mats: THREE.Material[];
  bits: Bit[];
}

/** One-shot departure and arrival dressings. Meshes are pooled per cast and removed when they fade. */
export class AirJumpFx {
  private bursts: Burst[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  atoms(at: THREE.Vector3, color: number, arrive: boolean) {
    const group = new THREE.Group();
    group.name = 'AaronAtoms';
    group.position.copy(at);
    const mats: THREE.Material[] = [];
    const bits: Bit[] = [];
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xffffff : color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mats.push(mat);
      const ring = new THREE.Mesh(TORUS, mat);
      ring.rotation.set(i * 0.7, i * 1.1, i * 0.4);
      ring.scale.setScalar(arrive ? 1.8 : 0.15);
      group.add(ring);
      bits.push({ mesh: ring, vx: 0, vy: 0, vz: 0, spin: 2.4 + i });
    }
    this.scene.add(group);
    this.bursts.push({ kind: 'atoms', group, life: arrive ? 0.42 : 0.36, max: arrive ? 0.42 : 0.36, mats, bits });
  }

  vortex(at: THREE.Vector3) {
    const group = new THREE.Group();
    group.name = 'NyxVortex';
    group.position.copy(at);
    const mats: THREE.Material[] = [];
    const bits: Bit[] = [];
    const colors = [0x3de7ff, 0xb388ff, 0xf4fbff];
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mats.push(mat);
      const ring = new THREE.Mesh(TORUS, mat);
      ring.rotation.x = i === 2 ? Math.PI / 2 : 0.25;
      ring.scale.setScalar(0.35 + i * 0.18);
      group.add(ring);
      bits.push({ mesh: ring, vx: 0, vy: 0, vz: 0, spin: (i % 2 ? -1 : 1) * (6 + i) });
    }
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x3de7ff : 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
      mats.push(mat);
      const cube = new THREE.Mesh(CUBE, mat);
      const angle = (i / 8) * Math.PI * 2;
      cube.position.set(Math.cos(angle) * 0.55, 0.2 + (i % 3) * 0.25, Math.sin(angle) * 0.55);
      group.add(cube);
      bits.push({ mesh: cube, vx: Math.cos(angle), vy: 0.4, vz: Math.sin(angle), spin: 4 });
    }
    this.scene.add(group);
    this.bursts.push({ kind: 'vortex', group, life: 0.48, max: 0.48, mats, bits });
  }

  goo(at: THREE.Vector3) {
    const group = new THREE.Group();
    group.name = 'KidGoo';
    group.position.copy(at);
    const mats: THREE.Material[] = [];
    const bits: Bit[] = [];
    const colors = [0xb388ff, 0xff4ad8, 0x3de7ff, 0x7a4dff];
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      });
      mats.push(mat);
      const blob = new THREE.Mesh(SPHERE, mat);
      const angle = (i / 8) * Math.PI * 2 + i;
      blob.scale.set(0.55 + (i % 3) * 0.35, 0.85 + (i % 2) * 0.4, 0.5);
      blob.position.set(0, 0.9, 0);
      group.add(blob);
      const speed = 1.6 + (i % 4) * 0.45;
      bits.push({
        mesh: blob,
        vx: Math.cos(angle) * speed,
        vy: 1.2 + (i % 3) * 0.7,
        vz: Math.sin(angle) * speed,
        spin: 2 + i,
      });
    }
    this.scene.add(group);
    this.bursts.push({ kind: 'goo', group, life: 0.62, max: 0.62, mats, bits });
  }

  step(dt: number) {
    for (const burst of this.bursts) {
      burst.life -= dt;
      const u = Math.max(0, burst.life / burst.max);
      if (burst.kind === 'atoms') {
        const arrive = burst.max > 0.4;
        burst.bits.forEach((bit, index) => {
          const ring = bit.mesh;
          const grow = arrive ? 0.25 + u * 1.7 : 0.2 + (1 - u) * 1.9;
          ring.scale.setScalar(grow * (0.72 + index * 0.18));
          ring.rotation.y += dt * bit.spin;
          ring.rotation.z += dt * bit.spin * 0.6;
        });
        burst.mats.forEach((mat) => {
          (mat as THREE.MeshBasicMaterial).opacity = 0.15 + u * 0.7;
        });
      } else if (burst.kind === 'vortex') {
        const spin = 1 - u;
        burst.bits.forEach((bit, index) => {
          if (index < 3) {
            bit.mesh.rotation.y += dt * bit.spin;
            bit.mesh.scale.setScalar((0.4 + spin * 1.3) * (0.7 + index * 0.2));
            return;
          }
          const angle = burst.life * bit.spin + index;
          const radius = 0.25 + spin * 0.85;
          bit.mesh.position.set(Math.cos(angle) * radius * bit.vx, 0.15 + spin * 1.1 + index * 0.02, Math.sin(angle) * radius);
          bit.mesh.rotation.y += dt * 8;
        });
        burst.mats.forEach((mat) => {
          (mat as THREE.MeshBasicMaterial).opacity = 0.2 + u * 0.7;
        });
      } else {
        burst.bits.forEach((bit) => {
          bit.vy -= dt * 7.5;
          bit.mesh.position.x += bit.vx * dt;
          bit.mesh.position.y += bit.vy * dt;
          bit.mesh.position.z += bit.vz * dt;
          if (bit.mesh.position.y < 0.06) {
            bit.mesh.position.y = 0.06;
            bit.vy = 0;
            bit.vx *= 0.4;
            bit.vz *= 0.4;
            bit.mesh.scale.y = 0.22;
            bit.mesh.scale.x *= 1.15;
            bit.mesh.scale.z *= 1.15;
          }
          bit.mesh.rotation.z += dt * bit.spin;
        });
        burst.mats.forEach((mat) => {
          (mat as THREE.MeshBasicMaterial).opacity = 0.15 + u * 0.7;
        });
      }
    }
    this.bursts = this.bursts.filter((burst) => {
      if (burst.life > 0) return true;
      burst.group.removeFromParent();
      burst.mats.forEach((mat) => mat.dispose());
      return false;
    });
  }

  clear() {
    for (const burst of this.bursts) {
      burst.group.removeFromParent();
      burst.mats.forEach((mat) => mat.dispose());
    }
    this.bursts = [];
  }
}

export function chestPoint(ctx: KitContext, x: number, z: number, out: THREE.Vector3) {
  return out.set(x, ctx.heightAt(x, z) + 1.05, z);
}
