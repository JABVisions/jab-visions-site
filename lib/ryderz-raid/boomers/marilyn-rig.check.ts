import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { reskinRigidSkeleton } from '../rigid-skin';
import { assessSkinning, poseSkeleton, ProceduralSkeleton, type SkeletalMotion } from '../skeletal';

/**
 * Marilyn's export is a Mixamo skeleton with every vertex welded to
 * `mixamorigHips`. The reskin has to recognise that name, paint the limbs,
 * and leave a skeleton the procedural walk, strikes, jump, and power poses can drive.
 */
function strippedGlb(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const source = JSON.parse(bytes.slice(20, 20 + jsonLength).toString('utf8')) as {
    materials?: Array<{ normalTexture?: unknown; emissiveTexture?: unknown; pbrMetallicRoughness?: Record<string, unknown> }>;
    images?: unknown[];
    textures?: unknown[];
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
const file = strippedGlb(fileURLToPath(new URL('../../../public/assets/those-ryderz/models/boomers/marilyn-monroe.glb', import.meta.url)));
const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
  new GLTFLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '', resolve, reject);
});
const scene = gltf.scene;
const mesh = scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
assert.ok(mesh?.isSkinnedMesh, 'marilyn ships a skinned mesh');

assert.equal(reskinRigidSkeleton(scene), true, 'the hips weld is repainted onto the Mixamo limbs');
assert.deepEqual(assessSkinning(scene), [], 'the repainted skin stays on the bones it cites');

const skeleton = new ProceduralSkeleton(scene);
assert.equal(skeleton.isUsable, true, 'mixamorig bones map to a humanoid');
poseSkeleton(skeleton, { phase: 0, moving: 0, sprinting: false, meleeT: 0 });

const bones = mesh.skeleton.bones;
const armBones = new Set(
  bones.map((bone, index) => (/RightArm$|RightForeArm$|RightHand$/.test(bone.name) ? index : -1)).filter((index) => index >= 0),
);
const legBones = new Set(
  bones
    .map((bone, index) => (/RightUpLeg$|RightLeg$|RightFoot$|RightToeBase$/.test(bone.name) ? index : -1))
    .filter((index) => index >= 0),
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
function capture(verts: number[]) {
  scene.updateMatrixWorld(true);
  mesh.skeleton.update();
  return verts.map((vertex) => {
    mesh.getVertexPosition(vertex, point);
    return point.clone();
  });
}
function travel(from: THREE.Vector3[], to: THREE.Vector3[]) {
  let max = 0;
  for (let i = 0; i < from.length; i += 1) max = Math.max(max, from[i].distanceTo(to[i]));
  return max;
}
function pose(motion: SkeletalMotion) {
  poseSkeleton(skeleton, motion);
}

const idleArms = capture(armVerts);
const idleLegs = capture(legVerts);
pose({ phase: 2.1, moving: 1, sprinting: false, meleeT: 0 });
const walked = capture(legVerts);
const walk = travel(idleLegs, walked);
pose({ phase: 2.1, moving: 1, sprinting: true, meleeT: 0 });
const run = travel(walked, capture(legVerts));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0.4, meleeStyle: 'punch' });
const punch = travel(idleArms, capture(armVerts));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0.4, meleeStyle: 'kick' });
const kick = travel(idleLegs, capture(legVerts));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0, pose: { kind: 'launch', t: 0.7, weight: 1 } });
const jump = Math.max(travel(idleLegs, capture(legVerts)), travel(idleArms, capture(armVerts)));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0, pose: { kind: 'flip', t: 0.45, weight: 1 } });
const showtime = travel(idleArms, capture(armVerts));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0, pose: { kind: 'channel', t: 0.5, weight: 1 } });
const ribbons = travel(idleArms, capture(armVerts));
pose({ phase: 0, moving: 0, sprinting: false, meleeT: 0, pose: { kind: 'finish', t: 0.6, weight: 1 } });
const wave = Math.max(travel(idleArms, capture(armVerts)), travel(idleLegs, capture(legVerts)));

assert.ok(walk > 0.03, `walk should swing a leg, moved ${walk.toFixed(3)}`);
assert.ok(run > 0.02, `run should change the stride from the walk, moved ${run.toFixed(3)}`);
assert.ok(punch > 0.04, `punch should move the arm, moved ${punch.toFixed(3)}`);
assert.ok(kick > 0.05, `kick should swing the leg, moved ${kick.toFixed(3)}`);
assert.ok(jump > 0.04, `jump should tuck the body, moved ${jump.toFixed(3)}`);
assert.ok(showtime > 0.04, `showtime should pose the arms, moved ${showtime.toFixed(3)}`);
assert.ok(ribbons > 0.04, `ribbons should channel through the arms, moved ${ribbons.toFixed(3)}`);
assert.ok(wave > 0.03, `abracadabra should pose the body, moved ${wave.toFixed(3)}`);

console.log('marilyn rig ok', { walk, run, punch, kick, jump, showtime, ribbons, wave });
}

main();
