import * as THREE from 'three';

/**
 * Lavender ships as one static mesh. This builds a humanoid skeleton in her
 * export pose and skins the vertices to it, so the shared procedural walk
 * and strike poses can move her like the other civilians.
 *
 * +X is her left, matching the raid skeleton. Weights stay on the nearest
 * bone so folding an arm does not twist the jacket.
 */

interface Sample {
  x: number;
  y: number;
  z: number;
  n: number;
}

interface Segment {
  index: number;
  side: 'L' | 'R' | 'C';
  region: 'head' | 'torso' | 'arm' | 'leg';
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function median(values: number[]) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

function sample(pos: Float32Array, count: number, accept: (x: number, y: number, z: number) => boolean): Sample {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const step = count > 80000 ? 3 : 1;
  for (let i = 0; i < count; i += step) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (!accept(x, y, z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }
  return { x: median(xs), y: median(ys), z: median(zs), n: xs.length };
}

function placeBone(bone: THREE.Bone, parent: THREE.Object3D, joint: THREE.Vector3, toward: THREE.Vector3) {
  parent.updateWorldMatrix(true, false);
  bone.position.copy(joint);
  parent.worldToLocal(bone.position);

  const parentQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentQuat);
  const invParent = parentQuat.clone().invert();
  const yAxis = toward.clone().sub(joint);
  if (yAxis.lengthSq() < 1e-8) yAxis.copy(UP);
  yAxis.normalize().applyQuaternion(invParent);

  const zHint = new THREE.Vector3(0, 0, 1).applyQuaternion(invParent);
  const zAxis = zHint.addScaledVector(yAxis, -zHint.dot(yAxis));
  if (zAxis.lengthSq() < 1e-6) {
    const fallback = new THREE.Vector3(1, 0, 0).applyQuaternion(invParent);
    zAxis.copy(fallback).addScaledVector(yAxis, -fallback.dot(yAxis));
  }
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  bone.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  parent.add(bone);
}

function segmentDistance(x: number, y: number, z: number, seg: Segment) {
  const abx = seg.bx - seg.ax;
  const aby = seg.by - seg.ay;
  const abz = seg.bz - seg.az;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - seg.ax) * abx + (y - seg.ay) * aby + (z - seg.az) * abz) / len2)) : 0;
  const dx = seg.ax + abx * t - x;
  const dy = seg.ay + aby * t - y;
  const dz = seg.az + abz * t - z;
  return dx * dx + dy * dy + dz * dz;
}

function allowed(seg: Segment, x: number, y: number, minY: number, height: number, halfW: number) {
  const yn = (y - minY) / height;
  const ax = Math.abs(x);
  const side = x >= 0 ? 'L' : 'R';
  if (seg.side !== 'C' && seg.side !== side && ax > halfW * 0.08) return false;
  if (yn > 0.84 && ax < halfW * 0.5) return seg.region === 'head';
  if (yn < 0.46 && ax < halfW * 0.7) return seg.region === 'leg' || seg.region === 'torso';
  if (ax > halfW * 0.3 && yn > 0.5 && yn < 0.84) return seg.region === 'arm' && seg.side === side;
  if (ax < halfW * 0.45 && yn >= 0.46 && yn <= 0.84) return seg.region === 'torso' || seg.region === 'head' || (seg.region === 'arm' && ax > halfW * 0.22);
  return seg.side === 'C' || seg.side === side;
}

export function rigFashionBody(root: THREE.Object3D) {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    const candidate = object as THREE.Mesh;
    if (found.length || !candidate.isMesh || (candidate as THREE.SkinnedMesh).isSkinnedMesh) return;
    found.push(candidate);
  });
  const source = found[0];
  if (!source) return false;
  const position = source.geometry.getAttribute('position');
  if (!position) return false;
  const pos = position.array as Float32Array;
  const count = position.count;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 8) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(0.001, maxY - minY);
  const halfW = Math.max(Math.abs(minX), Math.abs(maxX), 0.001);
  const yAt = (t: number) => minY + height * t;

  const leg = (sign: number, y0: number, y1: number) =>
    sample(pos, count, (x, y) => y >= y0 && y < y1 && x * sign > halfW * 0.04);
  const armBand = (sign: number, x0: number, x1: number) =>
    sample(
      pos,
      count,
      (x, y) => y >= yAt(0.52) && y < yAt(0.82) && x * sign >= halfW * x0 && x * sign < halfW * x1,
    );
  const torso = (y0: number, y1: number) =>
    sample(pos, count, (x, y) => y >= y0 && y < y1 && Math.abs(x) < halfW * 0.38);

  const point = (hit: Sample, x: number, y: number, z = 0) =>
    new THREE.Vector3(hit.n > 12 ? hit.x : x, hit.n > 12 ? hit.y : y, hit.n > 12 ? hit.z : z);

  const hip = torso(yAt(0.44), yAt(0.52));
  const waist = torso(yAt(0.52), yAt(0.6));
  const chest = torso(yAt(0.62), yAt(0.7));
  const upper = torso(yAt(0.7), yAt(0.78));
  const neck = torso(yAt(0.78), yAt(0.84));
  const head = torso(yAt(0.86), yAt(0.94));

  const hipsP = point(hip, 0, yAt(0.48));
  const spineP = point(waist, 0, yAt(0.56));
  const chestP = point(chest, 0, yAt(0.66));
  const upperP = point(upper, 0, yAt(0.74));
  const neckP = point(neck, 0, yAt(0.8));
  const headP = point(head, 0, yAt(0.88));
  const crownP = new THREE.Vector3(headP.x, maxY, headP.z);

  const side = (sign: number) => {
    const thigh = leg(sign, yAt(0.28), yAt(0.46));
    const knee = leg(sign, yAt(0.22), yAt(0.32));
    const ankle = leg(sign, yAt(0.06), yAt(0.14));
    const foot = leg(sign, minY, yAt(0.08));
    const shoulder = armBand(sign, 0.18, 0.42);
    const elbow = armBand(sign, 0.48, 0.72);
    const wrist = armBand(sign, 0.78, 1.05);
    const hipSocket = point(thigh, sign * halfW * 0.12, yAt(0.46));
    const kneeP = point(knee, sign * halfW * 0.1, yAt(0.26));
    const ankleP = point(ankle, sign * halfW * 0.1, yAt(0.08));
    const toeP = point(foot, sign * halfW * 0.1, yAt(0.02), 0.04);
    toeP.z += 0.035;
    const shoulderP = point(shoulder, sign * halfW * 0.34, yAt(0.74));
    const elbowP = point(elbow, sign * halfW * 0.62, yAt(0.66));
    const wristP = point(wrist, sign * halfW * 0.9, yAt(0.6));
    const handP = wristP.clone().add(new THREE.Vector3(sign * halfW * 0.08, -0.01, 0.01));
    return { hipSocket, kneeP, ankleP, toeP, shoulderP, elbowP, wristP, handP };
  };
  const left = side(1);
  const right = side(-1);

  const skinned = new THREE.SkinnedMesh(source.geometry, source.material);
  skinned.name = source.name || 'LavenderBody';
  skinned.frustumCulled = false;
  skinned.position.copy(source.position);
  skinned.quaternion.copy(source.quaternion);
  skinned.scale.copy(source.scale);

  const bones: THREE.Bone[] = [];
  const byName = new Map<string, THREE.Bone>();
  const add = (name: string, parentName: string | null, joint: THREE.Vector3, toward: THREE.Vector3) => {
    const bone = new THREE.Bone();
    bone.name = name;
    const parent = parentName ? byName.get(parentName) : skinned;
    if (!parent) return bone;
    placeBone(bone, parent, joint, toward);
    bones.push(bone);
    byName.set(name, bone);
    return bone;
  };

  add('Hips', null, hipsP, spineP);
  add('Spine', 'Hips', spineP, chestP);
  add('Chest', 'Spine', chestP, upperP);
  add('UpperChest', 'Chest', upperP, neckP);
  add('Neck', 'UpperChest', neckP, headP);
  add('Head', 'Neck', headP, crownP);
  add('LeftShoulder', 'UpperChest', upperP.clone().add(new THREE.Vector3(halfW * 0.08, 0, 0)), left.shoulderP);
  add('RightShoulder', 'UpperChest', upperP.clone().add(new THREE.Vector3(-halfW * 0.08, 0, 0)), right.shoulderP);
  add('LeftUpperArm', 'LeftShoulder', left.shoulderP, left.elbowP);
  add('RightUpperArm', 'RightShoulder', right.shoulderP, right.elbowP);
  add('LeftLowerArm', 'LeftUpperArm', left.elbowP, left.wristP);
  add('RightLowerArm', 'RightUpperArm', right.elbowP, right.wristP);
  add('LeftHand', 'LeftLowerArm', left.wristP, left.handP);
  add('RightHand', 'RightLowerArm', right.wristP, right.handP);
  add('LeftUpperLeg', 'Hips', left.hipSocket, left.kneeP);
  add('RightUpperLeg', 'Hips', right.hipSocket, right.kneeP);
  add('LeftLowerLeg', 'LeftUpperLeg', left.kneeP, left.ankleP);
  add('RightLowerLeg', 'RightUpperLeg', right.kneeP, right.ankleP);
  add('LeftFoot', 'LeftLowerLeg', left.ankleP, left.toeP);
  add('RightFoot', 'RightLowerLeg', right.ankleP, right.toeP);
  add('LeftToe', 'LeftFoot', left.toeP, left.toeP.clone().add(new THREE.Vector3(0, -0.01, 0.03)));
  add('RightToe', 'RightFoot', right.toeP, right.toeP.clone().add(new THREE.Vector3(0, -0.01, 0.03)));

  const segments: Segment[] = [
    { index: 0, side: 'C', region: 'torso', ax: hipsP.x, ay: hipsP.y, az: hipsP.z, bx: spineP.x, by: spineP.y, bz: spineP.z },
    { index: 1, side: 'C', region: 'torso', ax: spineP.x, ay: spineP.y, az: spineP.z, bx: chestP.x, by: chestP.y, bz: chestP.z },
    { index: 2, side: 'C', region: 'torso', ax: chestP.x, ay: chestP.y, az: chestP.z, bx: upperP.x, by: upperP.y, bz: upperP.z },
    { index: 3, side: 'C', region: 'torso', ax: upperP.x, ay: upperP.y, az: upperP.z, bx: neckP.x, by: neckP.y, bz: neckP.z },
    { index: 4, side: 'C', region: 'head', ax: neckP.x, ay: neckP.y, az: neckP.z, bx: headP.x, by: headP.y, bz: headP.z },
    { index: 5, side: 'C', region: 'head', ax: headP.x, ay: headP.y, az: headP.z, bx: crownP.x, by: crownP.y, bz: crownP.z },
    { index: 8, side: 'L', region: 'arm', ax: left.shoulderP.x, ay: left.shoulderP.y, az: left.shoulderP.z, bx: left.elbowP.x, by: left.elbowP.y, bz: left.elbowP.z },
    { index: 9, side: 'R', region: 'arm', ax: right.shoulderP.x, ay: right.shoulderP.y, az: right.shoulderP.z, bx: right.elbowP.x, by: right.elbowP.y, bz: right.elbowP.z },
    { index: 10, side: 'L', region: 'arm', ax: left.elbowP.x, ay: left.elbowP.y, az: left.elbowP.z, bx: left.wristP.x, by: left.wristP.y, bz: left.wristP.z },
    { index: 11, side: 'R', region: 'arm', ax: right.elbowP.x, ay: right.elbowP.y, az: right.elbowP.z, bx: right.wristP.x, by: right.wristP.y, bz: right.wristP.z },
    { index: 12, side: 'L', region: 'arm', ax: left.wristP.x, ay: left.wristP.y, az: left.wristP.z, bx: left.handP.x, by: left.handP.y, bz: left.handP.z },
    { index: 13, side: 'R', region: 'arm', ax: right.wristP.x, ay: right.wristP.y, az: right.wristP.z, bx: right.handP.x, by: right.handP.y, bz: right.handP.z },
    { index: 14, side: 'L', region: 'leg', ax: left.hipSocket.x, ay: left.hipSocket.y, az: left.hipSocket.z, bx: left.kneeP.x, by: left.kneeP.y, bz: left.kneeP.z },
    { index: 15, side: 'R', region: 'leg', ax: right.hipSocket.x, ay: right.hipSocket.y, az: right.hipSocket.z, bx: right.kneeP.x, by: right.kneeP.y, bz: right.kneeP.z },
    { index: 16, side: 'L', region: 'leg', ax: left.kneeP.x, ay: left.kneeP.y, az: left.kneeP.z, bx: left.ankleP.x, by: left.ankleP.y, bz: left.ankleP.z },
    { index: 17, side: 'R', region: 'leg', ax: right.kneeP.x, ay: right.kneeP.y, az: right.kneeP.z, bx: right.ankleP.x, by: right.ankleP.y, bz: right.ankleP.z },
    { index: 18, side: 'L', region: 'leg', ax: left.ankleP.x, ay: left.ankleP.y, az: left.ankleP.z, bx: left.toeP.x, by: left.toeP.y, bz: left.toeP.z },
    { index: 19, side: 'R', region: 'leg', ax: right.ankleP.x, ay: right.ankleP.y, az: right.ankleP.z, bx: right.toeP.x, by: right.toeP.y, bz: right.toeP.z },
  ];

  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const picked: Array<{ index: number; d: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    picked.length = 0;
    for (const seg of segments) {
      if (!allowed(seg, x, y, minY, height, halfW)) continue;
      const d = segmentDistance(x, y, z, seg);
      if (picked.length < 2) {
        picked.push({ index: seg.index, d });
        if (picked.length === 2 && picked[0].d > picked[1].d) {
          const swap = picked[0];
          picked[0] = picked[1];
          picked[1] = swap;
        }
      } else if (d < picked[1].d) {
        picked[1] = { index: seg.index, d };
        if (picked[0].d > picked[1].d) {
          const swap = picked[0];
          picked[0] = picked[1];
          picked[1] = swap;
        }
      }
    }
    if (!picked.length) {
      let best = 0;
      let bestD = Infinity;
      for (const seg of segments) {
        const d = segmentDistance(x, y, z, seg);
        if (d < bestD) {
          bestD = d;
          best = seg.index;
        }
      }
      picked.push({ index: best, d: bestD });
    }
    const base = i * 4;
    const blend = picked.length > 1 && picked[1].d < picked[0].d * 1.35 && picked[0].d < height * height * 0.006;
    if (!blend) {
      indices[base] = picked[0].index;
      weights[base] = 1;
    } else {
      const w0 = 1 / (Math.sqrt(picked[0].d) + 0.01);
      const w1 = 1 / (Math.sqrt(picked[1].d) + 0.01);
      const sum = w0 + w1;
      indices[base] = picked[0].index;
      indices[base + 1] = picked[1].index;
      weights[base] = w0 / sum;
      weights[base + 1] = w1 / sum;
    }
  }
  source.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  source.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

  const parent = source.parent;
  if (parent) {
    parent.add(skinned);
    source.removeFromParent();
  } else {
    root.add(skinned);
  }
  skinned.bind(new THREE.Skeleton(bones));
  skinned.skeleton.pose();
  return true;
}
