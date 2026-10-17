import * as THREE from 'three';

/**
 * Keven's export is one static mesh in a walking stride, dart in hand, with
 * no skeleton and no clips. This turns the chest to face +Z (the raid's
 * forward, +X his left) and fits a humanoid skeleton through that stride.
 * Each limb is skinned to one bone so a punch or a step swings it whole.
 * The stride is the bind pose: the shared stance pass is told to leave it.
 */

interface Sample {
  x: number;
  y: number;
  z: number;
  n: number;
}

interface Segment {
  index: number;
  kind: 'head' | 'torso' | 'arm' | 'leg' | 'dart';
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

/** The chest faces -Z in the export. Spin him so it faces +Z and the dart hand is his left. */
function turnForward(packed: Float32Array) {
  for (let i = 0; i < packed.length; i += 3) {
    packed[i] = -packed[i];
    packed[i + 2] = -packed[i + 2];
  }
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

function gather(packed: Float32Array, accept: (x: number, y: number, z: number) => boolean) {
  const points: THREE.Vector3[] = [];
  const count = packed.length / 3;
  const step = count > 80000 ? 2 : 1;
  for (let i = 0; i < count; i += step) {
    const x = packed[i * 3];
    const y = packed[i * 3 + 1];
    const z = packed[i * 3 + 2];
    if (accept(x, y, z)) points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

/** Two foot plants. The export stride puts both of them on one side of the chest. */
function footPlants(packed: Float32Array, minY: number, height: number) {
  const points = gather(packed, (_x, y) => y < minY + height * 0.1);
  if (points.length < 8) {
    return [new THREE.Vector3(0.06, minY, 0.04), new THREE.Vector3(-0.06, minY, -0.04)];
  }
  let a = points[0].clone();
  let b = points[Math.floor(points.length / 2)].clone();
  for (let pass = 0; pass < 8; pass += 1) {
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    for (const point of points) {
      (point.distanceToSquared(a) <= point.distanceToSquared(b) ? left : right).push(point);
    }
    if (left.length) a = left.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / left.length);
    if (right.length) b = right.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / right.length);
  }
  return [a, b];
}

/** Walk up from a foot, staying with the column of vertices nearest the last step. */
function climbLeg(packed: Float32Array, foot: THREE.Vector3, hipY: number, height: number) {
  const chain = [foot.clone()];
  let cursor = foot.clone();
  const step = height * 0.055;
  for (let y = foot.y + step; y < hipY; y += step) {
    let reach = 0.11;
    let hit: Sample = { x: 0, y: 0, z: 0, n: 0 };
    for (let attempt = 0; attempt < 3 && hit.n < 10; attempt += 1) {
      const gate = reach;
      hit = sample(
        packed,
        (x, py, z) => py >= y - step * 0.35 && py < y + step * 0.45 && (x - cursor.x) ** 2 + (z - cursor.z) ** 2 < gate * gate,
      );
      reach += 0.07;
    }
    if (hit.n < 10) break;
    cursor = new THREE.Vector3(hit.x, hit.y, hit.z);
    chain.push(cursor.clone());
  }
  return chain;
}

function nearestChainPoint(chain: THREE.Vector3[], y: number) {
  let best = chain[0];
  let bestD = Infinity;
  for (const point of chain) {
    const d = Math.abs(point.y - y);
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

export function rigKevenBody(root: THREE.Object3D) {
  const source = findBody(root);
  if (!source) return false;
  const position = source.geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!position) return false;
  const packed = readPositions(position);
  turnForward(packed);

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
  const chest = sample(packed, (x, y) => y >= yAt(0.64) && y < yAt(0.74) && Math.abs(x) < 0.14);
  const centerX = chest.n > 20 ? chest.x : 0;
  const centerZ = chest.n > 20 ? chest.z : 0;
  writePositions(position, packed);
  source.geometry.computeVertexNormals();
  source.geometry.computeBoundingBox();
  source.geometry.computeBoundingSphere();

  const torso = (y0: number, y1: number) => sample(packed, (x, y) => y >= y0 && y < y1 && Math.abs(x - centerX) < 0.09);
  const point = (hit: Sample, x: number, y: number, z = centerZ) =>
    new THREE.Vector3(hit.n > 12 ? hit.x : x, hit.n > 12 ? hit.y : y, hit.n > 12 ? hit.z : z);

  const hipsP = point(torso(yAt(0.46), yAt(0.54)), centerX, yAt(0.5));
  const spineP = point(torso(yAt(0.54), yAt(0.62)), centerX, yAt(0.58));
  const chestP = point(torso(yAt(0.62), yAt(0.7)), centerX, yAt(0.66));
  const upperP = point(torso(yAt(0.7), yAt(0.78)), centerX, yAt(0.74));
  const neckP = point(torso(yAt(0.78), yAt(0.84)), centerX, yAt(0.81));
  const headP = point(sample(packed, (x, y) => y >= yAt(0.86) && y < yAt(0.94) && Math.abs(x - centerX) < 0.1), centerX, yAt(0.9));
  const crownP = new THREE.Vector3(headP.x, maxY, headP.z);

  const plants = footPlants(packed, minY, height);
  const chains = plants.map((foot) => climbLeg(packed, foot, yAt(0.5), height));
  const thighX = (chain: THREE.Vector3[]) => nearestChainPoint(chain, yAt(0.44)).x;
  chains.sort((a, b) => thighX(b) - thighX(a));
  const leftChain = chains[0];
  const rightChain = chains[1] ?? chains[0];

  const legOf = (chain: THREE.Vector3[]) => {
    const hipSocket = nearestChainPoint(chain, yAt(0.44)).clone();
    const kneeP = nearestChainPoint(chain, yAt(0.28)).clone();
    const ankleP = nearestChainPoint(chain, yAt(0.08)).clone();
    const toeP = nearestChainPoint(chain, yAt(0.03)).clone();
    toeP.z += 0.035;
    return { hipSocket, kneeP, ankleP, toeP };
  };
  const leftLeg = legOf(leftChain);
  const rightLeg = legOf(rightChain);

  const shoulder = (sign: number, y0: number, y1: number) =>
    sample(packed, (x, y, z) => y >= y0 && y < y1 && (x - centerX) * sign > 0.05 && Math.abs(x - centerX) < 0.22 && Math.abs(z - centerZ) < 0.2);

  const leftShoulder = point(shoulder(1, yAt(0.7), yAt(0.8)), centerX + 0.12, yAt(0.75));
  const rightShoulder = point(shoulder(-1, yAt(0.68), yAt(0.78)), centerX - 0.12, yAt(0.74));

  let dartX = centerX + 0.2;
  let dartY = yAt(0.4);
  let dartZ = centerZ;
  for (let i = 0; i < count; i += 2) {
    const x = packed[i * 3];
    const y = packed[i * 3 + 1];
    const z = packed[i * 3 + 2];
    if (y < yAt(0.28) || y > yAt(0.55)) continue;
    if (x > dartX) {
      dartX = x;
      dartY = y;
      dartZ = z;
    }
  }
  const dartTip = new THREE.Vector3(dartX, dartY, dartZ);
  const leftHandHit = sample(
    packed,
    (x, y, z) => x > centerX + 0.1 && x < dartTip.x - 0.05 && y >= yAt(0.32) && y < yAt(0.5) && (x - centerX) ** 2 + (z - centerZ) ** 2 > 0.012,
  );
  const leftHand = point(leftHandHit, centerX + 0.16, yAt(0.42), centerZ);
  const leftElbow = leftShoulder.clone().lerp(leftHand, 0.48);
  const leftWrist = leftElbow.clone().lerp(leftHand, 0.62);

  const rightHandHit = sample(packed, (x, y, z) => x < centerX - 0.08 && y >= yAt(0.82) && z > centerZ - 0.02);
  const rightHand = point(rightHandHit, centerX - 0.14, yAt(0.88), centerZ + 0.12);
  const rightElbowHit = sample(packed, (x, y, z) => x < centerX - 0.08 && y >= yAt(0.5) && y < yAt(0.68) && z > centerZ);
  const rightElbow = point(rightElbowHit, centerX - 0.14, yAt(0.58), centerZ + 0.12);
  const rightWrist = rightElbow.clone().lerp(rightHand, 0.55);

  const skinned = new THREE.SkinnedMesh(source.geometry, source.material);
  skinned.name = source.name || 'KevenBody';
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
  add('LeftShoulder', 'UpperChest', upperP.clone().lerp(leftShoulder, 0.4), leftShoulder);
  add('RightShoulder', 'UpperChest', upperP.clone().lerp(rightShoulder, 0.4), rightShoulder);
  add('LeftUpperArm', 'LeftShoulder', leftShoulder, leftElbow);
  add('RightUpperArm', 'RightShoulder', rightShoulder, rightElbow);
  add('LeftLowerArm', 'LeftUpperArm', leftElbow, leftWrist);
  add('RightLowerArm', 'RightUpperArm', rightElbow, rightWrist);
  add('LeftHand', 'LeftLowerArm', leftWrist, leftHand);
  add('RightHand', 'RightLowerArm', rightWrist, rightHand);
  add('LeftUpperLeg', 'Hips', leftLeg.hipSocket, leftLeg.kneeP);
  add('RightUpperLeg', 'Hips', rightLeg.hipSocket, rightLeg.kneeP);
  add('LeftLowerLeg', 'LeftUpperLeg', leftLeg.kneeP, leftLeg.ankleP);
  add('RightLowerLeg', 'RightUpperLeg', rightLeg.kneeP, rightLeg.ankleP);
  add('LeftFoot', 'LeftLowerLeg', leftLeg.ankleP, leftLeg.toeP);
  add('RightFoot', 'RightLowerLeg', rightLeg.ankleP, rightLeg.toeP);
  add('LeftToe', 'LeftFoot', leftLeg.toeP, leftLeg.toeP.clone().add(new THREE.Vector3(0, -0.004, 0.03)));
  add('RightToe', 'RightFoot', rightLeg.toeP, rightLeg.toeP.clone().add(new THREE.Vector3(0, -0.004, 0.03)));
  // After the body chain, so indices 0–19 stay the torso, arms, and legs.
  const dartBone = bones.length;
  add('LeftDart', 'LeftUpperArm', leftHand, dartTip);

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
    seg(6, 'arm', 'L', upperP, leftShoulder),
    seg(7, 'arm', 'R', upperP, rightShoulder),
    seg(8, 'arm', 'L', leftShoulder, leftElbow),
    seg(9, 'arm', 'R', rightShoulder, rightElbow),
    seg(10, 'arm', 'L', leftElbow, leftWrist),
    seg(11, 'arm', 'R', rightElbow, rightWrist),
    seg(12, 'arm', 'L', leftWrist, leftHand),
    seg(13, 'arm', 'R', rightWrist, rightHand),
    seg(14, 'leg', 'L', leftLeg.hipSocket, leftLeg.kneeP),
    seg(15, 'leg', 'R', rightLeg.hipSocket, rightLeg.kneeP),
    seg(16, 'leg', 'L', leftLeg.kneeP, leftLeg.ankleP),
    seg(17, 'leg', 'R', rightLeg.kneeP, rightLeg.ankleP),
    seg(18, 'leg', 'L', leftLeg.ankleP, leftLeg.toeP),
    seg(19, 'leg', 'R', rightLeg.ankleP, rightLeg.toeP),
    seg(dartBone, 'dart', 'L', leftHand, dartTip),
  ];

  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
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
    let body = 0;
    let bodyD = Infinity;
    let body2 = 0;
    let body2D = Infinity;
    let arm = -1;
    let armD = Infinity;
    let leg = -1;
    let legD = Infinity;
    let dartD = Infinity;
    for (const segment of segments) {
      const d = segmentDistance(x, y, z, segment);
      if (segment.kind === 'dart') dartD = d;
      else if (segment.kind === 'arm') {
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
        body2D = bodyD;
        body2 = body;
        bodyD = d;
        body = segment.index;
      } else if (d < body2D) {
        body2D = d;
        body2 = segment.index;
      }
    }
    // The dart is a thin spike off the left hand. It has to move with that hand.
    const dartReach = 0.09 * 0.09;
    if (dartD < dartReach && dartD + 0.0004 < Math.min(bodyD, legD, armD)) {
      indices[base] = 8;
      weights[base] = 1;
      continue;
    }
    const legColumn = y < hipsP.y && legD < 0.05 * 0.05;
    const offBody = (x - centerX) ** 2 + (z - centerZ) ** 2 > 0.08 * 0.08;
    const useArm = !legColumn && offBody && arm >= 0 && armD < 0.11 * 0.11 && armD + 0.0004 < Math.min(bodyD, legD);
    if (useArm) {
      // One bone per arm. Splitting the forearm from the hand ribbons a punch.
      indices[base] = arm % 2 === 0 ? 8 : 9;
      weights[base] = 1;
      continue;
    }
    const onLeg = leg >= 0 && y < hipsP.y - height * 0.02 && legD < 0.08 * 0.08 && legD + 0.0003 < bodyD;
    if (!onLeg) {
      if (body2 !== body && body2D < 0.035 * 0.035 && body2D < bodyD * 2.5) {
        const sum = bodyD + body2D;
        indices[base] = body;
        indices[base + 1] = body2;
        weights[base] = body2D / sum;
        weights[base + 1] = bodyD / sum;
      } else {
        indices[base] = body;
        weights[base] = 1;
      }
      continue;
    }
    indices[base] = leg % 2 === 0 ? 14 : 15;
    weights[base] = 1;
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
