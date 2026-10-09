import * as THREE from 'three';

/**
 * Lilly's export stands with her legs crossed and her arms away from a
 * square pose. The crossed feet are slid back under their own hips before
 * the skeleton is fit, so the shared walk and strike poses start from a
 * stance instead of twisting the shins apart.
 *
 * +X is her left, matching the raid skeleton. The face is +Z.
 */

interface Sample {
  x: number;
  y: number;
  z: number;
  n: number;
}

interface Segment {
  index: number;
  kind: 'head' | 'torso' | 'arm' | 'leg';
  side: 'L' | 'R' | 'C';
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function readPositions(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const packed = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    packed[i * 3] = position.getX(i);
    packed[i * 3 + 1] = position.getY(i);
    packed[i * 3 + 2] = position.getZ(i);
  }
  return packed;
}

function writePositions(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, packed: Float32Array) {
  for (let i = 0; i < position.count; i += 1) {
    position.setXYZ(i, packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
  }
  position.needsUpdate = true;
}

function median(values: number[]) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

function sample(packed: Float32Array, accept: (x: number, y: number, z: number) => boolean): Sample {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const count = packed.length / 3;
  const step = count > 80000 ? 2 : 1;
  for (let i = 0; i < count; i += step) {
    const x = packed[i * 3];
    const y = packed[i * 3 + 1];
    const z = packed[i * 3 + 2];
    if (!accept(x, y, z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }
  return { x: median(xs), y: median(ys), z: median(zs), n: xs.length };
}

/**
 * Follow each leg down from its own hip and slide that column sideways onto
 * a parallel stance. The export plants the left foot on the right, in front
 * of the other ankle.
 */
function uncrossLegs(packed: Float32Array) {
  const count = packed.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const y = packed[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(0.001, maxY - minY);
  const hip = minY + height * 0.42;
  const handFloor = minY + height * 0.34;
  const centers = [
    { x: 0.055, z: 0, y: hip },
    { x: -0.055, z: 0, y: hip },
  ];
  const samples = [[] as Array<{ x: number; y: number; z: number }>, [] as Array<{ x: number; y: number; z: number }>];

  for (let y = hip; y > minY + height * 0.01; y -= height * 0.018) {
    const groups: number[][] = [[], []];
    for (let i = 0; i < count; i += 1) {
      const py = packed[i * 3 + 1];
      if (py >= y + height * 0.012 || py < y - height * 0.02) continue;
      const px = packed[i * 3];
      const pz = packed[i * 3 + 2];
      // The left hand hangs beside the hip. It is not a thigh.
      if (Math.abs(px) > 0.11 && py > handFloor) continue;
      const d0 = (px - centers[0].x) ** 2 + (pz - centers[0].z) ** 2;
      const d1 = (px - centers[1].x) ** 2 + (pz - centers[1].z) ** 2;
      groups[d0 <= d1 ? 0 : 1].push(i);
    }
    for (let side = 0; side < 2; side += 1) {
      const group = groups[side];
      if (group.length < 12) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const index of group) {
        sx += packed[index * 3];
        sy += packed[index * 3 + 1];
        sz += packed[index * 3 + 2];
      }
      const next = { x: sx / group.length, y: sy / group.length, z: sz / group.length };
      centers[side] = next;
      samples[side].push(next);
    }
  }

  const nearest = (side: number, y: number) => {
    const line = samples[side];
    let best = line[0];
    let bestD = Infinity;
    for (const point of line) {
      const d = Math.abs(point.y - y);
      if (d < bestD) {
        bestD = d;
        best = point;
      }
    }
    return best;
  };

  const target = (side: number, y: number) => {
    const sign = side === 0 ? 1 : -1;
    const t = Math.min(1, Math.max(0, (hip - y) / (hip - minY)));
    return { x: sign * (0.058 + 0.012 * t), z: 0.02 * t };
  };

  if (!samples[0].length || !samples[1].length) return;

  for (let i = 0; i < count; i += 1) {
    const py = packed[i * 3 + 1];
    if (py > hip) continue;
    const px = packed[i * 3];
    const pz = packed[i * 3 + 2];
    if (Math.abs(px) > 0.11 && py > handFloor) continue;
    const left = nearest(0, py);
    const right = nearest(1, py);
    const dLeft = (px - left.x) ** 2 + (pz - left.z) ** 2;
    const dRight = (px - right.x) ** 2 + (pz - right.z) ** 2;
    const side = dLeft <= dRight ? 0 : 1;
    const along = Math.sqrt(side === 0 ? dLeft : dRight);
    // Shorts and the gap between the thighs stay put. Only the leg column slides.
    if (along > 0.055) continue;
    const actual = side === 0 ? left : right;
    const want = target(side, py);
    const knee = hip - height * 0.16;
    const blend = py >= hip ? 0 : py <= knee ? 1 : (hip - py) / (hip - knee);
    packed[i * 3] += (want.x - actual.x) * blend;
    packed[i * 3 + 2] += (want.z - actual.z) * blend;
  }
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

function findBody(root: THREE.Object3D): THREE.Mesh | null {
  let body: THREE.Mesh | null = null;
  let best = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const count = mesh.geometry.getAttribute('position')?.count ?? 0;
    if (count > best) {
      best = count;
      body = mesh;
    }
  });
  return body;
}

/**
 * The outer shell of each side, stepped down from the shoulder. Averaging
 * every vertex past the torso pulls the bone into the ribcage; the arm is
 * the outermost few centimetres.
 */
function traceArm(packed: Float32Array, sign: number, minY: number, height: number) {
  const points: THREE.Vector3[] = [];
  const count = packed.length / 3;
  for (let t = 0.78; t >= 0.44; t -= 0.035) {
    const y0 = minY + height * (t - 0.02);
    const y1 = minY + height * (t + 0.02);
    let maxLat = 0;
    for (let i = 0; i < count; i += 2) {
      const y = packed[i * 3 + 1];
      if (y < y0 || y >= y1) continue;
      const lat = packed[i * 3] * sign;
      if (lat > maxLat) maxLat = lat;
    }
    if (maxLat < 0.07) continue;
    const gate = maxLat - 0.035;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      const x = packed[i * 3];
      const y = packed[i * 3 + 1];
      const z = packed[i * 3 + 2];
      if (y < y0 || y >= y1 || x * sign < gate) continue;
      sx += x;
      sy += y;
      sz += z;
      n += 1;
    }
    if (n < 12) continue;
    points.push(new THREE.Vector3(sx / n, sy / n, sz / n));
  }
  return points;
}

function elbowOf(points: THREE.Vector3[]) {
  const shoulder = points[0];
  const hand = points[points.length - 1];
  const abx = hand.x - shoulder.x;
  const aby = hand.y - shoulder.y;
  const abz = hand.z - shoulder.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let best = points[Math.floor(points.length / 2)];
  let bestD = -1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((point.x - shoulder.x) * abx + (point.y - shoulder.y) * aby + (point.z - shoulder.z) * abz) / len2)) : 0;
    const d = (shoulder.x + abx * t - point.x) ** 2 + (shoulder.y + aby * t - point.y) ** 2 + (shoulder.z + abz * t - point.z) ** 2;
    if (d > bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

export function rigLillyBody(root: THREE.Object3D) {
  const source = findBody(root);
  if (!source) return false;
  const position = source.geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!position) return false;
  const packed = readPositions(position);
  uncrossLegs(packed);
  writePositions(position, packed);
  source.geometry.computeVertexNormals();
  source.geometry.computeBoundingBox();
  source.geometry.computeBoundingSphere();

  const count = position.count;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 4) {
    const y = packed[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(0.001, maxY - minY);
  const yAt = (t: number) => minY + height * t;
  const chest = sample(packed, (_x, y) => y >= yAt(0.66) && y < yAt(0.76));
  const centerX = chest.n > 20 ? chest.x : 0;

  const torso = (y0: number, y1: number) => sample(packed, (x, y) => y >= y0 && y < y1 && Math.abs(x - centerX) < 0.07);
  const point = (hit: Sample, x: number, y: number, z = 0) =>
    new THREE.Vector3(hit.n > 12 ? hit.x : x, hit.n > 12 ? hit.y : y, hit.n > 12 ? hit.z : z);

  const hipsP = point(torso(yAt(0.44), yAt(0.52)), centerX, yAt(0.48));
  const spineP = point(torso(yAt(0.52), yAt(0.6)), centerX, yAt(0.56));
  const chestP = point(torso(yAt(0.62), yAt(0.7)), centerX, yAt(0.66));
  const upperP = point(torso(yAt(0.7), yAt(0.78)), centerX, yAt(0.74));
  const neckP = point(torso(yAt(0.78), yAt(0.84)), centerX, yAt(0.8));
  const headP = point(torso(yAt(0.86), yAt(0.94)), centerX, yAt(0.88));
  const crownP = new THREE.Vector3(headP.x, maxY, headP.z);

  const limb = (sign: number) => {
    const traced = traceArm(packed, sign, minY, height);
    const shoulderP = traced[0] ?? new THREE.Vector3(centerX + sign * 0.09, yAt(0.75), upperP.z);
    const handP = traced[traced.length - 1] ?? new THREE.Vector3(centerX + sign * 0.16, yAt(0.5), shoulderP.z);
    const elbowP = traced.length > 3 ? elbowOf(traced) : shoulderP.clone().lerp(handP, 0.45);
    const wristP = elbowP.clone().lerp(handP, 0.72);
    const leg = (y0: number, y1: number) =>
      sample(packed, (x, y) => y >= y0 && y < y1 && (x - centerX) * sign > 0.015 && Math.abs(x - centerX) < 0.14);
    const thigh = leg(yAt(0.34), yAt(0.46));
    const knee = leg(yAt(0.2), yAt(0.32));
    const ankle = leg(yAt(0.05), yAt(0.12));
    const foot = leg(minY, yAt(0.06));
    const hipSocket = point(thigh, centerX + sign * 0.06, yAt(0.46), hipsP.z);
    const kneeP = point(knee, centerX + sign * 0.06, yAt(0.26));
    const ankleP = point(ankle, centerX + sign * 0.06, yAt(0.08));
    const toeP = point(foot, ankleP.x, yAt(0.02), ankleP.z + 0.045);
    return { shoulderP, elbowP, wristP, handP, hipSocket, kneeP, ankleP, toeP };
  };
  const left = limb(1);
  const right = limb(-1);

  const skinned = new THREE.SkinnedMesh(source.geometry, source.material);
  skinned.name = source.name || 'LillyBody';
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
  add('LeftShoulder', 'UpperChest', upperP.clone().lerp(left.shoulderP, 0.35), left.shoulderP);
  add('RightShoulder', 'UpperChest', upperP.clone().lerp(right.shoulderP, 0.35), right.shoulderP);
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
  add('LeftToe', 'LeftFoot', left.toeP, left.toeP.clone().add(new THREE.Vector3(0, -0.005, 0.03)));
  add('RightToe', 'RightFoot', right.toeP, right.toeP.clone().add(new THREE.Vector3(0, -0.005, 0.03)));

  const seg = (index: number, kind: Segment['kind'], side: Segment['side'], a: THREE.Vector3, b: THREE.Vector3): Segment => ({
    index,
    kind,
    side,
    ax: a.x,
    ay: a.y,
    az: a.z,
    bx: b.x,
    by: b.y,
    bz: b.z,
  });
  const segments: Segment[] = [
    seg(0, 'torso', 'C', hipsP, spineP),
    seg(1, 'torso', 'C', spineP, chestP),
    seg(2, 'torso', 'C', chestP, upperP),
    seg(3, 'torso', 'C', upperP, neckP),
    seg(4, 'head', 'C', neckP, headP),
    seg(5, 'head', 'C', headP, crownP),
    seg(6, 'arm', 'L', upperP, left.shoulderP),
    seg(7, 'arm', 'R', upperP, right.shoulderP),
    seg(8, 'arm', 'L', left.shoulderP, left.elbowP),
    seg(9, 'arm', 'R', right.shoulderP, right.elbowP),
    seg(10, 'arm', 'L', left.elbowP, left.wristP),
    seg(11, 'arm', 'R', right.elbowP, right.wristP),
    seg(12, 'arm', 'L', left.wristP, left.handP),
    seg(13, 'arm', 'R', right.wristP, right.handP),
    seg(14, 'leg', 'L', left.hipSocket, left.kneeP),
    seg(15, 'leg', 'R', right.hipSocket, right.kneeP),
    seg(16, 'leg', 'L', left.kneeP, left.ankleP),
    seg(17, 'leg', 'R', right.kneeP, right.ankleP),
    seg(18, 'leg', 'L', left.ankleP, left.toeP),
    seg(19, 'leg', 'R', right.ankleP, right.toeP),
  ];

  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const armReach = 0.05 * 0.05;
  const handReach = 0.055 * 0.055;
  for (let i = 0; i < count; i += 1) {
    const x = packed[i * 3];
    const y = packed[i * 3 + 1];
    const z = packed[i * 3 + 2];
    const base = i * 4;
    if (y > neckP.y && Math.abs(x - centerX) < 0.12) {
      indices[base] = 5;
      weights[base] = 1;
      continue;
    }
    const side = x >= centerX ? 'L' : 'R';
    const hand = side === 'L' ? left.handP : right.handP;
    const handD = (x - hand.x) ** 2 + (y - hand.y) ** 2 + (z - hand.z) ** 2;
    if (handD < handReach && Math.abs(x - centerX) > 0.08) {
      indices[base] = side === 'L' ? 12 : 13;
      weights[base] = 1;
      continue;
    }
    let body = 0;
    let bodyD = Infinity;
    let arm = -1;
    let armD = Infinity;
    let leg = -1;
    let legD = Infinity;
    for (const segment of segments) {
      if (segment.kind === 'arm' && segment.side !== side) continue;
      if (segment.kind === 'leg' && segment.side !== side) continue;
      if (segment.kind === 'leg' && y > hipsP.y + height * 0.02) continue;
      const d = segmentDistance(x, y, z, segment);
      if (segment.kind === 'arm') {
        if (d < armD) {
          armD = d;
          arm = segment.index;
        }
      } else if (segment.kind === 'leg') {
        if (d < legD) {
          legD = d;
          leg = segment.index;
        }
      } else if (d < bodyD) {
        bodyD = d;
        body = segment.index;
      }
    }
    const useArm = arm >= 0 && armD < armReach && armD + 0.0008 < Math.min(bodyD, legD);
    if (useArm) {
      indices[base] = arm;
      weights[base] = 1;
      continue;
    }
    const onLeg = leg >= 0 && y < hipsP.y + height * 0.01 && legD < 0.045 * 0.045 && legD < bodyD + 0.001;
    if (!onLeg) {
      indices[base] = body;
      weights[base] = 1;
      continue;
    }
    // Ease the thigh into the pelvis so a step does not open the shorts into a sheet.
    const seam = hipsP.y - height * 0.05;
    if (y > seam) {
      const t = Math.min(1, Math.max(0, (y - seam) / (height * 0.06)));
      indices[base] = leg;
      indices[base + 1] = 0;
      weights[base] = 1 - t;
      weights[base + 1] = t;
    } else {
      indices[base] = leg;
      weights[base] = 1;
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
