import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BvhOcclusion, LegacyOcclusion } from './occlusion';

// A street: ground, a row of boxes, a tilted one-sided wall, and an instanced batch of pillars.
const material = new THREE.MeshBasicMaterial();
const twoSided = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const occluders: THREE.Object3D[] = [];
const root = new THREE.Group();
root.position.set(3, 0, -2);
root.rotation.y = 0.4;

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 8, 8), material);
ground.rotation.x = -Math.PI / 2;
root.add(ground);
occluders.push(ground);

for (let i = 0; i < 12; i += 1) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(3 + (i % 3), 6 + i, 4), material);
  box.position.set(-30 + i * 6, 3, 9 + (i % 2) * 3);
  box.rotation.y = i * 0.3;
  root.add(box);
  occluders.push(box);
}

const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), twoSided);
wall.position.set(0, 2.5, -8);
wall.rotation.set(0.2, 0.9, 0);
wall.scale.set(1.5, 1, 1);
root.add(wall);
occluders.push(wall);

const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 10), material, 40);
const m = new THREE.Matrix4();
for (let i = 0; i < 40; i += 1) {
  m.compose(
    new THREE.Vector3(-40 + (i % 10) * 8, 2.5, -30 + Math.floor(i / 10) * 7),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)),
    new THREE.Vector3(1, 1 + (i % 4) * 0.25, 1),
  );
  pillars.setMatrixAt(i, m);
}
pillars.computeBoundingSphere();
root.add(pillars);
occluders.push(pillars);

// Things the tree cannot index still have to be answered.
const marker = new THREE.Group();
root.add(marker);
occluders.push(marker);
root.updateMatrixWorld(true);

const fast = new BvhOcclusion(() => occluders, () => 0);
const slow = new LegacyOcclusion(() => occluders);

let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
const ray = new THREE.Ray();
let hits = 0;
let misses = 0;
for (let i = 0; i < 4000; i += 1) {
  ray.origin.set((rand() - 0.5) * 80, 0.4 + rand() * 6, (rand() - 0.5) * 80);
  const yaw = rand() * Math.PI * 2;
  const pitch = (rand() - 0.5) * 1.6;
  ray.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  const far = 2 + rand() * 40;
  const a = fast.cast(ray, far);
  const b = slow.cast(ray, far);
  if (b === Infinity) {
    assert.equal(a, Infinity, `ray ${i}: the tree found a hit the triangle sweep did not`);
    misses += 1;
  } else {
    assert.ok(Math.abs(a - b) < 1e-4, `ray ${i}: tree ${a} against sweep ${b}`);
    assert.ok(a <= far);
    hits += 1;
  }
}
assert.ok(hits > 800 && misses > 400, `the rays exercise both outcomes (${hits} hits, ${misses} misses)`);
assert.equal(fast.pendingTrees, 0, 'every geometry is indexed');

// A copy trimmed from the draw buffer (out of view) still blocks the tree query.
ray.origin.set(0, 50, 0);
ray.direction.set(0, -1, 0);
const before = fast.cast(ray, 100);
pillars.count = 0;
assert.equal(fast.cast(ray, 100), before);
const pillarTop = new THREE.Vector3();
pillars.getMatrixAt(0, m);
pillarTop.setFromMatrixPosition(m).applyMatrix4(root.matrixWorld);
ray.origin.set(pillarTop.x, 40, pillarTop.z);
assert.ok(fast.cast(ray, 100) < 38, 'the trimmed pillar is still solid');
assert.ok(slow.cast(ray, 100) > 38, 'the triangle sweep only sees the ground under it');
pillars.count = 40;

// A late arrival (arenas swap buildings in after load) is picked up, and one that moves is re-placed.
const late = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
late.position.set(60, 30, 60);
late.updateMatrixWorld(true);
occluders.push(late);
ray.origin.set(60, 40, 60);
ray.direction.set(0, -1, 0);
assert.ok(Math.abs(fast.cast(ray, 100) - 9) < 1e-4, 'a new occluder is found');
late.position.y = 20;
late.updateMatrixWorld(true);
assert.ok(Math.abs(fast.cast(ray, 100) - 19) < 1e-4, 'a moved occluder is found where it is now');

console.log(`occlusion checks passed (${hits} hits, ${misses} misses)`);
