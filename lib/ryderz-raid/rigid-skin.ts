import * as THREE from 'three';

/**
 * Some generated rigs ship a full skeleton and a mesh welded to a single bone.
 * The joints are real (they live in the inverse bind matrices) but every vertex
 * weight is on the hips, so posing an arm or a leg never moves the picture.
 * This rebuilds the bind pose onto the bones and paints skin weights from
 * vertex proximity to those joints, so the procedural locomotion can drive it.
 */

const _local = new THREE.Matrix4();
const _parentInv = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _vertex = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _closest = new THREE.Vector3();

interface Segment {
  bone: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

function isRigidWeld(mesh: THREE.SkinnedMesh) {
  const index = mesh.geometry.getAttribute('skinIndex');
  const weight = mesh.geometry.getAttribute('skinWeight');
  if (!index || !weight || mesh.skeleton.bones.length < 12) return false;
  const totals = new Float64Array(mesh.skeleton.bones.length);
  const step = Math.max(1, Math.floor(index.count / 4000));
  let samples = 0;
  for (let i = 0; i < index.count; i += step) {
    samples += 1;
    for (let k = 0; k < 4; k += 1) {
      const w = weight.getComponent(i, k);
      if (w <= 0) continue;
      const bone = index.getComponent(i, k);
      if (bone >= 0 && bone < totals.length) totals[bone] += w;
    }
  }
  if (!samples) return false;
  let max = 0;
  for (let i = 0; i < totals.length; i += 1) max = Math.max(max, totals[i]);
  return max / samples > 0.9;
}

/** Put each bone on the joint encoded by its inverse bind, parents first. */
function placeBonesOnBind(mesh: THREE.SkinnedMesh) {
  const bones = mesh.skeleton.bones;
  const inverses = mesh.skeleton.boneInverses;
  if (inverses.length !== bones.length) return null;
  const bindWorld = bones.map((_, i) => inverses[i].clone().invert());
  const inSkeleton = new Set(bones);
  const order: THREE.Bone[] = [];
  const visit = (bone: THREE.Bone) => {
    order.push(bone);
    bone.children.forEach((child) => {
      const next = child as THREE.Bone;
      if (next.isBone && inSkeleton.has(next)) visit(next);
    });
  };
  bones.forEach((bone) => {
    const parent = bone.parent as THREE.Bone | null;
    if (!parent?.isBone || !inSkeleton.has(parent)) visit(bone);
  });
  if (order.length !== bones.length) return null;

  const indexOf = new Map(bones.map((bone, index) => [bone, index]));
  order.forEach((bone) => {
    const index = indexOf.get(bone)!;
    const parent = bone.parent as THREE.Bone | null;
    const parentIndex = parent && inSkeleton.has(parent) ? indexOf.get(parent)! : -1;
    if (parentIndex >= 0) _local.copy(_parentInv.copy(bindWorld[parentIndex]).invert()).multiply(bindWorld[index]);
    else _local.copy(bindWorld[index]);
    _local.decompose(bone.position, bone.quaternion, bone.scale);
  });

  let top: THREE.Object3D = mesh;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);

  const spread = new THREE.Box3();
  bones.forEach((bone) => spread.expandByPoint(_pos.setFromMatrixPosition(bone.matrixWorld)));
  if (spread.getSize(_scale).length() < 0.2) return null;
  return bindWorld;
}

function segmentDistance(px: number, py: number, pz: number, segment: Segment) {
  _ab.set(segment.bx - segment.ax, segment.by - segment.ay, segment.bz - segment.az);
  _ap.set(px - segment.ax, py - segment.ay, pz - segment.az);
  const len2 = _ab.lengthSq();
  const t = len2 < 1e-8 ? 0 : Math.min(1, Math.max(0, _ap.dot(_ab) / len2));
  _closest.copy(_ab).multiplyScalar(t).add(_pos.set(segment.ax, segment.ay, segment.az));
  return _closest.distanceTo(_vertex.set(px, py, pz));
}

interface Cloud {
  xyz: Float32Array;
  count: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function meshCloud(mesh: THREE.SkinnedMesh): Cloud {
  const position = mesh.geometry.getAttribute('position');
  const xyz = new Float32Array(position.count * 3);
  const cloud: Cloud = {
    xyz,
    count: position.count,
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < position.count; i += 1) {
    _vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const o = i * 3;
    xyz[o] = _vertex.x;
    xyz[o + 1] = _vertex.y;
    xyz[o + 2] = _vertex.z;
    cloud.minX = Math.min(cloud.minX, _vertex.x);
    cloud.minY = Math.min(cloud.minY, _vertex.y);
    cloud.minZ = Math.min(cloud.minZ, _vertex.z);
    cloud.maxX = Math.max(cloud.maxX, _vertex.x);
    cloud.maxY = Math.max(cloud.maxY, _vertex.y);
    cloud.maxZ = Math.max(cloud.maxZ, _vertex.z);
  }
  return cloud;
}

function boneGraph(bones: THREE.Bone[]) {
  const inSkeleton = new Set(bones);
  const children: number[][] = bones.map(() => []);
  const parent = new Int32Array(bones.length).fill(-1);
  const indexOf = new Map(bones.map((bone, index) => [bone, index]));
  bones.forEach((bone, index) => {
    const above = bone.parent as THREE.Bone | null;
    if (!above?.isBone || !inSkeleton.has(above)) return;
    const parentIndex = indexOf.get(above);
    if (parentIndex === undefined) return;
    parent[index] = parentIndex;
    children[parentIndex].push(index);
  });
  const order: number[] = [];
  const visit = (index: number) => {
    order.push(index);
    children[index].forEach(visit);
  };
  bones.forEach((_, index) => {
    if (parent[index] < 0) visit(index);
  });
  return { children, parent, order };
}

/** A generated rig sometimes parks its limb joints outside the body. */
function limbsFloat(bones: THREE.Bone[], cloud: Cloud) {
  const { xyz, count } = cloud;
  const height = Math.max(1e-3, cloud.maxY - cloud.minY);
  const step = Math.max(1, Math.floor(count / 2500));
  let sum = 0;
  let samples = 0;
  bones.forEach((bone) => {
    if (!/hand|foot|lowerarm|lowerleg|forearm|calf/i.test(bone.name)) return;
    const joint = _pos.setFromMatrixPosition(bone.matrixWorld);
    let best = Infinity;
    for (let i = 0; i < count; i += step) {
      const o = i * 3;
      const dx = xyz[o] - joint.x;
      const dy = xyz[o + 1] - joint.y;
      const dz = xyz[o + 2] - joint.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < best) best = d;
    }
    sum += best;
    samples += 1;
  });
  return samples > 0 && sum / samples > height * 0.07;
}

function centroidOf(cloud: Cloud, ids: number[]) {
  if (ids.length < 8) return null;
  const point = new THREE.Vector3();
  ids.forEach((id) => {
    const o = id * 3;
    point.x += cloud.xyz[o];
    point.y += cloud.xyz[o + 1];
    point.z += cloud.xyz[o + 2];
  });
  return point.multiplyScalar(1 / ids.length);
}

function alignBoneY(from: THREE.Vector3, to: THREE.Vector3) {
  const y = new THREE.Vector3().subVectors(to, from);
  if (y.lengthSq() < 1e-8) return new THREE.Quaternion();
  y.normalize();
  const hint = Math.abs(y.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(hint, y);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

/**
 * Slide limb joints onto the body they were meant to drive.
 * Spine, chest and head stay where the export put them: those already sit
 * inside the mesh. Hands, feet and knees on a welded Tripo rig often do not,
 * and a pivot in empty space orbits the limb instead of bending it.
 */
function seatFloatingLimbs(mesh: THREE.SkinnedMesh, bindWorld: THREE.Matrix4[]) {
  const bones = mesh.skeleton.bones;
  let top: THREE.Object3D = mesh;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const cloud = meshCloud(mesh);
  if (!limbsFloat(bones, cloud)) return false;

  const height = Math.max(1e-3, cloud.maxY - cloud.minY);
  const xWide = cloud.maxX - cloud.minX >= cloud.maxZ - cloud.minZ;
  const lat = xWide ? 0 : 2;
  const center = xWide ? (cloud.minX + cloud.maxX) / 2 : (cloud.minZ + cloud.maxZ) / 2;
  const half = (xWide ? cloud.maxX - cloud.minX : cloud.maxZ - cloud.minZ) / 2 || height * 0.2;
  const armCut = half * 0.38;
  const { children, parent, order } = boneGraph(bones);
  const { xyz } = cloud;

  const at = (id: number, axis: number) => xyz[id * 3 + axis];
  const targets = new Map<number, THREE.Vector3>();

  const placeSide = (sign: number) => {
    const arm: number[] = [];
    const leg: number[] = [];
    for (let i = 0; i < cloud.count; i += 1) {
      const y = at(i, 1);
      const lateral = at(i, lat) - center;
      if (Math.sign(lateral) !== sign && lateral !== 0) continue;
      const out = Math.abs(lateral);
      const up = (y - cloud.minY) / height;
      if (up > 0.37 && up < 0.8 && out > armCut) arm.push(i);
      else if (up < 0.5 && out > armCut * 0.45) leg.push(i);
    }
    const find = (pattern: RegExp) =>
      bones.findIndex((bone) => {
        const name = bone.name.toLowerCase();
        const side = name.includes('left') ? -1 : name.includes('right') ? 1 : 0;
        return side === sign && pattern.test(bone.name);
      });

    if (arm.length >= 40) {
      const shoulderBand = arm
        .map((id) => ({ id, out: Math.abs(at(id, lat) - center) }))
        .sort((a, b) => a.out - b.out)
        .slice(0, Math.max(8, Math.floor(arm.length * 0.12)))
        .map((item) => item.id);
      const shoulder = centroidOf(cloud, shoulderBand);
      if (shoulder) {
        const reach = arm.map((id) => {
          const dx = at(id, 0) - shoulder.x;
          const dy = at(id, 1) - shoulder.y;
          const dz = at(id, 2) - shoulder.z;
          return { id, d: Math.hypot(dx, dy, dz) };
        });
        const maxD = reach.reduce((m, item) => Math.max(m, item.d), 0) || 1;
        const wrist = centroidOf(
          cloud,
          reach.filter((item) => item.d > maxD * 0.82).map((item) => item.id),
        );
        const elbow = centroidOf(
          cloud,
          reach.filter((item) => item.d > maxD * 0.38 && item.d < maxD * 0.58).map((item) => item.id),
        );
        const upper = find(/upperarm|upper_arm/i);
        const lower = find(/lowerarm|forearm/i);
        const hand = find(/hand/i);
        const shoulderBone = find(/shoulder|clavicle/i);
        if (upper >= 0) targets.set(upper, shoulder.clone());
        if (elbow && lower >= 0) targets.set(lower, elbow);
        if (wrist && hand >= 0) targets.set(hand, wrist);
        if (shoulder && shoulderBone >= 0) {
          const chest = _vertex.setFromMatrixPosition(bindWorld[Math.max(0, parent[shoulderBone])]);
          targets.set(shoulderBone, chest.lerp(shoulder, 0.62).clone());
        }
        if (wrist && hand >= 0) {
          const tip = wrist.clone();
          let tipD = 0;
          reach.forEach((item) => {
            if (item.d < tipD) return;
            tipD = item.d;
            tip.set(at(item.id, 0), at(item.id, 1), at(item.id, 2));
          });
          const along = tip.clone().sub(wrist);
          if (along.lengthSq() > 1e-6) {
            along.normalize();
            const spread = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0));
            if (spread.lengthSq() < 1e-6) spread.set(0, 0, 1);
            spread.normalize();
            const chains: number[][] = [];
            children[hand].forEach((start) => {
              if (!/thumb|index|middle|ring|pinky/i.test(bones[start].name)) return;
              const chain = [start];
              let cursor = start;
              for (;;) {
                const next = children[cursor].find((child) => /thumb|index|middle|ring|pinky/i.test(bones[child].name));
                if (next === undefined) break;
                chain.push(next);
                cursor = next;
              }
              chains.push(chain);
            });
            chains.forEach((chain, finger) => {
              const offset = (finger - (chains.length - 1) / 2) * height * 0.014;
              chain.forEach((bone, link) => {
                const t = (link + 1) / (chain.length + 0.15);
                const point = wrist.clone().lerp(tip, 0.2 + 0.8 * t);
                point.addScaledVector(spread, offset * t);
                targets.set(bone, point);
              });
            });
          }
        }
      }
    }

    if (leg.length >= 40) {
      const ys = leg.map((id) => at(id, 1)).sort((a, b) => a - b);
      const hipCut = ys[Math.floor(ys.length * 0.86)];
      const ankleCut = ys[Math.floor(ys.length * 0.14)];
      const hip = centroidOf(cloud, leg.filter((id) => at(id, 1) >= hipCut));
      const ankle = centroidOf(cloud, leg.filter((id) => at(id, 1) <= ankleCut));
      if (hip && ankle) {
        const span = hip.distanceTo(ankle) || 1;
        const knee = centroidOf(
          cloud,
          leg.filter((id) => {
            const d = Math.hypot(at(id, 0) - hip.x, at(id, 1) - hip.y, at(id, 2) - hip.z);
            return d > span * 0.38 && d < span * 0.62;
          }),
        );
        const upper = find(/upperleg|thigh/i);
        const lower = find(/lowerleg|calf/i);
        const foot = find(/foot/i);
        const toes = find(/toe/i);
        if (upper >= 0) targets.set(upper, hip.clone());
        if (knee && lower >= 0) targets.set(lower, knee);
        if (foot >= 0) targets.set(foot, ankle.clone());
        if (toes >= 0) {
          const sole = leg.filter((id) => at(id, 1) <= ankleCut);
          let toe = ankle.clone();
          let best = -1;
          const fwd = xWide ? 2 : 0;
          sole.forEach((id) => {
            const delta = Math.abs(at(id, fwd) - ankle.getComponent(fwd));
            if (delta > best) {
              best = delta;
              toe.set(at(id, 0), at(id, 1), at(id, 2));
            }
          });
          const cluster = sole.filter((id) => {
            const dx = at(id, 0) - toe.x;
            const dy = at(id, 1) - toe.y;
            const dz = at(id, 2) - toe.z;
            return Math.hypot(dx, dy, dz) < height * 0.05;
          });
          targets.set(toes, centroidOf(cloud, cluster) ?? toe);
        }
      }
    }
  };

  placeSide(-1);
  placeSide(1);
  if (!targets.size) return false;

  const unit = new THREE.Vector3(1, 1, 1);
  order.forEach((index) => {
    const point = targets.get(index);
    if (!point) return;
    const child = children[index].find((candidate) => targets.has(candidate));
    const aim = child !== undefined ? targets.get(child)! : children[index].length ? _pos.setFromMatrixPosition(bindWorld[children[index][0]]) : null;
    const quat = aim ? alignBoneY(point, aim) : _quat.setFromRotationMatrix(bindWorld[index]);
    bindWorld[index].compose(point, quat, unit);
  });

  order.forEach((index) => {
    const bone = bones[index];
    const parentIndex = parent[index];
    if (parentIndex >= 0) _local.copy(bindWorld[parentIndex]).invert().multiply(bindWorld[index]);
    else _local.copy(bindWorld[index]);
    _local.decompose(bone.position, bone.quaternion, bone.scale);
  });
  top.updateMatrixWorld(true);
  bones.forEach((bone, index) => bindWorld[index].copy(bone.matrixWorld));
  return true;
}

function smoothstep(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Bind each vertex to the limb it sits on, measured along the surface, and
 * blend only with the neighbouring joint. Straight-line weights glue a hand
 * that hangs against a thigh to that thigh, so the two limbs tear together.
 */
function paintWeights(mesh: THREE.SkinnedMesh, bindWorld: THREE.Matrix4[]) {
  const bones = mesh.skeleton.bones;
  const cloud = meshCloud(mesh);
  const { xyz, count } = cloud;
  const height = Math.max(1e-3, cloud.maxY - cloud.minY);
  const { children, parent } = boneGraph(bones);
  const joints = bindWorld.map((matrix) => new THREE.Vector3().setFromMatrixPosition(matrix));

  const furthest = (index: number) => {
    let best = joints[index];
    let bestD = 0;
    const stack = children[index].slice();
    while (stack.length) {
      const child = stack.pop()!;
      const d = joints[index].distanceTo(joints[child]);
      if (d > bestD) {
        bestD = d;
        best = joints[child];
      }
      children[child].forEach((next) => stack.push(next));
    }
    return { point: best, distance: bestD };
  };

  const keep = /^(?:(?!twist|eye|thumb|index|middle|ring|pinky|end).)*$/i;
  const named = /neck|head|hips|spine|chest|shoulder|upperarm|lowerarm|forearm|hand|upperleg|thigh|lowerleg|calf|foot|toe/i;
  const major = bones.map((bone, index) => {
    const span = Math.max(
      ...children[index].map((child) => joints[index].distanceTo(joints[child])),
      furthest(index).distance,
      0,
    );
    return (named.test(bone.name) && keep.test(bone.name) && !/twist|eye|end/i.test(bone.name)) || span >= height * 0.045;
  });

  const region = new Int32Array(bones.length);
  bones.forEach((_, index) => {
    let cursor = index;
    while (cursor >= 0 && !major[cursor] && parent[cursor] >= 0) cursor = parent[cursor];
    region[index] = cursor;
  });

  const segments: Segment[] = [];
  const segLen = new Float32Array(bones.length);
  bones.forEach((_, index) => {
    if (!major[index]) return;
    const majorKids = children[index].filter((child) => region[child] !== index && major[region[child]]);
    const ends = majorKids.length
      ? majorKids.map((child) => joints[region[child]])
      : [furthest(index).distance > 0.008 ? furthest(index).point : joints[index].clone().setY(joints[index].y + height * 0.03)];
    const a = joints[index];
    ends.forEach((end) => {
      segLen[index] = Math.max(segLen[index], a.distanceTo(end));
      segments.push({ bone: index, ax: a.x, ay: a.y, az: a.z, bx: end.x, by: end.y, bz: end.z });
    });
  });

  const regionParent = new Int32Array(bones.length).fill(-1);
  const regionChildren: number[][] = bones.map(() => []);
  bones.forEach((_, index) => {
    if (!major[index]) return;
    let cursor = parent[index];
    while (cursor >= 0 && !major[cursor]) cursor = parent[cursor];
    regionParent[index] = cursor;
    if (cursor >= 0) regionChildren[cursor].push(index);
  });

  const adj: number[][] = Array.from({ length: count }, () => []);
  const geoIndex = mesh.geometry.getIndex();
  const triCount = geoIndex ? geoIndex.count / 3 : count / 3;
  const corner = (tri: number, slot: number) => (geoIndex ? geoIndex.getX(tri * 3 + slot) : tri * 3 + slot);
  for (let tri = 0; tri < triCount; tri += 1) {
    const a = corner(tri, 0);
    const b = corner(tri, 1);
    const c = corner(tri, 2);
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }

  const dist = new Float32Array(count).fill(Infinity);
  const owner = new Int32Array(count).fill(-1);
  const nearestBone = new Int32Array(count);
  const heap: { v: number; d: number }[] = [];
  const siftUp = (start: number) => {
    let i = start;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heap[up].d <= heap[i].d) break;
      const swap = heap[up];
      heap[up] = heap[i];
      heap[i] = swap;
      i = up;
    }
  };
  const siftDown = (start: number) => {
    let i = start;
    for (;;) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < heap.length && heap[left].d < heap[smallest].d) smallest = left;
      if (right < heap.length && heap[right].d < heap[smallest].d) smallest = right;
      if (smallest === i) break;
      const swap = heap[smallest];
      heap[smallest] = heap[i];
      heap[i] = swap;
      i = smallest;
    }
  };
  const push = (v: number, d: number, bone: number) => {
    if (d >= dist[v]) return;
    dist[v] = d;
    owner[v] = bone;
    heap.push({ v, d });
    siftUp(heap.length - 1);
  };

  for (let v = 0; v < count; v += 1) {
    const o = v * 3;
    let best = Infinity;
    let second = Infinity;
    let bone = 0;
    for (let s = 0; s < segments.length; s += 1) {
      const d = segmentDistance(xyz[o], xyz[o + 1], xyz[o + 2], segments[s]);
      if (d < best) {
        second = best;
        best = d;
        bone = segments[s].bone;
      } else if (d < second) second = d;
    }
    nearestBone[v] = bone;
    if (best < height * 0.18 && second > best + height * 0.012) push(v, best, bone);
  }

  while (heap.length) {
    const node = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      siftDown(0);
    }
    if (node.d !== dist[node.v]) continue;
    const o = node.v * 3;
    const bone = owner[node.v];
    adj[node.v].forEach((next) => {
      const n = next * 3;
      const step = Math.hypot(xyz[n] - xyz[o], xyz[n + 1] - xyz[o + 1], xyz[n + 2] - xyz[o + 2]);
      push(next, node.d + step, bone);
    });
  }
  for (let v = 0; v < count; v += 1) if (owner[v] < 0) owner[v] = nearestBone[v];

  // Hair that rests on the shoulders gets seeded to the chest. A spine twist
  // then pulls those strands off the skull. Claim the cranium and the hair
  // that grows out of it back onto the head.
  const headBone = bones.findIndex((bone) => /(^|_)head$/i.test(bone.name));
  if (headBone >= 0) {
    const skull = joints[headBone];
    const neckBone = bones.findIndex((bone) => /(^|_)neck$/i.test(bone.name) && !/twist/i.test(bone.name));
    const collar = (neckBone >= 0 ? joints[neckBone].y : skull.y) - height * 0.09;
    const reach = Math.max(cloud.maxY - skull.y, height * 0.14) * 1.35;
    const claimed = new Uint8Array(count);
    const queue: number[] = [];
    for (let v = 0; v < count; v += 1) {
      const o = v * 3;
      const y = xyz[o + 1];
      const d = Math.hypot(xyz[o] - skull.x, y - skull.y, xyz[o + 2] - skull.z);
      if (y > collar && d < reach * 0.62) {
        claimed[v] = 1;
        owner[v] = headBone;
        queue.push(v);
      }
    }
    let cursor = 0;
    while (cursor < queue.length) {
      const v = queue[cursor];
      cursor += 1;
      const o = v * 3;
      adj[v].forEach((next) => {
        if (claimed[next]) return;
        const n = next * 3;
        const y = xyz[n + 1];
        if (y < collar) return;
        const d = Math.hypot(xyz[n] - skull.x, y - skull.y, xyz[n + 2] - skull.z);
        if (d > reach) return;
        claimed[next] = 1;
        owner[next] = headBone;
        queue.push(next);
      });
    }
  }

  const touches = (a: number, b: number) =>
    a === b || regionParent[a] === b || regionParent[b] === a || (regionParent[a] >= 0 && regionParent[a] === regionParent[b]);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = owner.slice();
    for (let v = 0; v < count; v += 1) {
      const tally = new Map<number, number>();
      tally.set(owner[v], 2);
      adj[v].forEach((n) => tally.set(owner[n], (tally.get(owner[n]) ?? 0) + 1));
      let best = owner[v];
      let bestCount = 0;
      tally.forEach((votes, bone) => {
        if (votes > bestCount) {
          bestCount = votes;
          best = bone;
        }
      });
      if (touches(owner[v], best)) next[v] = best;
    }
    owner.set(next);
  }

  const index = new Uint16Array(count * 4);
  const weight = new Float32Array(count * 4);
  for (let v = 0; v < count; v += 1) {
    const bone = owner[v];
    const o = v * 3;
    let other = -1;
    let share = 0;
    const linked = regionParent[bone] >= 0 ? [regionParent[bone], ...regionChildren[bone]] : regionChildren[bone];
    linked.forEach((candidate) => {
      const link = regionParent[candidate] === bone ? joints[candidate] : joints[bone];
      const d = Math.hypot(xyz[o] - link.x, xyz[o + 1] - link.y, xyz[o + 2] - link.z);
      const len = Math.max(segLen[bone], segLen[candidate], height * 0.05);
      const radius = Math.min(height * 0.055, Math.max(height * 0.02, len * 0.3));
      if (d >= radius) return;
      const portion = (1 - smoothstep(d / radius)) * 0.5;
      if (portion > share) {
        share = portion;
        other = candidate;
      }
    });
    index[v * 4] = bone;
    weight[v * 4] = 1 - share;
    index[v * 4 + 1] = other >= 0 ? other : bone;
    weight[v * 4 + 1] = share;
  }

  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  mesh.normalizeSkinWeights();
}

/**
 * Returns true when a rigid weld was rebuilt into a poseable skin.
 * The bind pose is unchanged; only later bone motion deforms the mesh.
 */
export function reskinRigidSkeleton(root: THREE.Object3D) {
  let changed = false;
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) meshes.push(mesh);
  });
  meshes.forEach((mesh) => {
    if (!isRigidWeld(mesh)) return;
    const bindWorld = placeBonesOnBind(mesh);
    if (!bindWorld) return;
    if (seatFloatingLimbs(mesh, bindWorld)) console.info('[raid] seated a floating rig onto the body');
    paintWeights(mesh, bindWorld);
    let top: THREE.Object3D = mesh;
    while (top.parent) top = top.parent;
    top.updateMatrixWorld(true);
    mesh.skeleton.calculateInverses();
    changed = true;
  });
  return changed;
}
