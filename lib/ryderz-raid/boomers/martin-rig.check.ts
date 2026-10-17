import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RYDERZ } from '../config';
import { reskinRigidSkeleton } from '../rigid-skin';
import { assessSkinning, poseSkeleton, ProceduralSkeleton, type SkeletalMotion } from '../skeletal';

/**
 * Martin's Tripo export has a humanoid skeleton and a mesh welded to Hips.
 * The shared reskin has to paint the limbs, and the squared stance has to
 * leave him facing raid-forward with his arms down. Walk, punch, and kick
 * then have to actually move those limbs.
 */
async function main() {
  (globalThis as { self?: unknown }).self = globalThis;
  const file = readFileSync(
    fileURLToPath(new URL('../../../public/assets/those-ryderz/models/boomers/martin-luther-king.glb', import.meta.url)),
  );
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    new GLTFLoader().parse(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
      '',
      resolve,
      reject,
    );
  });
  const scene = gltf.scene;
  const mesh = scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
  assert.ok(mesh?.isSkinnedMesh, 'martin ships a skinned mesh');

  assert.equal(reskinRigidSkeleton(scene), true, 'the hips weld is repainted onto the limbs');
  assert.deepEqual(assessSkinning(scene), [], 'the repainted skin stays on the bones it cites');

  const martin = RYDERZ['martin-luther-king'];
  const skeleton = new ProceduralSkeleton(scene, { keep: martin.skelKeep });
  skeleton.armHang = martin.armHang ?? 0;
  skeleton.shoulderDrop = martin.shoulderDrop ?? 0;
  assert.equal(skeleton.isUsable, true, 'the Tripo bones map to a humanoid');
  const pose = (motion: SkeletalMotion) => {
    poseSkeleton(skeleton, motion);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
  };
  pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0 });

  scene.rotation.y = martin.modelYaw ?? 0;
  scene.updateMatrixWorld(true);
  mesh.skeleton.update();
  const sample = new THREE.Vector3();
  const crown: THREE.Vector3[] = [];
  const positionAttr = mesh.geometry.getAttribute('position');
  const sampleStep = Math.max(1, Math.floor(positionAttr.count / 5000));
  for (let i = 0; i < positionAttr.count; i += sampleStep) {
    mesh.getVertexPosition(i, sample);
    sample.applyMatrix4(mesh.matrixWorld);
    crown.push(sample.clone());
  }
  const top = crown.reduce((max, point) => Math.max(max, point.y), -Infinity);
  const height = top - crown.reduce((min, point) => Math.min(min, point.y), Infinity);
  const headPts = crown.filter((point) => point.y > top - height * 0.18 && Math.abs(point.x) < 0.16);
  const mid = headPts.filter((point) => Math.abs(point.x - 0) < 0.04);
  assert.ok(mid.length > 20, 'the head midline has vertices to read a face from');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of headPts) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const earSpan = maxX - minX;
  const faceDepth = maxZ - minZ;
  assert.ok(earSpan > faceDepth, `martin should face the camera, not stand sideways (ears ${earSpan.toFixed(3)}, depth ${faceDepth.toFixed(3)})`);
  const nose = mid.reduce((best, point) => (point.z > best.z ? point : best));
  assert.ok(nose.z > 0.04, `the nose should point raid-forward, z=${nose.z.toFixed(3)}`);

  const hand = skeleton.bone('handR')!.getWorldPosition(new THREE.Vector3());
  const shoulder = skeleton.bone('upperArmR')!.getWorldPosition(new THREE.Vector3());
  const elbow = skeleton.bone('lowerArmR')!.getWorldPosition(new THREE.Vector3());
  assert.ok(hand.y < shoulder.y - 0.12, `the arms should hang, hand y=${hand.y.toFixed(2)} shoulder y=${shoulder.y.toFixed(2)}`);
  const clavicle = skeleton.bone('shoulderR')!.getWorldPosition(new THREE.Vector3());
  const upper = skeleton.bone('upperArmR')!.getWorldPosition(new THREE.Vector3());
  const clav = upper.clone().sub(clavicle);
  assert.ok(-clav.y / clav.length() > 0.08, `the shoulders should rest down, not shrugged (down=${(-clav.y / clav.length()).toFixed(2)})`);
  assert.ok(upper.x > clavicle.x - 0.01, `the right shoulder should stay out from the chest (arm x=${upper.x.toFixed(2)}, shoulder x=${clavicle.x.toFixed(2)})`);
  const forearmDrop = elbow.y - hand.y;
  const forearmReach = Math.hypot(hand.x - elbow.x, hand.z - elbow.z);
  assert.ok(
    forearmDrop > forearmReach,
    `the elbow should hang (drop ${forearmDrop.toFixed(3)}, out ${forearmReach.toFixed(3)})`,
  );

  const bones = mesh.skeleton.bones;
  const armBones = new Set(
    bones.map((bone, index) => (/Right_UpperArm|Right_LowerArm|Right_Hand/.test(bone.name) ? index : -1)).filter((index) => index >= 0),
  );
  const legBones = new Set(
    bones.map((bone, index) => (/Right_UpperLeg|Right_LowerLeg|Right_Foot/.test(bone.name) ? index : -1)).filter((index) => index >= 0),
  );
  const indexAttr = mesh.geometry.getAttribute('skinIndex');
  const weightAttr = mesh.geometry.getAttribute('skinWeight');
  const armVerts: number[] = [];
  const legVerts: number[] = [];
  const stride = Math.max(1, Math.floor(indexAttr.count / 2500));
  for (let i = 0; i < indexAttr.count; i += stride) {
    let arm = 0;
    let leg = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = weightAttr.getComponent(i, k);
      const bone = indexAttr.getComponent(i, k);
      if (armBones.has(bone)) arm += weight;
      if (legBones.has(bone)) leg += weight;
    }
    if (arm > 0.2) armVerts.push(i);
    if (leg > 0.2) legVerts.push(i);
  }
  assert.ok(armVerts.length > 8, 'the right arm has its own skin');
  assert.ok(legVerts.length > 8, 'the right leg has its own skin');

  const point = new THREE.Vector3();
  const capture = (verts: number[]) => {
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    return verts.map((vertex) => {
      mesh.getVertexPosition(vertex, point);
      return point.clone();
    });
  };
  const travel = (from: THREE.Vector3[], to: THREE.Vector3[]) => {
    let max = 0;
    from.forEach((start, index) => {
      max = Math.max(max, start.distanceTo(to[index]));
    });
    return max;
  };
  const idleLegs = capture(legVerts);
  const idleArms = capture(armVerts);
  pose({ phase: 1.2, moving: 1, sprinting: false, meleeT: 0 });
  const walk = travel(idleLegs, capture(legVerts));
  pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0.35, meleeStyle: 'punch' });
  const punch = travel(idleArms, capture(armVerts));
  pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0.35, meleeStyle: 'kick' });
  const kick = travel(idleLegs, capture(legVerts));
  assert.ok(walk > 0.03, `walk should swing a leg, moved ${walk.toFixed(3)}`);
  assert.ok(punch > 0.04, `punch should move the arm, moved ${punch.toFixed(3)}`);
  assert.ok(kick > 0.05, `kick should swing the leg, moved ${kick.toFixed(3)}`);
  console.log('martin rig ok', { walk, punch, kick });
}

main();
