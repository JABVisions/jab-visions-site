import * as THREE from 'three';
import { toon } from './toon';

export type ThrowableKind = 'bottle' | 'brick' | 'crate' | 'cone' | 'can';

export interface ThrowableStats {
  kind: ThrowableKind;
  mass: number;
  pickupRadius: number;
  throwForce: number;
  damage: number;
  stun: number;
  breakable: boolean;
}

export const THROWABLE_STATS: Record<ThrowableKind, ThrowableStats> = {
  bottle: { kind: 'bottle', mass: 0.4, pickupRadius: 0.85, throwForce: 11, damage: 6, stun: 0.16, breakable: true },
  brick: { kind: 'brick', mass: 1.1, pickupRadius: 0.8, throwForce: 13, damage: 9, stun: 0.22, breakable: true },
  crate: { kind: 'crate', mass: 2.4, pickupRadius: 1.05, throwForce: 9, damage: 11, stun: 0.28, breakable: true },
  cone: { kind: 'cone', mass: 0.6, pickupRadius: 0.9, throwForce: 10, damage: 5, stun: 0.14, breakable: false },
  can: { kind: 'can', mass: 1.6, pickupRadius: 1, throwForce: 10, damage: 8, stun: 0.2, breakable: false },
};

export interface ThrowBody {
  id: number;
  stats: ThrowableStats;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  heldBy: object | null;
  /** Parent is a hand socket, so the mesh follows the arm instead of a world point. */
  gripped: boolean;
  lastThrower: object | null;
  /** Ignores the thrower until this clock time. */
  safeUntil: number;
  flying: boolean;
  dealt: boolean;
  broken: boolean;
  spin: number;
}

const KINDS: ThrowableKind[] = ['bottle', 'brick', 'crate', 'cone', 'can', 'bottle', 'brick', 'cone', 'can', 'crate'];

const SPOTS: Array<[number, number]> = [
  [15.5, 18],
  [-16, 15],
  [18, -15],
  [-17.5, -14],
  [24, 9],
  [-23, 7.5],
  [16.2, -16.4],
  [-11, 24],
  [27, -16],
  [-9, -24],
];

function propMesh(kind: ThrowableKind) {
  const group = new THREE.Group();
  group.name = `throwable-${kind}`;
  if (kind === 'bottle') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 8), toon(0x6aa87a));
    body.position.y = 0.16;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 6), toon(0x8fd0a4));
    neck.position.y = 0.36;
    group.add(body, neck);
  } else if (kind === 'brick') {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.16), toon(0x8a4038));
    brick.position.y = 0.06;
    group.add(brick);
  } else if (kind === 'crate') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), toon(0x8a6a3a));
    crate.position.y = 0.25;
    group.add(crate);
  } else if (kind === 'cone') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), toon(0xe07030));
    cone.position.y = 0.28;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), toon(0xc8c4bc));
    base.position.y = 0.03;
    group.add(cone, base);
  } else {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.7, 10), toon(0x3e4654));
    can.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), toon(0x6a7280));
    lid.position.y = 0.72;
    group.add(can, lid);
  }
  return group;
}

/**
 * Loose street props. Civilians and, later, players share pickup and throw.
 * A prop damages at most once per toss, and never the person still holding it.
 */
export class ThrowableField {
  readonly items: ThrowBody[] = [];
  private seq = 1;

  constructor(private scene: THREE.Scene) {
    SPOTS.forEach(([x, z], i) => {
      const kind = KINDS[i % KINDS.length];
      const mesh = propMesh(kind);
      const pos = new THREE.Vector3(x, 0, z);
      mesh.position.copy(pos);
      scene.add(mesh);
      this.items.push({
        id: this.seq,
        stats: THROWABLE_STATS[kind],
        mesh,
        pos,
        vel: new THREE.Vector3(),
        heldBy: null,
        gripped: false,
        lastThrower: null,
        safeUntil: 0,
        flying: false,
        dealt: false,
        broken: false,
        spin: 0,
      });
      this.seq += 1;
    });
  }

  nearestFree(x: number, z: number, max = 14): ThrowBody | null {
    let best: ThrowBody | null = null;
    let bestD = max * max;
    for (const item of this.items) {
      if (item.heldBy || item.broken || item.flying) continue;
      const d = (item.pos.x - x) ** 2 + (item.pos.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  pickup(holder: object, item: ThrowBody) {
    if (item.heldBy || item.broken) return false;
    item.heldBy = holder;
    item.flying = false;
    item.dealt = false;
    item.gripped = false;
    item.vel.set(0, 0, 0);
    return true;
  }

  /** Hang the prop on a hand socket. `lift` raises it during a throw telegraph. */
  grip(item: ThrowBody, socket: THREE.Object3D, lift = 0) {
    if (item.mesh.parent !== socket) socket.add(item.mesh);
    item.gripped = true;
    item.mesh.position.set(0.04, 0.02 + lift, 0.1);
    item.mesh.rotation.set(0.7, 0.15, 0.05);
    item.mesh.updateWorldMatrix(true, false);
    item.mesh.getWorldPosition(item.pos);
  }

  /** Drop the prop back into the arena so a throw can give it velocity. */
  releaseGrip(item: ThrowBody) {
    if (!item.gripped && item.mesh.parent === this.scene) return;
    item.mesh.updateWorldMatrix(true, false);
    item.mesh.getWorldPosition(item.pos);
    this.scene.add(item.mesh);
    item.gripped = false;
  }

  /**
   * Loose throw. `error` is metres of sideways miss at the target, so a
   * nervous civilian does not track the Ryder like a missile.
   */
  throwAt(
    item: ThrowBody,
    from: THREE.Vector3,
    aim: THREE.Vector3,
    error: number,
    thrower: object,
    time: number,
  ) {
    if (item.heldBy !== thrower && item.heldBy) return;
    const gripped = item.gripped;
    this.releaseGrip(item);
    const origin = gripped ? item.pos.clone() : from.clone();
    const dest = aim.clone();
    dest.x += error;
    dest.z += error * 0.65;
    const dir = dest.sub(origin);
    dir.y = 0.15 + Math.min(0.45, dir.length() * 0.04);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0.2, 1);
    dir.normalize();
    item.heldBy = null;
    item.lastThrower = thrower;
    item.safeUntil = time + 0.28;
    item.flying = true;
    item.dealt = false;
    item.pos.copy(origin);
    item.pos.y = Math.max(item.pos.y, 1.05);
    item.vel.copy(dir).multiplyScalar(item.stats.throwForce);
    item.vel.y += 2.2;
  }

  holdPosition(item: ThrowBody, x: number, y: number, z: number) {
    item.pos.set(x, y, z);
    item.mesh.position.copy(item.pos);
    item.mesh.rotation.x = 0.4;
  }

  update(
    dt: number,
    time: number,
    groundAt: (x: number, z: number) => number,
    onImpact: (item: ThrowBody, point: THREE.Vector3) => void,
  ) {
    for (const item of this.items) {
      if (item.broken) continue;
      if (item.heldBy) {
        if (!item.gripped) item.mesh.position.copy(item.pos);
        else {
          item.mesh.updateWorldMatrix(true, false);
          item.mesh.getWorldPosition(item.pos);
        }
        continue;
      }
      if (!item.flying) {
        item.mesh.position.set(item.pos.x, groundAt(item.pos.x, item.pos.z), item.pos.z);
        continue;
      }
      item.vel.y -= 14 * dt;
      item.pos.addScaledVector(item.vel, dt);
      item.spin += dt * 8;
      const ground = groundAt(item.pos.x, item.pos.z);
      if (item.pos.y <= ground + 0.05 && item.vel.y < 0) {
        item.pos.y = ground;
        item.vel.multiplyScalar(0.2);
        item.vel.y = 0;
        if (item.vel.lengthSq() < 1.2) {
          item.flying = false;
          item.vel.set(0, 0, 0);
        }
        if (item.stats.breakable && item.dealt) item.broken = true;
      }
      item.mesh.position.copy(item.pos);
      item.mesh.rotation.x = item.spin;
      item.mesh.rotation.z = item.spin * 0.4;
      if (item.flying && !item.dealt && time >= item.safeUntil) onImpact(item, item.pos);
      if (item.broken) item.mesh.visible = false;
    }
  }

  dispose() {
    for (const item of this.items) {
      this.scene.remove(item.mesh);
      item.mesh.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
      });
    }
    this.items.length = 0;
  }
}
