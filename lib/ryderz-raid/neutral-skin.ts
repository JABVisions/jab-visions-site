import * as THREE from 'three';
import { ProceduralSkeleton, type BoneKey } from './skeletal';

/**
 * Rebase a posed export once, preserving volume while unfolding bent joints.
 * Ordinary linear skinning collapses Leo's deeply folded knee when the game
 * straightens it. Dual-quaternion blending preserves the cross-section during
 * that conversion; subsequent gameplay uses the normal GPU skinning path.
 * Reference: https://users.cs.utah.edu/~ladislav/dq/index.html
 */
export function rebaseNeutralSkin(root: THREE.Object3D, keep: BoneKey[] = []) {
  const pose = new ProceduralSkeleton(root, { keep });
  if (!pose.isUsable) return false;
  pose.apply();
  root.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
  });

  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const indices = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    if (!position || !indices || !weights) continue;
    const transforms = mesh.skeleton.bones.map((bone, index) => {
      const matrix = new THREE.Matrix4().copy(mesh.bindMatrixInverse)
        .multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[index]).multiply(mesh.bindMatrix);
      const translation = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(translation, rotation, scale);
      const dual = new THREE.Quaternion(translation.x, translation.y, translation.z, 0).multiply(rotation);
      return { rotation, scale: scale.x, dual: new THREE.Vector4(dual.x, dual.y, dual.z, dual.w).multiplyScalar(0.5) };
    });
    const xyz = new Float32Array(position.count * 3);
    const normals = normal ? new Float32Array(normal.count * 3) : null;
    const real = new THREE.Vector4();
    const dual = new THREE.Vector4();
    const rotation = new THREE.Quaternion();
    const translation = new THREE.Quaternion();
    const point = new THREE.Vector3();
    for (let v = 0; v < position.count; v += 1) {
      let dominant = 0;
      for (let k = 1; k < 4; k += 1) {
        if (weights.getComponent(v, k) > weights.getComponent(v, dominant)) dominant = k;
      }
      const reference = transforms[indices.getComponent(v, dominant)].rotation;
      real.set(0, 0, 0, 0);
      dual.set(0, 0, 0, 0);
      let scaleSum = 0;
      let weightSum = 0;
      for (let k = 0; k < 4; k += 1) {
        const transform = transforms[indices.getComponent(v, k)];
        const sign = reference.dot(transform.rotation) < 0 ? -1 : 1;
        const weight = weights.getComponent(v, k) * sign;
        scaleSum += transform.scale * Math.abs(weight);
        weightSum += Math.abs(weight);
        real.x += transform.rotation.x * weight;
        real.y += transform.rotation.y * weight;
        real.z += transform.rotation.z * weight;
        real.w += transform.rotation.w * weight;
        dual.addScaledVector(transform.dual, weight);
      }
      const length = real.length();
      if (length < 1e-8) {
        real.set(0, 0, 0, 1);
        dual.set(0, 0, 0, 0);
      } else {
        real.multiplyScalar(1 / length);
        dual.multiplyScalar(1 / length);
        dual.addScaledVector(real, -real.dot(dual));
      }
      rotation.set(real.x, real.y, real.z, real.w);
      translation.set(dual.x, dual.y, dual.z, dual.w).multiply(rotation.clone().conjugate());
      point.fromBufferAttribute(position, v).multiplyScalar(weightSum > 0 ? scaleSum / weightSum : 1).applyQuaternion(rotation);
      point.x += 2 * translation.x;
      point.y += 2 * translation.y;
      point.z += 2 * translation.z;
      point.toArray(xyz, v * 3);
      if (normal && normals) point.fromBufferAttribute(normal, v).applyQuaternion(rotation).normalize().toArray(normals, v * 3);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    if (normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const triangles = geometry.index;
    if (triangles) {
      const mobility = new Float32Array(position.count);
      for (let v = 0; v < position.count; v += 1) {
        let strongest = 0;
        for (let k = 0; k < 4; k += 1) strongest = Math.max(strongest, weights.getComponent(v, k));
        mobility[v] = (1 - strongest) ** 2;
      }
      const edges = new Map<string, [number, number, number]>();
      for (let t = 0; t < triangles.count; t += 3) {
        for (let k = 0; k < 3; k += 1) {
          const a = triangles.getX(t + k), b = triangles.getX(t + (k + 1) % 3);
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          if (edges.has(key)) continue;
          const length = Math.hypot(position.getX(a) - position.getX(b), position.getY(a) - position.getY(b), position.getZ(a) - position.getZ(b));
          edges.set(key, [a, b, length]);
        }
      }
      // Keep ambiguous joint seams from turning into long ribbons when a
      // folded limb is unfolded. Confidently bound limb surfaces stay pinned.
      for (let pass = 0; pass < 30; pass += 1) {
        for (const [a, b, rest] of edges.values()) {
          const dx = xyz[b * 3] - xyz[a * 3], dy = xyz[b * 3 + 1] - xyz[a * 3 + 1], dz = xyz[b * 3 + 2] - xyz[a * 3 + 2];
          const length = Math.hypot(dx, dy, dz), total = mobility[a] + mobility[b];
          if (length <= rest * 1.5 || total < 1e-4) continue;
          const correction = (length - rest * 1.5) / length * 0.5;
          const wa = correction * mobility[a] / total, wb = correction * mobility[b] / total;
          xyz[a * 3] += dx * wa; xyz[a * 3 + 1] += dy * wa; xyz[a * 3 + 2] += dz * wa;
          xyz[b * 3] -= dx * wb; xyz[b * 3 + 1] -= dy * wb; xyz[b * 3 + 2] -= dz * wb;
        }
      }
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  }
  // All meshes sharing a skeleton must be baked before its inverses change.
  const skeletons = new Set(meshes.map((mesh) => mesh.skeleton));
  skeletons.forEach((skeleton) => skeleton.calculateInverses());
  meshes.forEach((mesh) => { mesh.normalizeSkinWeights(); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); });
  return meshes.length > 0;
}
