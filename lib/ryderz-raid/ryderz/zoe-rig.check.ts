import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RYDERZ } from '../config';
import { reskinRigidSkeleton } from '../rigid-skin';
import { assessSkinning, poseSkeleton, ProceduralSkeleton, type SkeletalMotion } from '../skeletal';

/** The previous Zoe build. The updated mesh is skinned onto this same list. */
const SKELETON: Record<string, string | null> = {
  Hips: null,
  Spine: 'Hips',
  Chest: 'Spine',
  UpperChest: 'Chest',
  Neck: 'UpperChest',
  Head: 'Neck',
  Left_Eye: 'Head',
  Right_Eye: 'Head',
  Right_Shoulder: 'UpperChest',
  Right_UpperArm: 'Right_Shoulder',
  Right_LowerArm: 'Right_UpperArm',
  Right_Hand: 'Right_LowerArm',
  Left_Shoulder: 'UpperChest',
  Left_UpperArm: 'Left_Shoulder',
  Left_LowerArm: 'Left_UpperArm',
  Left_Hand: 'Left_LowerArm',
  Right_UpperLeg: 'Hips',
  Right_LowerLeg: 'Right_UpperLeg',
  Right_Foot: 'Right_LowerLeg',
  Right_Toes: 'Right_Foot',
  Left_UpperLeg: 'Hips',
  Left_LowerLeg: 'Left_UpperLeg',
  Left_Foot: 'Left_LowerLeg',
  Left_Toes: 'Left_Foot',
};

function strippedGlb(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const source = JSON.parse(bytes.slice(20, 20 + jsonLength).toString('utf8')) as {
    materials?: Array<{ normalTexture?: unknown; emissiveTexture?: unknown; pbrMetallicRoughness?: Record<string, unknown> }>;
    images?: unknown[];
    textures?: unknown[];
    animations?: unknown[];
  };
  for (const material of source.materials ?? []) {
    delete material.normalTexture;
    delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  source.images = [];
  source.textures = [];
  source.animations = [];
  const jsonChunk = Buffer.from(JSON.stringify(source));
  const jsonPad = Buffer.alloc((4 - (jsonChunk.length % 4)) % 4, 0x20);
  const binStart = 20 + jsonLength;
  const binLength = bytes.readUInt32LE(binStart);
  const bin = bytes.slice(binStart + 8, binStart + 8 + binLength);
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binHeader = Buffer.alloc(8);
  const total = 12 + 8 + jsonChunk.length + jsonPad.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length + jsonPad.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, jsonPad, binHeader, bin]);
}

async function main() {
  const file = strippedGlb(fileURLToPath(new URL('../../../public/assets/those-ryderz/models/zoe-folie.glb', import.meta.url)));
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
    new GLTFLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '', resolve, reject);
  });
  const scene = gltf.scene;
  assert.equal(gltf.animations.length, 0, 'the afraid clip is not part of the Zoe skeleton');

  const mesh = scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
  assert.ok(mesh?.isSkinnedMesh, 'zoe ships a skinned mesh');
  const bones = mesh.skeleton.bones;
  const names = bones.map((bone) => bone.name);
  assert.deepEqual(names, Object.keys(SKELETON), 'joint order matches the previous Zoe skeleton');
  for (const bone of bones) {
    const parent = (bone.parent as THREE.Bone | null)?.isBone ? bone.parent!.name : null;
    assert.equal(parent, SKELETON[bone.name], `${bone.name} hangs off ${parent}`);
    assert.equal(/mixamorig/i.test(bone.name), false, bone.name);
  }

  assert.equal(reskinRigidSkeleton(scene), false, 'the Mixamo weights already reach the limbs');
  assert.deepEqual(assessSkinning(scene), [], 'skin weights stay on the bones they cite');

  const zoe = RYDERZ.zoe;
  const skeleton = new ProceduralSkeleton(scene, { keep: zoe.skelKeep });
  assert.equal(skeleton.isUsable, true);
  for (const key of ['hips', 'spine', 'chest', 'upperChest', 'head', 'handL', 'handR', 'footL', 'footR', 'eyeL', 'eyeR'] as const) {
    assert.ok(skeleton.bone(key), key);
  }

  poseSkeleton(skeleton, { phase: 0, moving: 0, sprinting: false, meleeT: 0 });
  scene.updateMatrixWorld(true);
  const left = skeleton.bone('handL')!.getWorldPosition(new THREE.Vector3());
  const right = skeleton.bone('handR')!.getWorldPosition(new THREE.Vector3());
  const hips = skeleton.bone('hips')!.getWorldPosition(new THREE.Vector3());
  const footL = skeleton.bone('footL')!.getWorldPosition(new THREE.Vector3());
  const footR = skeleton.bone('footR')!.getWorldPosition(new THREE.Vector3());
  assert.ok(left.x > right.x, `her left hand stays on +X (${left.x.toFixed(3)} vs ${right.x.toFixed(3)})`);
  assert.ok(hips.y - footL.y > 0.35 && hips.y - footR.y > 0.35, 'the legs reach the ground instead of collapsing into the pelvis');
  assert.ok(footL.distanceTo(footR) > 0.12, `the stance keeps both feet, apart by ${footL.distanceTo(footR).toFixed(3)}`);

  const indexAttr = mesh.geometry.getAttribute('skinIndex');
  const weightAttr = mesh.geometry.getAttribute('skinWeight');
  const legBones = new Set(
    bones.map((bone, index) => (/^(Left|Right)_(UpperLeg|LowerLeg|Foot|Toes)$/.test(bone.name) ? index : -1)).filter((index) => index >= 0),
  );
  const legVerts: number[] = [];
  const stride = Math.max(1, Math.floor(indexAttr.count / 2000));
  for (let i = 0; i < indexAttr.count; i += stride) {
    let leg = 0;
    for (let k = 0; k < 4; k += 1) if (legBones.has(indexAttr.getComponent(i, k))) leg += weightAttr.getComponent(i, k);
    if (leg > 0.45) legVerts.push(i);
  }
  assert.ok(legVerts.length > 8, 'the legs have their own skin');

  const point = new THREE.Vector3();
  function capture() {
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    return legVerts.map((vertex) => mesh.getVertexPosition(vertex, point).clone());
  }
  const idle = capture();
  poseSkeleton(skeleton, { phase: 0.5, moving: 1, sprinting: false, meleeT: 0 } satisfies SkeletalMotion);
  const walked = capture();
  let moved = 0;
  for (let i = 0; i < idle.length; i += 1) moved = Math.max(moved, idle[i].distanceTo(walked[i]));
  assert.ok(moved > 0.02, `a stride should move the legs, max travel ${moved.toFixed(4)}`);
  scene.updateMatrixWorld(true);
  const strideL = skeleton.bone('footL')!.getWorldPosition(new THREE.Vector3());
  const strideR = skeleton.bone('footR')!.getWorldPosition(new THREE.Vector3());
  assert.ok(strideL.distanceTo(strideR) > 0.12, `a stride keeps two legs, feet ${strideL.distanceTo(strideR).toFixed(3)} apart`);

  console.log('zoe rig ok', { bones: names.length, legVerts: legVerts.length, stride: moved.toFixed(3) });
}

void main();
