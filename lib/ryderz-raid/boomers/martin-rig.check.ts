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
  assert.equal(skeleton.isUsable, true, 'the Tripo bones map to a humanoid');
  const pose = (motion: SkeletalMotion) => {
    poseSkeleton(skeleton, motion);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
  };
  pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0 });

  scene.rotation.y = martin.modelYaw ?? 0;
  scene.updateMatrixWorld(true);
  const head = skeleton.bone('head')!;
  const eyeL = skeleton.bone('eyeL')!;
  const eyeR = skeleton.bone('eyeR')!;
  const towardEyes = eyeL
    .getWorldPosition(new THREE.Vector3())
    .add(eyeR.getWorldPosition(new THREE.Vector3()))
    .multiplyScalar(0.5)
    .sub(head.getWorldPosition(new THREE.Vector3()));
  towardEyes.y = 0;
  towardEyes.normalize();
  assert.ok(towardEyes.z > 0.5, `martin should face raid-forward, eye facing z=${towardEyes.z.toFixed(2)}`);

  const hand = skeleton.bone('handR')!.getWorldPosition(new THREE.Vector3());
  const shoulder = skeleton.bone('upperArmR')!.getWorldPosition(new THREE.Vector3());
  const elbow = skeleton.bone('lowerArmR')!.getWorldPosition(new THREE.Vector3());
  assert.ok(hand.y < shoulder.y - 0.12, `the arms should hang, hand y=${hand.y.toFixed(2)} shoulder y=${shoulder.y.toFixed(2)}`);
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
