import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { instanceMatrices } from './instancing';

/**
 * Nearest solid along a ray, for the camera boom and the crosshair.
 *
 * `LegacyOcclusion` is the path the game shipped with: three's Raycaster
 * against every occluder, which tests each triangle of each mesh the infinite
 * ray's bounding sphere touches. On The Block that is about 2.3 million
 * triangles behind 224 occluders, five rays a frame.
 *
 * `BvhOcclusion` gives the same answer from a bounding-volume tree per
 * geometry. Occluders the segment cannot reach are skipped by their bounds,
 * and the rest cost a tree walk instead of a triangle sweep. It also reads
 * instanced copies from the full list rather than the frustum-trimmed draw
 * buffer, so a building outside the view still stops the camera.
 */
export interface Occlusion {
  /** Distance to the first solid within `far`, or Infinity. `ray.direction` must be unit length. */
  cast(ray: THREE.Ray, far: number): number;
}

export class LegacyOcclusion implements Occlusion {
  private raycaster = new THREE.Raycaster();

  constructor(private occluders: () => THREE.Object3D[]) {}

  cast(ray: THREE.Ray, far: number) {
    this.raycaster.ray.copy(ray);
    this.raycaster.near = 0;
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.occluders(), false);
    return hits.length ? hits[0].distance : Infinity;
  }
}

/** One placed copy of a geometry: a plain mesh has one, an instanced batch one per copy. */
interface Part {
  world: THREE.Matrix4;
  inverse: THREE.Matrix4;
  centre: THREE.Vector3;
  radius: number;
}

interface Entry {
  mesh: THREE.Mesh;
  bvh: MeshBVH | null;
  /** Copies of an instanced batch in its own space. Null for a plain mesh. */
  copies: readonly THREE.Matrix4[] | null;
  parts: Part[];
  /** The mesh's world matrix when `parts` was computed. The world is static, so this rarely changes. */
  stamp: Float64Array;
}

/** Longest a single cast may spend building trees before it falls back for the rest. */
const BUILD_BUDGET_MS = 5;

const trees = new WeakMap<THREE.BufferGeometry, MeshBVH | false>();

const _local = new THREE.Ray();
const _sphere = new THREE.Sphere();
const _point = new THREE.Vector3();
const _toCentre = new THREE.Vector3();

function place(entry: Entry) {
  const { mesh, copies } = entry;
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere!;
  const count = copies ? copies.length : 1;
  entry.parts = [];
  for (let i = 0; i < count; i += 1) {
    const world = copies ? new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, copies[i]) : mesh.matrixWorld.clone();
    _sphere.copy(bounds).applyMatrix4(world);
    entry.parts.push({ world, inverse: world.clone().invert(), centre: _sphere.center.clone(), radius: _sphere.radius });
  }
  entry.stamp.set(mesh.matrixWorld.elements);
}

function moved(entry: Entry) {
  const now = entry.mesh.matrixWorld.elements;
  const then = entry.stamp;
  for (let i = 0; i < 16; i += 1) if (now[i] !== then[i]) return true;
  return false;
}

function buildable(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return false;
  // A posed body does not match its rest geometry; three's own raycast handles those.
  return !((mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.morphTargetInfluences?.length);
}

export class BvhOcclusion implements Occlusion {
  private entries: Entry[] = [];
  /** Occluders with no tree (lines, sprites, skinned meshes): three's raycast handles them. */
  private others: THREE.Object3D[] = [];
  private seen: THREE.Object3D[] = [];
  private pending = 0;
  private fallback = new THREE.Raycaster();
  private now: () => number;

  constructor(
    private occluders: () => THREE.Object3D[],
    now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  ) {
    this.now = now;
  }

  /** Trees still waiting to be built. Zero once the arena is fully indexed. */
  get pendingTrees() {
    return this.pending;
  }

  /** Arenas load buildings and props late and swap them into the list in place, so the list is re-read when it changes. */
  private sync() {
    const list = this.occluders();
    let same = list.length === this.seen.length;
    for (let i = 0; same && i < list.length; i += 1) same = list[i] === this.seen[i];
    if (!same) {
      this.seen = list.slice();
      this.entries = [];
      this.others = [];
      for (const obj of list) {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !buildable(mesh)) {
          this.others.push(obj);
          continue;
        }
        const batch = mesh as THREE.InstancedMesh;
        let copies: readonly THREE.Matrix4[] | null = null;
        if (batch.isInstancedMesh) {
          copies = instanceMatrices(batch);
          if (!copies) {
            const own: THREE.Matrix4[] = [];
            for (let i = 0; i < batch.count; i += 1) {
              const m = new THREE.Matrix4();
              batch.getMatrixAt(i, m);
              own.push(m);
            }
            copies = own;
          }
        }
        const tree = trees.get(mesh.geometry);
        this.entries.push({ mesh, bvh: tree || null, copies, parts: [], stamp: new Float64Array(16).fill(NaN) });
      }
      this.pending = this.entries.filter((entry) => !entry.bvh && trees.get(entry.mesh.geometry) !== false).length;
    }
    if (this.pending > 0) this.build();
  }

  private build() {
    const start = this.now();
    let left = 0;
    for (const entry of this.entries) {
      if (entry.bvh) continue;
      const geometry = entry.mesh.geometry;
      let tree = trees.get(geometry);
      if (tree === false) continue;
      if (!tree) {
        if (this.now() - start > BUILD_BUDGET_MS) {
          left += 1;
          continue;
        }
        try {
          // Indirect: the tree keeps its own triangle order and leaves the render index alone.
          tree = new MeshBVH(geometry, { indirect: true, setBoundingBox: false });
        } catch {
          tree = false;
        }
        trees.set(geometry, tree);
        if (!tree) continue;
      }
      entry.bvh = tree;
    }
    this.pending = left;
  }

  cast(ray: THREE.Ray, far: number) {
    this.sync();
    let best = Infinity;
    let slow: THREE.Object3D[] | null = null;
    for (const entry of this.entries) {
      const { mesh, bvh } = entry;
      if (!bvh) {
        // Not indexed yet, or it cannot be: the original test still answers.
        (slow ??= []).push(mesh);
        continue;
      }
      if (moved(entry)) place(entry);
      const parts = entry.parts;
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const reach = far < best ? far : best;
        // Skip anything the segment cannot touch before walking its tree.
        _toCentre.subVectors(part.centre, ray.origin);
        const forward = _toCentre.dot(ray.direction);
        const along = forward < 0 ? 0 : forward > reach ? reach : forward;
        const gap2 = _toCentre.lengthSq() - 2 * along * forward + along * along;
        if (gap2 > part.radius * part.radius) continue;
        _local.copy(ray).applyMatrix4(part.inverse);
        const hit = bvh.raycastFirst(_local, mesh.material);
        if (!hit) continue;
        const distance = _point.copy(hit.point).applyMatrix4(part.world).distanceTo(ray.origin);
        if (distance <= reach) best = distance;
      }
    }
    if (slow || this.others.length) {
      this.fallback.ray.copy(ray);
      this.fallback.near = 0;
      this.fallback.far = Math.min(far, best);
      const hits = this.fallback.intersectObjects(slow ? slow.concat(this.others) : this.others, false);
      if (hits.length && hits[0].distance < best) best = hits[0].distance;
    }
    return best <= far ? best : Infinity;
  }
}
