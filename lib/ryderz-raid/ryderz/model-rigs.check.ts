import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralSkeleton, extractStrikes, poseSkeleton, type BoneKey } from '../skeletal';
import { animateGltfFighter, buildRyder, preloadRyderGltf } from '../characters';
import { RYDERZ } from '../config';

// Read the actual production meshes without requiring DOM image decoders.
async function loadBody(name: string) {
  const data = readFileSync(`public/assets/those-ryderz/models/${name}.glb`);
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString());
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  json.materials = []; json.images = []; json.textures = [];
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((name: string) => !name.includes('texture'));
  delete json.extensionsRequired;
  const text = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const binary = data.subarray(20 + length);
  const output = Buffer.alloc(20 + chunk.length + binary.length);
  data.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8); output.writeUInt32LE(chunk.length, 12); output.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(output, 20); binary.copy(output, 20 + chunk.length);
  return new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.length), '');
}

function skin(root: THREE.Object3D) {
  let found: THREE.SkinnedMesh | undefined;
  root.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) found = object as THREE.SkinnedMesh; });
  assert.ok(found);
  return found;
}

function verifyMotion(root: THREE.Object3D, keep: BoneKey[]) {
  const mesh = skin(root);
  const weights = mesh.geometry.getAttribute('skinWeight');
  const indices = mesh.geometry.getAttribute('skinIndex');
  for (let i = 0; i < weights.count; i += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) {
      assert.ok(indices.getComponent(i, k) < mesh.skeleton.bones.length);
      sum += weights.getComponent(i, k);
    }
    assert.ok(Math.abs(sum - 1) < 0.01, 'skin weights remain normalized');
  }
  const rig = new ProceduralSkeleton(root, { keep });
  for (let frame = 0; frame < 32; frame += 1) {
    poseSkeleton(rig, { phase: frame * 0.24, moving: 1, sprinting: frame > 15, meleeT: 0 });
    root.updateMatrixWorld(true); mesh.skeleton.update();
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let v = 0; v < weights.count; v += 5) {
      mesh.getVertexPosition(v, point);
      assert.ok(point.toArray().every(Number.isFinite), 'animated vertices stay finite');
      box.expandByPoint(point);
    }
    assert.ok(box.getSize(point).y < 1.65, 'locomotion cannot stretch the figure into long spikes');
  }
}

async function main() {
  const leo = await loadBody('leo-montana');
  const body = skin(leo.scene);
  const joints = new Map(body.skeleton.bones.map((bone) => [bone.name, bone]));
  for (const side of ['Left', 'Right']) {
    const knee = joints.get(`${side}_LowerLeg`)!;
    const ankle = joints.get(`${side}_Foot`)!;
    assert.ok(knee.getWorldPosition(new THREE.Vector3()).distanceTo(ankle.getWorldPosition(new THREE.Vector3())) > 0.2, 'each calf has a real knee-to-ankle span');
  }
  verifyMotion(leo.scene, []);
  // Exercise the real load -> clone -> fit -> animate path, including a
  // translated game actor. Isolated skeleton checks miss wrapper regressions.
  const loadAsync = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async () => loadBody('leo-montana');
  try { await preloadRyderGltf(RYDERZ.leo); }
  finally { GLTFLoader.prototype.loadAsync = loadAsync; }
  const fighter = buildRyder(RYDERZ.leo);
  assert.ok(fighter.rig?.skeleton);
  fighter.humanoid.group.position.set(70, 2, -30);
  for (let frame = 0; frame < 60; frame += 1) {
    animateGltfFighter(fighter, 1 / 60, frame * 0.2, 1, frame > 30, 0, false);
    fighter.humanoid.group.updateMatrixWorld(true);
    const actor = new THREE.Box3().setFromObject(fighter.humanoid.group);
    assert.ok(actor.getSize(new THREE.Vector3()).y < 2.7, 'the in-game wrapper must not stretch Leo');
    assert.ok(Math.abs(actor.getCenter(new THREE.Vector3()).x - 70) < 1, 'skin follows the actor in world space');
  }
  const zoe = await loadBody('zoe-folie');
  assert.equal(extractStrikes(zoe.scene, zoe.animations).length, 0, 'the afraid emote is not a melee animation');
  const keep: BoneKey[] = RYDERZ.zoe.skelKeep ?? [];
  verifyMotion(zoe.scene, keep);
  console.log('Leo and Zoe production rig checks passed (standing, walk and sprint)');
}
void main();
