import * as THREE from 'three';

/**
 * Load-time geometry repairs for known defects in generated (Tripo) models.
 * Each repair is opt-in per model so a legitimately multi-shell figure (hair,
 * jackets, straps) is never touched by accident.
 */
export interface GlbRepair {
  /**
   * Drop every triangle island that is not connected to the main body and
   * sits entirely below this bone's joint. Generators sometimes leave a second,
   * floating copy of the legs under the hips; the auto-rigger then centres the
   * leg bones between the two copies so neither ever lines up.
   */
  dropDetachedBelow?: string;
}

const _joint = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function applyGlbRepair(root: THREE.Object3D, repair: GlbRepair, label: string) {
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    if (repair.dropDetachedBelow) {
      const dropped = dropDetachedShellsBelow(mesh, repair.dropDetachedBelow);
      if (dropped) {
        console.info(
          '[raid] %s: removed %d detached shell(s), %d triangles, floating below %s',
          label,
          dropped.shells,
          dropped.triangles,
          repair.dropDetachedBelow,
        );
      }
    }
  });
}

/**
 * Islands are found over the index buffer with coincident vertices merged, so
 * UV/normal seams do not split a shell. The largest island is the body and is
 * always kept. Returns null when nothing qualified.
 */
function dropDetachedShellsBelow(mesh: THREE.SkinnedMesh, boneName: string) {
  const geometry = mesh.geometry;
  const index = geometry.index;
  const position = geometry.attributes.position;
  if (!index || !position) return null;
  const boneIndex = mesh.skeleton.bones.findIndex((b) => b.name === boneName);
  if (boneIndex < 0) return null;

  // Joint position expressed in the geometry's own space.
  _m.copy(mesh.skeleton.boneInverses[boneIndex]).invert().premultiply(mesh.bindMatrixInverse);
  _joint.setFromMatrixPosition(_m);
  const limitY = _joint.y;

  const count = position.count;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i += 1) parent[i] = i;
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const indices = index.array;
  for (let t = 0; t < indices.length; t += 3) {
    union(indices[t], indices[t + 1]);
    union(indices[t + 1], indices[t + 2]);
  }
  const byPosition = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(position.getX(i) * 2000)},${Math.round(position.getY(i) * 2000)},${Math.round(position.getZ(i) * 2000)}`;
    const other = byPosition.get(key);
    if (other === undefined) byPosition.set(key, i);
    else union(i, other);
  }

  const size = new Map<number, number>();
  const top = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const r = find(i);
    size.set(r, (size.get(r) ?? 0) + 1);
    top.set(r, Math.max(top.get(r) ?? -Infinity, position.getY(i)));
  }
  let body = -1;
  let bodySize = 0;
  for (const [r, n] of size) {
    if (n > bodySize) {
      body = r;
      bodySize = n;
    }
  }
  const drop = new Set<number>();
  for (const [r, maxY] of top) {
    if (r !== body && maxY < limitY) drop.add(r);
  }
  if (!drop.size) return null;

  const kept: number[] = [];
  let triangles = 0;
  for (let t = 0; t < indices.length; t += 3) {
    if (drop.has(find(indices[t]))) {
      triangles += 1;
      continue;
    }
    kept.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  geometry.setIndex(kept);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { shells: drop.size, triangles };
}
