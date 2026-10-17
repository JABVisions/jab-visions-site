import * as THREE from 'three';

/**
 * The 8k Rubi export is one static body plus a sword standing beside her.
 * This builds a humanoid skeleton in that pose, skins the body to it, and
 * seats the sword in her right hand so the shared walk, run, punch, jump,
 * and blade poses swing it with the arm.
 *
 * +X is her left, matching the raid skeleton. The face is +Z.
 */

interface Sample {
  x: number;
  y: number;
  z: number;
  zMid: number;
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

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))];
}

function sample(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  count: number,
  accept: (x: number, y: number, z: number) => boolean,
): Sample {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const step = count > 80000 ? 2 : 1;
  for (let i = 0; i < count; i += step) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (!accept(x, y, z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }
  const zBack = percentile(zs.slice(), 0.08);
  const zFront = percentile(zs.slice(), 0.92);
  return {
    x: median(xs),
    y: median(ys),
    z: median(zs),
    zMid: zs.length ? (zBack + zFront) * 0.5 : 0,
    n: xs.length,
  };
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

function allowed(seg: Segment, x: number, y: number, minY: number, height: number, centerX: number, halfW: number) {
  const yn = (y - minY) / height;
  const lateral = x - centerX;
  const ax = Math.abs(lateral);
  const side = lateral >= 0 ? 'L' : 'R';
  if (seg.side !== 'C' && seg.side !== side && ax > halfW * 0.12) return false;
  if (yn > 0.84 && ax < halfW * 0.85) return seg.region === 'head';
  if (yn < 0.46 && ax < halfW * 0.85) return seg.region === 'leg' || (seg.region === 'torso' && yn > 0.4);
  if (ax > halfW * 0.42 && yn > 0.46 && yn < 0.82) return seg.region === 'arm' && seg.side === side;
  if (ax < halfW * 0.5 && yn >= 0.42 && yn <= 0.86) return seg.region === 'torso' || seg.region === 'head' || (seg.region === 'arm' && ax > halfW * 0.28);
  return seg.side === 'C' || seg.side === side;
}

function findSword(root: THREE.Object3D): THREE.Mesh | null {
  let sword: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (mesh.name === 'Sword' || mesh.parent?.name === 'Sword') sword = mesh;
  });
  return sword;
}

function findBody(root: THREE.Object3D): THREE.Mesh | null {
  let body: THREE.Mesh | null = null;
  let best = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.name === 'Sword') return;
    const count = mesh.geometry.getAttribute('position')?.count ?? 0;
    if (count > best) {
      best = count;
      body = mesh;
    }
  });
  return body;
}

/**
 * How far from each end the mesh stays narrow, as a fraction of the profile.
 * A handle is a neck. A tip flares into the blade within the first bands.
 */
export function gripNecks(radii: number[]): { low: number; high: number } {
  const peak = radii.reduce((max, radius) => Math.max(max, radius), 1e-4);
  const limit = peak * 0.38;
  const run = (seq: number[]) => {
    let n = 0;
    for (const radius of seq) {
      if (radius > limit) break;
      n += 1;
    }
    return n / Math.max(1, seq.length);
  };
  return { low: run(radii), high: run([...radii].reverse()) };
}

/** The longer narrow neck is the grip. Equal necks fall back to whichever end is nearer the hand. */
export function pickGripEnd(lowNeck: number, highNeck: number, lowNearHand: boolean): 'low' | 'high' {
  if (Math.abs(lowNeck - highNeck) >= 0.04) return lowNeck > highNeck ? 'low' : 'high';
  return lowNearHand ? 'low' : 'high';
}

/** Move the loose sword so its grip sits in the right fist and the blade runs out through the fingers. */
function seatSword(hand: THREE.Bone, sword: THREE.Mesh) {
  sword.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  const position = sword.geometry.getAttribute('position');
  const count = position.count;
  const src = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const mean = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(sword.matrixWorld);
    src[i * 3] = v.x;
    src[i * 3 + 1] = v.y;
    src[i * 3 + 2] = v.z;
    mean.add(v);
  }
  mean.multiplyScalar(1 / count);

  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;
  for (let i = 0; i < count; i += 1) {
    const x = src[i * 3] - mean.x;
    const y = src[i * 3 + 1] - mean.y;
    const z = src[i * 3 + 2] - mean.z;
    cxx += x * x;
    cyy += y * y;
    czz += z * z;
    cxy += x * y;
    cxz += x * z;
    cyz += y * z;
  }
  // Power iteration on the covariance. The blade is the long axis.
  let axis = new THREE.Vector3(0, 1, 0);
  const cov = (p: THREE.Vector3) =>
    new THREE.Vector3(
      cxx * p.x + cxy * p.y + cxz * p.z,
      cxy * p.x + cyy * p.y + cyz * p.z,
      cxz * p.x + cyz * p.y + czz * p.z,
    );
  for (let i = 0; i < 12; i += 1) axis = cov(axis).normalize();

  let minT = Infinity;
  let maxT = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const t = (src[i * 3] - mean.x) * axis.x + (src[i * 3 + 1] - mean.y) * axis.y + (src[i * 3 + 2] - mean.z) * axis.z;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const endAt = (t: number) => mean.clone().addScaledVector(axis, t);
  const handPoint = new THREE.Vector3();
  hand.getWorldPosition(handPoint);
  const low = endAt(minT);
  const high = endAt(maxT);
  const span0 = Math.max(1e-4, maxT - minT);
  const bands = 12;
  const bandSum = new Array<number>(bands).fill(0);
  const bandCount = new Array<number>(bands).fill(0);
  for (let i = 0; i < count; i += 1) {
    const px = src[i * 3] - mean.x;
    const py = src[i * 3 + 1] - mean.y;
    const pz = src[i * 3 + 2] - mean.z;
    const t = px * axis.x + py * axis.y + pz * axis.z;
    const band = Math.min(bands - 1, Math.max(0, Math.floor(((t - minT) / span0) * bands)));
    const radius = Math.hypot(px - axis.x * t, py - axis.y * t, pz - axis.z * t);
    bandSum[band] += radius;
    bandCount[band] += 1;
  }
  const bandRadii = bandSum.map((sum, index) => (bandCount[index] ? sum / bandCount[index] : 0));
  const necks = gripNecks(bandRadii);
  const lowNearHand = low.distanceToSquared(handPoint) < high.distanceToSquared(handPoint);
  const handleIsLow = pickGripEnd(necks.low, necks.high, lowNearHand) === 'low';
  const gripEnd = (handleIsLow ? low : high).clone();
  const tipEnd = (handleIsLow ? high : low).clone();
  const bladeDir = tipEnd.sub(gripEnd);
  const span = bladeDir.length();
  if (span < 1e-4) return;
  bladeDir.multiplyScalar(1 / span);
  const grip = gripEnd.addScaledVector(bladeDir, span * 0.12);

  // A second axis in the blade's wide direction, so the flat faces sideways.
  const wide = new THREE.Vector3(1, 0, 0);
  const trial = cov(new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x));
  if (trial.lengthSq() > 1e-8) wide.copy(trial).addScaledVector(axis, -trial.dot(axis)).normalize();

  const handY = new THREE.Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
  const handX = new THREE.Vector3(1, 0, 0).transformDirection(hand.matrixWorld);
  const align = new THREE.Quaternion().setFromUnitVectors(bladeDir, handY);
  const rolled = wide.clone().applyQuaternion(align);
  rolled.addScaledVector(handY, -rolled.dot(handY));
  if (rolled.lengthSq() > 1e-6) {
    const want = handX.clone().addScaledVector(handY, -handX.dot(handY));
    if (want.lengthSq() > 1e-6) {
      const roll = new THREE.Quaternion().setFromUnitVectors(rolled.normalize(), want.normalize());
      align.premultiply(roll);
    }
  }

  const gripAlong = Math.min(0.055, Math.max(0.02, span * 0.08));
  const gripWorld = handPoint.clone().addScaledVector(handY, gripAlong);
  const handInv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
  for (let i = 0; i < count; i += 1) {
    v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
    v.sub(grip).applyQuaternion(align).add(gripWorld).applyMatrix4(handInv);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  position.needsUpdate = true;
  sword.position.set(0, 0, 0);
  sword.quaternion.identity();
  sword.scale.set(1, 1, 1);
  sword.geometry.computeBoundingBox();
  sword.geometry.computeBoundingSphere();
  hand.add(sword);
}

export function rigRubiBody(root: THREE.Object3D) {
  const source = findBody(root);
  const sword = findSword(root);
  if (!source) return false;
  const position = source.geometry.getAttribute('position');
  if (!position) return false;
  const count = position.count;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 4) {
    const x = position.getX(i);
    const y = position.getY(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(0.001, maxY - minY);
  const yAt = (t: number) => minY + height * t;
  const chest = sample(position, count, (_x, y) => y >= yAt(0.64) && y < yAt(0.76));
  const centerX = chest.n > 20 ? chest.x : (minX + maxX) * 0.5;
  const halfW = Math.max(Math.abs(minX - centerX), Math.abs(maxX - centerX), 0.001);

  const torso = (y0: number, y1: number) =>
    sample(position, count, (x, y) => y >= y0 && y < y1 && Math.abs(x - centerX) < halfW * 0.42);
  const point = (hit: Sample, x: number, y: number, z = 0, interior = false) =>
    new THREE.Vector3(hit.n > 12 ? hit.x : x, hit.n > 12 ? hit.y : y, hit.n > 12 ? (interior ? hit.zMid : hit.z) : z);

  const hip = torso(yAt(0.44), yAt(0.52));
  const waist = torso(yAt(0.52), yAt(0.6));
  const chestHit = torso(yAt(0.62), yAt(0.7));
  const upper = torso(yAt(0.7), yAt(0.78));
  const neck = torso(yAt(0.78), yAt(0.84));
  const head = torso(yAt(0.86), yAt(0.94));

  const hipsP = point(hip, centerX, yAt(0.48), 0, true);
  const spineP = point(waist, centerX, yAt(0.56), 0, true);
  const chestP = point(chestHit, centerX, yAt(0.66), 0, true);
  const upperP = point(upper, centerX, yAt(0.74), 0, true);
  const neckP = point(neck, centerX, yAt(0.8), 0, true);
  const headP = point(head, centerX, yAt(0.88), 0, true);
  const crownP = new THREE.Vector3(headP.x, maxY, headP.z);

  const limb = (sign: number) => {
    const sideOf = (x: number) => (x - centerX) * sign;
    const arm = (y0: number, y1: number, minLateral: number) =>
      sample(position, count, (x, y) => y >= y0 && y < y1 && sideOf(x) > halfW * minLateral);
    const leg = (y0: number, y1: number) =>
      sample(position, count, (x, y) => y >= y0 && y < y1 && sideOf(x) > halfW * 0.08 && sideOf(x) < halfW * 0.72);
    const shoulder = arm(yAt(0.72), yAt(0.8), 0.35);
    const elbow = arm(yAt(0.6), yAt(0.68), 0.5);
    const wrist = arm(yAt(0.52), yAt(0.58), 0.58);
    const hand = arm(yAt(0.47), yAt(0.54), 0.62);
    const thigh = leg(yAt(0.4), yAt(0.5));
    const knee = leg(yAt(0.22), yAt(0.32));
    const ankle = leg(yAt(0.05), yAt(0.12));
    const foot = leg(minY, yAt(0.06));
    const toe = sample(
      position,
      count,
      (x, y, z) => y < yAt(0.07) && sideOf(x) > halfW * 0.08 && z > (foot.n > 12 ? foot.zMid : 0),
    );
    const shoulderP = point(shoulder, centerX + sign * halfW * 0.55, yAt(0.75));
    const elbowP = point(elbow, centerX + sign * halfW * 0.85, yAt(0.64));
    const wristP = point(wrist, centerX + sign * halfW * 0.95, yAt(0.54));
    const handP = point(hand, centerX + sign * halfW * 1.0, yAt(0.5));
    const hipSocket = point(thigh, centerX + sign * halfW * 0.22, yAt(0.46), hipsP.z);
    const kneeP = point(knee, centerX + sign * halfW * 0.22, yAt(0.27));
    const ankleP = point(ankle, centerX + sign * halfW * 0.22, yAt(0.08));
    const toeP = point(toe.n > 12 ? toe : foot, ankleP.x, yAt(0.02), ankleP.z + 0.04);
    if (toe.n > 12) toeP.z = Math.max(toeP.z, toe.z);
    return { shoulderP, elbowP, wristP, handP, hipSocket, kneeP, ankleP, toeP };
  };
  const left = limb(1);
  const right = limb(-1);

  const skinned = new THREE.SkinnedMesh(source.geometry, source.material);
  skinned.name = source.name || 'RubiBody';
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

  const seg = (
    index: number,
    side: Segment['side'],
    region: Segment['region'],
    a: THREE.Vector3,
    b: THREE.Vector3,
  ): Segment => ({ index, side, region, ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z });
  const segments: Segment[] = [
    seg(0, 'C', 'torso', hipsP, spineP),
    seg(1, 'C', 'torso', spineP, chestP),
    seg(2, 'C', 'torso', chestP, upperP),
    seg(3, 'C', 'torso', upperP, neckP),
    seg(4, 'C', 'head', neckP, headP),
    seg(5, 'C', 'head', headP, crownP),
    seg(6, 'L', 'arm', upperP, left.shoulderP),
    seg(7, 'R', 'arm', upperP, right.shoulderP),
    seg(8, 'L', 'arm', left.shoulderP, left.elbowP),
    seg(9, 'R', 'arm', right.shoulderP, right.elbowP),
    seg(10, 'L', 'arm', left.elbowP, left.wristP),
    seg(11, 'R', 'arm', right.elbowP, right.wristP),
    seg(12, 'L', 'arm', left.wristP, left.handP),
    seg(13, 'R', 'arm', right.wristP, right.handP),
    seg(14, 'L', 'leg', left.hipSocket, left.kneeP),
    seg(15, 'R', 'leg', right.hipSocket, right.kneeP),
    seg(16, 'L', 'leg', left.kneeP, left.ankleP),
    seg(17, 'R', 'leg', right.kneeP, right.ankleP),
    seg(18, 'L', 'leg', left.ankleP, left.toeP),
    seg(19, 'R', 'leg', right.ankleP, right.toeP),
  ];

  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const picked: Array<{ index: number; d: number }> = [];
  const headIndex = 5;
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const onSkull = y > neckP.y && Math.abs(x - centerX) < halfW * 0.9 && y > headP.y - height * 0.04;
    if (onSkull) {
      indices[i * 4] = headIndex;
      weights[i * 4] = 1;
      continue;
    }
    picked.length = 0;
    for (const segment of segments) {
      if (!allowed(segment, x, y, minY, height, centerX, halfW)) continue;
      const d = segmentDistance(x, y, z, segment);
      if (picked.length < 2) {
        picked.push({ index: segment.index, d });
        if (picked.length === 2 && picked[0].d > picked[1].d) {
          const swap = picked[0];
          picked[0] = picked[1];
          picked[1] = swap;
        }
      } else if (d < picked[1].d) {
        picked[1] = { index: segment.index, d };
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
      for (const segment of segments) {
        const d = segmentDistance(x, y, z, segment);
        if (d < bestD) {
          bestD = d;
          best = segment.index;
        }
      }
      picked.push({ index: best, d: bestD });
    }
    const base = i * 4;
    const sameLimb =
      picked.length > 1 &&
      Math.abs(picked[0].index - picked[1].index) <= 2 &&
      picked[1].d < picked[0].d * 1.45 &&
      picked[0].d < height * height * 0.01;
    if (!sameLimb) {
      indices[base] = picked[0].index;
      weights[base] = 1;
    } else {
      const w0 = 1 / (Math.sqrt(picked[0].d) + 0.004);
      const w1 = 1 / (Math.sqrt(picked[1].d) + 0.004);
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

  const rightHand = byName.get('RightHand');
  if (sword && rightHand) seatSword(rightHand, sword);

  return true;
}
