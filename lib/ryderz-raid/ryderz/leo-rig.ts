import * as THREE from 'three';
import { bakeSkinnedMeshes } from '../skeletal';
import { paintBodyWeights } from '../rigid-skin';

type Joint = [name: string, parent: string | null, point: [number, number, number]];

/** Keep the supplied torso and arm build while unfolding only the legs. */
export const LEO_REST_KEEP = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR',
  'lowerArmL', 'lowerArmR', 'handL', 'handR',
] as const;

/** Leo's new export has a folded right leg, not a standing calf below each knee. */
const JOINTS: Joint[] = [
  ['Hips', null, [-0.065, 0.535, 0.03]],
  ['Spine', 'Hips', [-0.085, 0.59, 0.035]],
  ['Chest', 'Spine', [-0.09, 0.65, 0.025]],
  ['UpperChest', 'Chest', [-0.08, 0.71, 0.025]],
  ['Neck', 'UpperChest', [-0.07, 0.78, 0.02]],
  ['Head', 'Neck', [-0.06, 0.815, 0.025]],
  ['Left_Eye', 'Head', [-0.005, 0.85, 0.085]],
  ['Right_Eye', 'Head', [-0.055, 0.86, 0.1]],
  ['Left_Shoulder', 'UpperChest', [-0.045, 0.75, 0.005]],
  ['Left_UpperArm', 'Left_Shoulder', [0.01, 0.735, -0.015]],
  ['Left_LowerArm', 'Left_UpperArm', [0.14, 0.68, -0.035]],
  ['Left_Hand', 'Left_LowerArm', [0.27, 0.715, -0.015]],
  ['Right_Shoulder', 'UpperChest', [-0.11, 0.76, 0.035]],
  ['Right_UpperArm', 'Right_Shoulder', [-0.17, 0.73, 0.065]],
  ['Right_LowerArm', 'Right_UpperArm', [-0.25, 0.60, 0.08]],
  ['Right_Hand', 'Right_LowerArm', [-0.33, 0.49, 0.14]],
  ['Left_UpperLeg', 'Hips', [0, 0.53, 0.045]],
  ['Left_LowerLeg', 'Left_UpperLeg', [0.13, 0.31, 0.06]],
  ['Left_Foot', 'Left_LowerLeg', [0.26, 0.125, 0.035]],
  ['Left_Toes', 'Left_Foot', [0.265, 0.025, 0.06]],
  ['Right_UpperLeg', 'Hips', [-0.12, 0.49, 0.015]],
  ['Right_LowerLeg', 'Right_UpperLeg', [-0.045, 0.235, 0.055]],
  ['Right_Foot', 'Right_LowerLeg', [0.055, 0.415, -0.13]],
  ['Right_Toes', 'Right_Foot', [0.15, 0.465, -0.18]],
];

/** Rebuild the hips-welded export in its visible pose before any neutralisation. */
export function rigLeoBody(root: THREE.Object3D) {
  bakeSkinnedMeshes(root);
  let source: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && (!source || mesh.geometry.getAttribute('position').count > source.geometry.getAttribute('position').count)) source = mesh;
  });
  if (!source) return false;
  const body = source as THREE.Mesh;
  const geometry = body.geometry.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  if (height <= 0) return false;
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(1 / height, 1 / height, 1 / height);
  const mesh = new THREE.SkinnedMesh(geometry, body.material);
  mesh.name = 'LeoFittedBody';
  mesh.frustumCulled = false;
  root.add(mesh);
  body.removeFromParent();
  const bones: THREE.Bone[] = [];
  const byName = new Map<string, THREE.Bone>();
  for (const [name, parentName, coords] of JOINTS) {
    const bone = new THREE.Bone();
    bone.name = name;
    const parent = parentName ? byName.get(parentName)! : mesh;
    const point = new THREE.Vector3(...coords);
    const child = JOINTS.find((joint) => joint[1] === name);
    const aim = child ? new THREE.Vector3(...child[2]).sub(point).normalize() : new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);
    const world = new THREE.Matrix4().compose(point, rotation, new THREE.Vector3(1, 1, 1));
    root.updateMatrixWorld(true);
    const local = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(world);
    local.decompose(bone.position, bone.quaternion, bone.scale);
    parent.add(bone);
    bones.push(bone);
    byName.set(name, bone);
  }
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  paintBodyWeights(mesh, bones.map((bone) => bone.matrixWorld.clone()), true);
  return true;
}
