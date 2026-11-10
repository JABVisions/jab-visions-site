import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bake the plain static meshes under `root` into one mesh per material, so a
 * street of poles, curbs, lamp heads and lane paint is a handful of draw calls.
 * Only leaf meshes with no userData, no special render state and nothing in `keep` are
 * touched, so anything the game finds, moves, swaps or raycasts stays as it
 * was. Returns the merged geometries for disposal.
 */
export function mergeStatic(root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (mesh === root || keep.has(mesh) || mesh.children.length || Object.keys(mesh.userData).length) return;
    if (!mesh.visible || !mesh.frustumCulled || mesh.renderOrder !== 0 || mesh.morphTargetInfluences) return;
    const material = mesh.material;
    // Transparent surfaces merge only as decals (no depth write), where draw order inside one material never shows.
    if (Array.isArray(material) || (material.transparent && material.depthWrite) || (material as THREE.ShaderMaterial).isShaderMaterial) return;
    for (let p = mesh.parent; p && p !== root; p = p.parent) {
      if (keep.has(p) || Object.keys(p.userData).length) return;
    }
    const geo = mesh.geometry;
    const attrs = Object.keys(geo.attributes).sort().join(',');
    const key = `${material.uuid}|${attrs}|${geo.index ? 'i' : 'n'}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}`;
    const list = buckets.get(key);
    if (list) list.push(mesh);
    else buckets.set(key, [mesh]);
  });

  const geometries: THREE.BufferGeometry[] = [];
  const local = new THREE.Matrix4();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(local.multiplyMatrices(toRoot, mesh.matrixWorld)));
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) continue;
    const first = meshes[0];
    const batch = new THREE.Mesh(merged, first.material);
    batch.name = 'static-batch';
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    root.add(batch);
    meshes.forEach((mesh) => mesh.removeFromParent());
    geometries.push(merged);
  }
  return geometries;
}

/**
 * Collapse every copy of an imported model under `parent` into one
 * InstancedMesh per part, so a street of identical cars or trees costs one
 * draw call per part instead of one per part per copy. Copies must be clones
 * of the same template (they share geometry and material) and must not move
 * afterwards. Returns the instanced meshes and the meshes they replaced so
 * callers can swap them in occluder lists.
 */
export function instanceCopies(parent: THREE.Object3D, roots: THREE.Object3D[], name: string) {
  parent.updateMatrixWorld(true);
  const toParent = parent.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const root of roots) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
      if (Array.isArray(mesh.material)) return;
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
      const list = buckets.get(key);
      if (list) list.push(mesh);
      else buckets.set(key, [mesh]);
    });
  }

  const instanced: THREE.InstancedMesh[] = [];
  const replaced: THREE.Mesh[] = [];
  const local = new THREE.Matrix4();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = name;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    meshes.forEach((mesh, i) => {
      batch.setMatrixAt(i, local.multiplyMatrices(toParent, mesh.matrixWorld));
      mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    track(batch);
    parent.add(batch);
    instanced.push(batch);
    replaced.push(...meshes);
  }
  return { instanced, replaced };
}

/** Swap replaced meshes for their instanced batches in an occluder list, in place. */
export function swapOccluders(occluders: THREE.Object3D[], swap: { instanced: THREE.InstancedMesh[]; replaced: THREE.Mesh[] }) {
  const gone = new Set<THREE.Object3D>(swap.replaced);
  let hadAny = false;
  for (let i = occluders.length - 1; i >= 0; i -= 1) {
    if (gone.has(occluders[i])) {
      occluders.splice(i, 1);
      hadAny = true;
    }
  }
  if (hadAny) occluders.push(...swap.instanced);
}

/**
 * One InstancedMesh draws every copy it holds, so without help a district's
 * worth of cars would all be drawn whenever one is in view. Each frame the
 * copies inside the camera or the sun's shadow box are packed to the front of
 * the instance buffer and the draw count trimmed to them.
 */
interface Tracked {
  batch: THREE.InstancedMesh;
  matrices: THREE.Matrix4[];
  spheres: THREE.Sphere[];
  key: number;
}

const tracked = new Set<Tracked>();

function track(batch: THREE.InstancedMesh) {
  const geometry = batch.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const matrices: THREE.Matrix4[] = [];
  const spheres: THREE.Sphere[] = [];
  for (let i = 0; i < batch.count; i += 1) {
    const m = new THREE.Matrix4();
    batch.getMatrixAt(i, m);
    matrices.push(m);
    spheres.push(geometry.boundingSphere!.clone());
  }
  tracked.add({ batch, matrices, spheres, key: -1 });
}

const _world = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

function shownInScene(obj: THREE.Object3D) {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (!o.visible) return false;
    if ((o as THREE.Scene).isScene) return true;
  }
  return false;
}

/** Trim every tracked batch to the copies either frustum can see. */
export function cullInstances(frustums: THREE.Frustum[]) {
  for (const entry of tracked) {
    const { batch, matrices, spheres } = entry;
    if (!shownInScene(batch)) continue;
    batch.parent!.updateWorldMatrix(true, false);
    let shown = 0;
    let key = 0;
    for (let i = 0; i < matrices.length; i += 1) {
      _world.multiplyMatrices(batch.parent!.matrixWorld, matrices[i]);
      _sphere.copy(spheres[i]).applyMatrix4(_world);
      if (!frustums.some((f) => f.intersectsSphere(_sphere))) continue;
      batch.setMatrixAt(shown, matrices[i]);
      shown += 1;
      key = (Math.imul(key, 31) + i + 1) | 0;
    }
    key = (Math.imul(key, 31) + shown) | 0;
    batch.count = shown;
    if (key !== entry.key) {
      entry.key = key;
      batch.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Stop tracking batches under `root`, or every batch when no root is given. */
export function untrackInstances(root?: THREE.Object3D) {
  for (const entry of tracked) {
    if (!root) {
      tracked.delete(entry);
      continue;
    }
    for (let o: THREE.Object3D | null = entry.batch; o; o = o.parent) {
      if (o === root) {
        tracked.delete(entry);
        break;
      }
    }
  }
}
