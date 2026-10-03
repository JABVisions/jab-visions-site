import * as THREE from 'three';

/**
 * Procedural skeletal animation for rigged GLBs that ship without clips
 * (Tripo auto-rigs). We neutralise whatever pose the model was exported in
 * into a standing stance, then drive the bones with figure-space rotations
 * (strides, arm swings, torso twist, a melee chop) that children inherit.
 *
 * Figure space: +Y up, +Z forward, +X the character's left.
 */

export type BoneKey =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'shoulderR'
  | 'upperArmL'
  | 'upperArmR'
  | 'lowerArmL'
  | 'lowerArmR'
  | 'handL'
  | 'handR'
  | 'upperLegL'
  | 'upperLegR'
  | 'lowerLegL'
  | 'lowerLegR'
  | 'footL'
  | 'footR'
  | 'toesL'
  | 'toesR'
  | 'eyeL'
  | 'eyeR';

const BONE_PATTERNS: Record<BoneKey, RegExp> = {
  hips: /^(mixamorig)?[_:]?(hips|pelvis)$/i,
  spine: /^(mixamorig)?[_:]?(spine|spine_?0?1)$/i,
  chest: /^(mixamorig)?[_:]?(chest|spine_?0?2)$/i,
  upperChest: /^(mixamorig)?[_:]?(upperchest|spine_?0?3)$/i,
  neck: /^(mixamorig)?[_:]?neck$/i,
  head: /^(mixamorig)?[_:]?head$/i,
  shoulderL: /^(mixamorig)?[_:]?(left_?shoulder|l_?clavicle|leftclavicle)$/i,
  shoulderR: /^(mixamorig)?[_:]?(right_?shoulder|r_?clavicle|rightclavicle)$/i,
  upperArmL: /^(mixamorig)?[_:]?(left_?upperarm|left_?arm|l_?upperarm)$/i,
  upperArmR: /^(mixamorig)?[_:]?(right_?upperarm|right_?arm|r_?upperarm)$/i,
  lowerArmL: /^(mixamorig)?[_:]?(left_?lowerarm|left_?forearm|l_?forearm)$/i,
  lowerArmR: /^(mixamorig)?[_:]?(right_?lowerarm|right_?forearm|r_?forearm)$/i,
  handL: /^(mixamorig)?[_:]?(left_?hand|l_?hand)$/i,
  handR: /^(mixamorig)?[_:]?(right_?hand|r_?hand)$/i,
  upperLegL: /^(mixamorig)?[_:]?(left_?upperleg|left_?upleg|l_?thigh)$/i,
  upperLegR: /^(mixamorig)?[_:]?(right_?upperleg|right_?upleg|r_?thigh)$/i,
  lowerLegL: /^(mixamorig)?[_:]?(left_?lowerleg|left_?leg|l_?calf)$/i,
  lowerLegR: /^(mixamorig)?[_:]?(right_?lowerleg|right_?leg|r_?calf)$/i,
  footL: /^(mixamorig)?[_:]?(left_?foot|l_?foot)$/i,
  footR: /^(mixamorig)?[_:]?(right_?foot|r_?foot)$/i,
  toesL: /^(mixamorig)?[_:]?(left_?toes?|left_?toebase|l_?toe)$/i,
  toesR: /^(mixamorig)?[_:]?(right_?toes?|right_?toebase|r_?toe)$/i,
  eyeL: /^(mixamorig)?[_:]?left_?eye$/i,
  eyeR: /^(mixamorig)?[_:]?right_?eye$/i,
};

/** Bones that receive animation rotations (the rest just inherit). */
const ANIMATED: BoneKey[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'shoulderL',
  'shoulderR',
  'upperArmL',
  'upperArmR',
  'lowerArmL',
  'lowerArmR',
  'handL',
  'handR',
  'upperLegL',
  'upperLegR',
  'lowerLegL',
  'lowerLegR',
  'footL',
  'footR',
];

interface BoneEntry {
  bone: THREE.Bone;
  parent: BoneEntry | null;
  /** Figure-space orientation of a non-bone parent (roots only). */
  parentFig: THREE.Quaternion;
  key: BoneKey | null;
  restLocal: THREE.Quaternion;
  restFig: THREE.Quaternion;
  restPos: THREE.Vector3;
  baseFig: THREE.Quaternion;
  fig: THREE.Quaternion;
  acc: THREE.Quaternion;
}

export interface PoseAngles {
  x: number;
  y: number;
  z: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const LEFT = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const IDENTITY = new THREE.Quaternion();

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

interface NeutralTarget {
  /** Where the bone's own +Y axis should point. */
  dir: THREE.Vector3;
  /**
   * Optional feature axis used instead of the bone axis when those bones exist:
   * the rest vector from `from` to the centroid of `to` should end up along `dir`.
   */
  axis?: { from: BoneKey; to: BoneKey[]; dir: THREE.Vector3 };
  /**
   * Roll references, tried in order: a rest-pose vector between two bones and
   * where its component perpendicular to the bone should point. A reference is
   * skipped when that perpendicular component is too small to be trustworthy.
   */
  refs?: Array<{ from: BoneKey; to: BoneKey; target: THREE.Vector3 }>;
}

function dir(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).normalize();
}

const BACK = new THREE.Vector3(0, 0, -1);
const SHOULDER_LINE = { from: 'shoulderR' as BoneKey, to: 'shoulderL' as BoneKey, target: LEFT };

const NEUTRAL: Partial<Record<BoneKey, NeutralTarget>> = {
  hips: { dir: dir(0, 1, 0), refs: [{ from: 'upperLegR', to: 'upperLegL', target: LEFT }] },
  spine: { dir: dir(0, 1, 0.02), refs: [SHOULDER_LINE] },
  chest: { dir: dir(0, 1, 0), refs: [SHOULDER_LINE] },
  upperChest: { dir: dir(0, 1, -0.02), refs: [SHOULDER_LINE] },
  neck: { dir: dir(0, 1, 0.08) },
  // Auto-rig head bones aim at the face, not the crown: level the head by
  // putting the eyes up-and-forward of the skull base instead.
  head: {
    dir: dir(0, 1, 0),
    axis: { from: 'head', to: ['eyeL', 'eyeR'], dir: dir(0, 0.78, 0.63) },
    refs: [{ from: 'eyeR', to: 'eyeL', target: LEFT }],
  },
  // Clavicles are left as exported: forcing them swings the whole arm chain.
  // Arm roll comes from a bent elbow (forearms bend forward); a straight arm
  // keeps its exported roll.
  upperArmL: { dir: dir(0.24, -1, 0.04), refs: [{ from: 'lowerArmL', to: 'handL', target: FORWARD }] },
  upperArmR: { dir: dir(-0.24, -1, 0.04), refs: [{ from: 'lowerArmR', to: 'handR', target: FORWARD }] },
  lowerArmL: { dir: dir(0.18, -1, 0.42) },
  lowerArmR: { dir: dir(-0.18, -1, 0.42) },
  handL: { dir: dir(0.16, -1, 0.5) },
  handR: { dir: dir(-0.16, -1, 0.5) },
  // Leg roll: knees bend backward; failing a bent knee, feet point forward.
  upperLegL: {
    dir: dir(0.07, -1, 0),
    refs: [
      { from: 'lowerLegL', to: 'footL', target: BACK },
      { from: 'footL', to: 'toesL', target: FORWARD },
    ],
  },
  upperLegR: {
    dir: dir(-0.07, -1, 0),
    refs: [
      { from: 'lowerLegR', to: 'footR', target: BACK },
      { from: 'footR', to: 'toesR', target: FORWARD },
    ],
  },
  lowerLegL: { dir: dir(0.02, -1, -0.03) },
  lowerLegR: { dir: dir(-0.02, -1, -0.03) },
  // Feet and toes keep their exported ankle angle: auto-rigs place those bones
  // too inconsistently to correct blindly.
};

interface BoneSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

const _seg = new THREE.Vector3();
const _pt = new THREE.Vector3();

function segmentDistance(p: THREE.Vector3, seg: BoneSegment) {
  _seg.subVectors(seg.b, seg.a);
  const len2 = _seg.lengthSq();
  const t = len2 > 0 ? THREE.MathUtils.clamp(_pt.subVectors(p, seg.a).dot(_seg) / len2, 0, 1) : 0;
  return _pt.copy(seg.a).addScaledVector(_seg, t).distanceTo(p);
}

/** Rendered rest-pose position of every vertex of a skinned mesh, in world space. */
function restPositions(mesh: THREE.SkinnedMesh) {
  const position = mesh.geometry.getAttribute('position');
  const out = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  mesh.skeleton.update();
  for (let i = 0; i < position.count; i += 1) {
    mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

/**
 * Judge whether an auto-rig's weights match its geometry. Multi-part exports
 * sometimes ship garbage weights (a head skinned to the legs) that render
 * fine at rest and tear apart the moment a bone moves. For each skinned part
 * we measure how far its vertices sit from the bones they are weighted to.
 * Returns the names of the parts that fail.
 */
export function assessSkinning(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const broken: string[] = [];
  const bounds = new THREE.Box3().setFromObject(root);
  const height = Math.max(1e-3, bounds.max.y - bounds.min.y);
  const p = new THREE.Vector3();

  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    if (!index || !weight) return;

    const segments: BoneSegment[] = mesh.skeleton.bones.map((bone) => {
      const a = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
      const kids = bone.children.filter((c) => (c as THREE.Bone).isBone);
      const b = new THREE.Vector3();
      if (kids.length) {
        kids.forEach((k) => b.add(p.setFromMatrixPosition(k.matrixWorld)));
        b.multiplyScalar(1 / kids.length);
      } else {
        b.copy(a).add(p.set(0, 1, 0).transformDirection(bone.matrixWorld).multiplyScalar(height * 0.04));
      }
      return { a, b };
    });

    const rest = restPositions(mesh);
    let sumD = 0;
    let sumW = 0;
    let samples = 0;
    let rigid = 0;
    let rigidBone = -1;
    const step = Math.max(1, Math.floor(index.count / 2500));
    for (let i = 0; i < index.count; i += step) {
      p.fromArray(rest, i * 3);
      samples += 1;
      if (weight.getComponent(i, 0) >= 0.999) {
        const bone = index.getComponent(i, 0);
        if (rigidBone < 0) rigidBone = bone;
        if (bone === rigidBone) rigid += 1;
      }
      for (let k = 0; k < 4; k += 1) {
        const w = weight.getComponent(i, k);
        if (w <= 0.05) continue;
        sumD += w * segmentDistance(p, segments[index.getComponent(i, k)]);
        sumW += w;
      }
    }
    // A part welded entirely to one bone is a held prop (sword, bat); it legitimately
    // reaches far from that bone and is not evidence of scrambled weights.
    if (samples > 0 && rigid / samples > 0.95) return;
    if (sumW > 0 && sumD / sumW > height * 0.14) broken.push(mesh.name);
  });
  return broken;
}

/**
 * Freeze a rigged scene into plain meshes in its rendered rest pose and drop
 * the skeleton. Used when the rig cannot be trusted: the model still looks
 * exactly like its export and animates as a puppet instead.
 */
export function bakeSkinnedMeshes(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
  });
  for (const mesh of skinned) {
    const source = mesh.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(restPositions(mesh), 3));
    for (const name of ['uv', 'uv1', 'color']) {
      const attribute = source.getAttribute(name);
      if (attribute) geometry.setAttribute(name, attribute);
    }
    if (source.index) geometry.setIndex(source.index);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const baked = new THREE.Mesh(geometry, mesh.material);
    baked.name = mesh.name;
    baked.frustumCulled = mesh.frustumCulled;
    // Positions were baked in world space; the scene is unattached, so that is root space.
    root.add(baked);
    mesh.removeFromParent();
  }
  const bones: THREE.Object3D[] = [];
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone && !(object.parent as THREE.Bone | null)?.isBone) bones.push(object);
  });
  bones.forEach((bone) => bone.removeFromParent());
  return skinned.length;
}

/** Clips that are not strikes: locomotion and emotes. */
const NON_STRIKE_CLIP = /idle|breath|stand|rest|walk|run|jog|sprint|angry|taunt|emote|gesture|cheer|dance|wave|death|die|hit_?react/i;
const ROOT_BONE = /^(mixamorig)?[_:]?(root|hips?|pelvis|waist)$/i;

/**
 * Cut short, in-place melee strikes out of long fight clips.
 *
 * Mocap-style exports often ship multi-second combos ("jab, cross, jab") with
 * root motion baked into the hips. The game's melee lasts about half a second
 * and the fighter is moved by gameplay, so we sample hand speed through each
 * clip, take a window around every speed peak and drop the hip translation
 * tracks from the result. Clips that read as locomotion are left alone.
 */
export function extractStrikes(root: THREE.Object3D, clips: THREE.AnimationClip[], window = { before: 0.22, after: 0.3 }) {
  const limbs: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    if ((['handL', 'handR', 'footL', 'footR'] as BoneKey[]).some((key) => BONE_PATTERNS[key].test(o.name))) limbs.push(o);
  });
  if (!limbs.length) return [];

  const mixer = new THREE.AnimationMixer(root);
  const saved = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  root.traverse((o) => saved.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));

  // Pass 1: limb speed profile per clip (fastest hand or foot at each sample).
  const rate = 60;
  const p = new THREE.Vector3();
  const profiles: { clip: THREE.AnimationClip; speed: Float32Array }[] = [];
  let max = 0;
  for (const clip of clips) {
    if (NON_STRIKE_CLIP.test(clip.name) || clip.duration < window.before + window.after) continue;
    const action = mixer.clipAction(clip);
    action.play();
    const steps = Math.floor(clip.duration * rate);
    const speed = new Float32Array(steps + 1);
    const prev = limbs.map(() => new THREE.Vector3(NaN, NaN, NaN));
    for (let i = 0; i <= steps; i += 1) {
      mixer.setTime(i / rate);
      root.updateMatrixWorld(true);
      limbs.forEach((limb, k) => {
        p.setFromMatrixPosition(limb.matrixWorld);
        if (!Number.isNaN(prev[k].x)) speed[i] = Math.max(speed[i], p.distanceTo(prev[k]) * rate);
        prev[k].copy(p);
      });
    }
    action.stop();
    mixer.uncacheClip(clip);
    // Ignore the wrap-around sample at the very end.
    for (let i = 1; i < steps - 1; i += 1) max = Math.max(max, speed[i]);
    profiles.push({ clip, speed });
  }

  saved.forEach((state, o) => {
    o.position.copy(state.p);
    o.quaternion.copy(state.q);
    o.scale.copy(state.s);
  });
  root.updateMatrixWorld(true);
  if (max <= 0) return [];

  // Pass 2: a strike per prominent speed peak, judged against the fastest
  // move in the whole set so half-hearted shuffles do not count.
  const strikes: THREE.AnimationClip[] = [];
  const threshold = max * 0.4;
  const gap = Math.round(rate * 0.35);
  for (const { clip, speed } of profiles) {
    const steps = speed.length - 1;
    let lastPeak = -Infinity;
    for (let i = 2; i < steps - 1; i += 1) {
      const v = speed[i];
      if (v < threshold || v < speed[i - 1] || v < speed[i + 1] || i - lastPeak < gap) continue;
      lastPeak = i;
      const t = i / rate;
      const start = Math.max(0, t - window.before);
      const end = Math.min(clip.duration, t + window.after);
      const tracks = clip.tracks
        .filter((track) => !(track.name.endsWith('.position') && ROOT_BONE.test(track.name.split('.')[0])))
        .map((track) => track.clone().trim(start, end).shift(-start))
        .filter((track) => track.times.length > 0);
      if (tracks.length) strikes.push(new THREE.AnimationClip(`${clip.name} @${t.toFixed(2)}`, end - start, tracks));
    }
  }
  return strikes;
}

export class ProceduralSkeleton {
  readonly figure: THREE.Object3D;
  readonly entries: BoneEntry[] = [];
  readonly byKey = new Map<BoneKey, BoneEntry>();
  readonly angles: Record<BoneKey, PoseAngles>;

  constructor(figure: THREE.Object3D) {
    this.figure = figure;
    this.angles = Object.fromEntries(
      (Object.keys(BONE_PATTERNS) as BoneKey[]).map((k) => [k, { x: 0, y: 0, z: 0 }]),
    ) as Record<BoneKey, PoseAngles>;

    figure.updateWorldMatrix(true, true);
    const figInverse = new THREE.Matrix4().copy(figure.matrixWorld).invert();
    const byBone = new Map<THREE.Bone, BoneEntry>();

    // traverse() is depth-first, so parents are always registered before children.
    figure.traverse((object) => {
      const bone = object as THREE.Bone;
      if (!bone.isBone) return;
      const parentBone = bone.parent as THREE.Bone | null;
      const parent = parentBone && byBone.has(parentBone) ? byBone.get(parentBone)! : null;

      _m.multiplyMatrices(figInverse, bone.matrixWorld);
      const restFig = new THREE.Quaternion();
      const restPos = new THREE.Vector3();
      _m.decompose(restPos, restFig, _s);

      const parentFig = new THREE.Quaternion();
      if (!parent && bone.parent) {
        _m.multiplyMatrices(figInverse, bone.parent.matrixWorld);
        _m.decompose(_p, parentFig, _s);
      }

      const key = (Object.keys(BONE_PATTERNS) as BoneKey[]).find((k) => BONE_PATTERNS[k].test(bone.name)) ?? null;
      const entry: BoneEntry = {
        bone,
        parent,
        parentFig,
        key: key && !this.byKey.has(key) ? key : null,
        restLocal: bone.quaternion.clone(),
        restFig,
        restPos,
        baseFig: restFig.clone(),
        fig: restFig.clone(),
        acc: new THREE.Quaternion(),
      };
      this.entries.push(entry);
      byBone.set(bone, entry);
      if (entry.key) this.byKey.set(entry.key, entry);
    });

    this.neutralise();
  }

  get isUsable() {
    return this.byKey.has('hips') && this.byKey.has('upperLegL') && this.byKey.has('upperArmR');
  }

  /** Rotate each mapped bone so the export pose becomes a square standing stance. */
  private neutralise() {
    for (const entry of this.entries) {
      const inherited = entry.parent ? _q.copy(entry.parent.baseFig) : _q.copy(entry.parentFig);
      inherited.multiply(entry.restLocal);
      entry.baseFig.copy(inherited);

      if (entry.key === 'footL' || entry.key === 'footR') {
        this.plantFoot(entry);
        continue;
      }

      const target = entry.key ? NEUTRAL[entry.key] : undefined;
      if (!target) continue;

      // Primary: swing the bone axis (or a feature axis) onto its target direction.
      let primaryDir = target.dir;
      let gotAxis = false;
      if (target.axis) {
        const from = this.byKey.get(target.axis.from);
        const tos = target.axis.to.map((k) => this.byKey.get(k)).filter(Boolean) as BoneEntry[];
        if (from && tos.length) {
          _v2.set(0, 0, 0);
          tos.forEach((t) => _v2.add(t.restPos));
          _v2.multiplyScalar(1 / tos.length).sub(from.restPos);
          if (this.carryRestVector(entry, _v2, _v)) {
            primaryDir = target.axis.dir;
            gotAxis = true;
          }
        }
      }
      if (!gotAxis) _v.copy(Y_AXIS).applyQuaternion(inherited);
      const m1 = new THREE.Quaternion().setFromUnitVectors(_v, primaryDir);
      entry.baseFig.premultiply(m1);

      // Secondary: roll about the primary axis so a reference feature faces the
      // right way. Only trusted when the primary swing was large (a raised limb,
      // a kicking leg); a limb that already hangs where we want it keeps the
      // roll it was exported with, which protects auto-rigs whose weights bleed
      // between neighbouring parts.
      if (!target.refs) continue;
      const swing = 2 * Math.acos(Math.min(1, Math.abs(m1.w)));
      const rollWeight = smooth((swing - 0.25) / 0.5);
      if (rollWeight <= 0) continue;
      for (const ref of target.refs) {
        const a = this.byKey.get(ref.from);
        const b = this.byKey.get(ref.to);
        if (!a || !b) continue;
        _v2.subVectors(b.restPos, a.restPos);
        if (!this.carryRestVector(entry, _v2, _v2)) continue;
        _v2.addScaledVector(primaryDir, -_v2.dot(primaryDir));
        // carryRestVector normalised the vector, so this is sin(angle to the axis).
        if (_v2.length() < 0.3) continue;
        _v.copy(ref.target).addScaledVector(primaryDir, -ref.target.dot(primaryDir));
        if (_v.lengthSq() < 1e-6) continue;
        _v2.normalize();
        _v.normalize();
        const m2 = new THREE.Quaternion().setFromUnitVectors(_v2, _v);
        if (rollWeight < 1) m2.slerp(IDENTITY, 1 - rollWeight);
        entry.baseFig.premultiply(m2);
        break;
      }
    }
  }

  /**
   * A foot under a near-vertical shin was planted on the ground when the model
   * was exported, so when that shin still had to swing noticeably to stand
   * straight, the foot keeps its exported world orientation instead of
   * following the shin (otherwise a back-leaning shin leaves the toes pointing
   * at the sky). Feet under raised or barely-corrected shins keep the exported
   * ankle angle.
   */
  private plantFoot(entry: BoneEntry) {
    const shin = entry.parent;
    if (!shin) return;
    const tilt = Math.acos(Math.min(1, -_v.copy(Y_AXIS).applyQuaternion(shin.restFig).y));
    const swing = 2 * Math.acos(Math.min(1, Math.abs(_q2.copy(shin.restFig).invert().premultiply(shin.baseFig).w)));
    const weight = smooth((0.6 - tilt) / 0.2) * smooth((swing - 0.15) / 0.25);
    if (weight > 0) entry.baseFig.slerp(entry.restFig, weight);
  }

  /**
   * Take a figure-space vector measured in the export pose, express it in the
   * bone's rest frame and carry it through the bone's corrected orientation.
   * Returns false (and leaves `out` untouched) for degenerate input.
   */
  private carryRestVector(entry: BoneEntry, restVector: THREE.Vector3, out: THREE.Vector3) {
    if (restVector.lengthSq() < 1e-8) return false;
    out
      .copy(restVector)
      .applyQuaternion(_q2.copy(entry.restFig).invert())
      .applyQuaternion(entry.baseFig)
      .normalize();
    return true;
  }

  resetAngles() {
    for (const key of ANIMATED) {
      const a = this.angles[key];
      a.x = 0;
      a.y = 0;
      a.z = 0;
    }
  }

  /** Push the current angles into the bones. */
  apply() {
    for (const entry of this.entries) {
      const parentAcc = entry.parent ? entry.parent.acc : null;
      if (parentAcc) entry.acc.copy(parentAcc);
      else entry.acc.identity();

      if (entry.key && ANIMATED.includes(entry.key)) {
        const a = this.angles[entry.key];
        if (a.x !== 0 || a.y !== 0 || a.z !== 0) {
          _e.set(a.x, a.y, a.z, 'YXZ');
          _q.setFromEuler(_e);
          entry.acc.multiply(_q);
        }
      }

      entry.fig.copy(entry.acc).multiply(entry.baseFig);
      const parentFig = entry.parent ? entry.parent.fig : entry.parentFig;
      entry.bone.quaternion.copy(_q.copy(parentFig).invert().multiply(entry.fig));
    }
  }

  /** Orient a child of the given bone so its axes match figure space in the base pose. */
  alignSocket(key: BoneKey, socket: THREE.Object3D) {
    const entry = this.byKey.get(key);
    if (!entry) return;
    socket.quaternion.copy(entry.baseFig).invert();
  }

  bone(key: BoneKey) {
    return this.byKey.get(key)?.bone ?? null;
  }
}

function smooth(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Piecewise keyframe track: [time, value] pairs, smoothstep between them. */
function track(p: number, keys: Array<[number, number]>) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i];
    if (p <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smooth((p - t0) / Math.max(1e-5, t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

/** Authored melee animations the procedural skeleton can perform. */
export type MeleeStyle = 'chop' | 'slash' | 'punch' | 'kick' | 'slap' | 'blast';

export interface SkeletalMotion {
  phase: number;
  moving: number;
  sprinting: boolean;
  /** 1 → 0 across a melee swing; 0 when idle. */
  meleeT: number;
  /** Which melee animation `meleeT` drives; defaults to the overhead chop. */
  meleeStyle?: MeleeStyle;
}

/**
 * Compute a full-body pose from locomotion + combat inputs and apply it.
 * Sign conventions (figure space): +X rotation tips an "up" bone forward and a
 * hanging limb backward; +Y turns the chest toward the character's left;
 * +Z on a hanging limb moves it toward the character's left.
 */
export function poseSkeleton(skel: ProceduralSkeleton, motion: SkeletalMotion) {
  const { phase, moving, sprinting, meleeT } = motion;
  const A = skel.angles;
  skel.resetAngles();

  // --- Idle life -------------------------------------------------------------
  const breath = phase * 0.25;
  const still = 1 - moving;
  A.chest.x += Math.sin(breath) * 0.03 * still;
  A.upperChest.x += Math.sin(breath + 0.4) * 0.02 * still;
  A.head.y += Math.sin(breath * 0.55) * 0.07 * still;
  A.head.x += Math.sin(breath * 0.8 + 1) * 0.03 * still;
  A.upperArmL.z += Math.sin(breath) * 0.02 * still;
  A.upperArmR.z -= Math.sin(breath) * 0.02 * still;
  // Relaxed combat-ready arms: elbows softly bent, forearms forward.
  A.lowerArmL.x -= 0.2 * still;
  A.lowerArmR.x -= 0.2 * still;
  A.hips.z += Math.sin(breath * 0.5) * 0.015 * still;

  // --- Locomotion ------------------------------------------------------------
  if (moving > 0.01) {
    const sL = Math.sin(phase);
    const cL = Math.cos(phase);
    const legAmp = sprinting ? 0.85 : 0.6;
    const kneeAmp = sprinting ? 1.35 : 0.75;
    const armAmp = sprinting ? 0.75 : 0.42;
    const elbow = sprinting ? 1.0 : 0.45;

    A.upperLegL.x -= legAmp * sL * moving;
    A.upperLegR.x += legAmp * sL * moving;
    A.lowerLegL.x += (0.08 + kneeAmp * Math.max(0, cL)) * moving;
    A.lowerLegR.x += (0.08 + kneeAmp * Math.max(0, -cL)) * moving;
    A.footL.x -= 0.35 * Math.max(0, cL) * moving;
    A.footR.x -= 0.35 * Math.max(0, -cL) * moving;

    A.upperArmL.x += armAmp * sL * moving;
    A.upperArmR.x -= armAmp * sL * moving;
    A.lowerArmL.x -= (elbow + 0.25 * Math.max(0, -sL)) * moving;
    A.lowerArmR.x -= (elbow + 0.25 * Math.max(0, sL)) * moving;
    A.upperArmL.z += 0.08 * moving;
    A.upperArmR.z -= 0.08 * moving;

    const lean = sprinting ? 0.2 : 0.07;
    A.spine.x += lean * moving;
    A.spine.y += sL * 0.12 * moving;
    A.hips.y -= sL * 0.09 * moving;
    A.hips.z += cL * 0.04 * moving;
    A.head.x -= lean * 0.7 * moving;
    A.head.y -= sL * 0.08 * moving;
  }

  if (meleeT > 0) {
    const p = 1 - meleeT;
    switch (motion.meleeStyle ?? 'chop') {
      case 'slash':
        poseSlash(A, p);
        break;
      case 'punch':
        posePunch(A, p);
        break;
      case 'kick':
        poseKick(A, p);
        break;
      case 'slap':
        poseSlap(A, p);
        break;
      case 'blast':
        poseBlast(A, p);
        break;
      default:
        poseChop(A, p);
    }
  }

  skel.apply();
}

type Angles = Record<BoneKey, PoseAngles>;

/** Overhead chop: right arm, torso drives it. */
function poseChop(A: Angles, p: number) {
  // Windup overhead (0.26) → impact with the arm driven forward (0.55) →
  // follow-through down and across the body (0.75) → recover.
  A.upperArmR.x += track(p, [
    [0, 0],
    [0.26, -2.6],
    [0.55, -1.35],
    [0.75, -0.7],
    [1, 0],
  ]);
  A.upperArmR.z += track(p, [
    [0, 0],
    [0.26, -0.4],
    [0.55, 0.25],
    [0.75, 0.6],
    [1, 0],
  ]);
  A.lowerArmR.x += track(p, [
    [0, 0],
    [0.26, -1.6],
    [0.55, -0.1],
    [0.75, -0.3],
    [1, -0.2],
  ]);
  A.handR.x += track(p, [
    [0, 0],
    [0.26, -0.5],
    [0.55, 0.3],
    [0.75, 0.5],
    [1, 0],
  ]);
  A.spine.y += track(p, [
    [0, 0],
    [0.26, -0.42],
    [0.6, 0.48],
    [1, 0],
  ]);
  A.spine.x += track(p, [
    [0, 0],
    [0.26, -0.12],
    [0.6, 0.3],
    [1, 0],
  ]);
  A.hips.y += track(p, [
    [0, 0],
    [0.26, -0.18],
    [0.6, 0.22],
    [1, 0],
  ]);
  // Off arm counterbalances as a guard.
  A.upperArmL.x += track(p, [
    [0, 0],
    [0.26, 0.3],
    [0.6, -0.5],
    [1, 0],
  ]);
  A.lowerArmL.x += track(p, [
    [0, 0],
    [0.6, -0.6],
    [1, 0],
  ]);
  A.head.y -= A.spine.y * 0.7;
}

/** Horizontal sword slash: blade pulled back to the right, swept across the body. */
function poseSlash(A: Angles, p: number) {
  // Windup out to the side (0.3) → cut through centre (0.55) → follow-through
  // across to the left (0.75) → recover.
  A.upperArmR.x += track(p, [
    [0, 0],
    [0.3, -0.55],
    [0.55, -1.5],
    [0.75, -1.15],
    [1, 0],
  ]);
  A.upperArmR.z += track(p, [
    [0, 0],
    [0.3, -1.25],
    [0.55, 0.2],
    [0.75, 0.75],
    [1, 0],
  ]);
  A.lowerArmR.x += track(p, [
    [0, 0],
    [0.3, -0.7],
    [0.55, -0.1],
    [0.75, -0.45],
    [1, -0.2],
  ]);
  // Blade stays level through the cut.
  A.handR.x += track(p, [
    [0, 0],
    [0.3, -0.35],
    [0.55, -0.3],
    [0.75, -0.1],
    [1, 0],
  ]);
  A.handR.z += track(p, [
    [0, 0],
    [0.3, 0.5],
    [0.75, -0.3],
    [1, 0],
  ]);
  A.spine.y += track(p, [
    [0, 0],
    [0.3, -0.55],
    [0.65, 0.65],
    [1, 0],
  ]);
  A.spine.x += track(p, [
    [0, 0],
    [0.3, -0.05],
    [0.6, 0.18],
    [1, 0],
  ]);
  A.hips.y += track(p, [
    [0, 0],
    [0.3, -0.25],
    [0.65, 0.3],
    [1, 0],
  ]);
  // Off arm tucks in as a guard, then opens for balance on the follow-through.
  A.upperArmL.x += track(p, [
    [0, 0],
    [0.3, -0.45],
    [0.75, 0.35],
    [1, 0],
  ]);
  A.lowerArmL.x += track(p, [
    [0, 0],
    [0.3, -1.3],
    [0.75, -0.4],
    [1, 0],
  ]);
  // Light stance drop through the cut.
  const crouch = track(p, [
    [0, 0],
    [0.55, 1],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.18 * crouch;
  A.upperLegR.x -= 0.18 * crouch;
  A.lowerLegL.x += 0.3 * crouch;
  A.lowerLegR.x += 0.3 * crouch;
  A.head.y -= A.spine.y * 0.6;
}

/** Straight left punch (the free hand) with the hips behind it; the weapon hand chambers back. */
function posePunch(A: Angles, p: number) {
  // Chamber the fist at the chin (0.25) → extend through the target (0.5) →
  // snap back to guard.
  A.upperArmL.x += track(p, [
    [0, 0],
    [0.25, -0.85],
    [0.5, -1.55],
    [0.8, -0.9],
    [1, 0],
  ]);
  A.upperArmL.z += track(p, [
    [0, 0],
    [0.25, 0.25],
    [0.5, -0.35],
    [0.8, -0.1],
    [1, 0],
  ]);
  A.lowerArmL.x += track(p, [
    [0, 0],
    [0.25, -2.2],
    [0.5, -0.05],
    [0.8, -1.6],
    [1, -0.2],
  ]);
  A.handL.z += track(p, [
    [0, 0],
    [0.25, -0.3],
    [0.5, 0.6],
    [1, 0],
  ]);
  A.spine.y += track(p, [
    [0, 0],
    [0.25, 0.35],
    [0.5, -0.6],
    [0.8, -0.2],
    [1, 0],
  ]);
  A.spine.x += track(p, [
    [0, 0],
    [0.25, -0.05],
    [0.5, 0.2],
    [1, 0],
  ]);
  A.hips.y += track(p, [
    [0, 0],
    [0.25, 0.2],
    [0.5, -0.35],
    [0.8, -0.1],
    [1, 0],
  ]);
  // Rear leg drives, front knee softens.
  const drive = track(p, [
    [0, 0],
    [0.5, 1],
    [1, 0],
  ]);
  A.upperLegR.x -= 0.2 * drive;
  A.lowerLegR.x += 0.35 * drive;
  A.upperLegL.x += 0.15 * drive;
  // Weapon hand pulls back low and out of the way, blade trailing.
  A.upperArmR.x += track(p, [
    [0, 0],
    [0.25, -0.2],
    [0.5, 0.55],
    [0.8, 0.2],
    [1, 0],
  ]);
  A.upperArmR.z += track(p, [
    [0, 0],
    [0.25, -0.2],
    [0.8, -0.35],
    [1, 0],
  ]);
  A.lowerArmR.x += track(p, [
    [0, 0],
    [0.25, -1.4],
    [0.5, -0.9],
    [0.8, -1.1],
    [1, -0.2],
  ]);
  A.head.y -= A.spine.y * 0.8;
}

/** Right front kick: chamber the knee, snap the shin out, retract. */
function poseKick(A: Angles, p: number) {
  // Chamber (0.3) → extension (0.55) → re-chamber (0.78) → plant.
  A.upperLegR.x += track(p, [
    [0, 0],
    [0.3, -1.45],
    [0.55, -1.6],
    [0.78, -1.0],
    [1, 0],
  ]);
  A.lowerLegR.x += track(p, [
    [0, 0],
    [0.3, 1.9],
    [0.55, 0.1],
    [0.78, 1.4],
    [1, 0],
  ]);
  A.footR.x += track(p, [
    [0, 0],
    [0.3, 0.35],
    [0.55, -0.45],
    [0.78, 0.2],
    [1, 0],
  ]);
  A.upperLegR.z += track(p, [
    [0, 0],
    [0.3, -0.12],
    [0.78, -0.12],
    [1, 0],
  ]);
  // Lean back over the support leg; hips open toward the kick.
  const lean = track(p, [
    [0, 0],
    [0.3, 0.7],
    [0.55, 1],
    [0.78, 0.6],
    [1, 0],
  ]);
  A.spine.x -= 0.3 * lean;
  A.hips.x -= 0.15 * lean;
  A.hips.y += 0.22 * lean;
  A.spine.y -= 0.12 * lean;
  A.head.x += 0.25 * lean;
  // Support knee softens so she does not stand bolt upright on one leg.
  A.upperLegL.x -= 0.12 * lean;
  A.lowerLegL.x += 0.25 * lean;
  // Arms counterbalance: guard hand forward, sword hand back and low.
  A.upperArmL.x -= 0.35 * lean;
  A.lowerArmL.x -= 0.85 * lean;
  A.upperArmL.z += 0.2 * lean;
  A.upperArmR.x += 0.45 * lean;
  A.upperArmR.z -= 0.35 * lean;
  A.lowerArmR.x -= 0.6 * lean;
}

/** Open-hand slap: right arm cocked out wide at head height, whipped across the face. */
function poseSlap(A: Angles, p: number) {
  // Cock out to the right (0.28) → contact in front of the face (0.52) →
  // follow-through across to the left (0.72) → recover.
  A.upperArmR.x += track(p, [
    [0, 0],
    [0.28, -0.75],
    [0.52, -1.55],
    [0.72, -1.3],
    [1, 0],
  ]);
  A.upperArmR.z += track(p, [
    [0, 0],
    [0.28, -1.45],
    [0.52, 0.15],
    [0.72, 0.9],
    [1, 0],
  ]);
  A.lowerArmR.x += track(p, [
    [0, 0],
    [0.28, -0.95],
    [0.52, -0.25],
    [0.72, -0.75],
    [1, -0.2],
  ]);
  // Palm open and facing the target through the swing.
  A.handR.x += track(p, [
    [0, 0],
    [0.28, 0.35],
    [0.52, 0.45],
    [0.72, 0.1],
    [1, 0],
  ]);
  A.handR.z += track(p, [
    [0, 0],
    [0.28, -0.4],
    [0.52, 0.3],
    [0.72, 0.5],
    [1, 0],
  ]);
  // Torso winds to the right and whips left behind the hand.
  A.spine.y += track(p, [
    [0, 0],
    [0.28, -0.5],
    [0.52, 0.4],
    [0.72, 0.7],
    [1, 0],
  ]);
  A.spine.x += track(p, [
    [0, 0],
    [0.28, -0.08],
    [0.52, 0.15],
    [1, 0],
  ]);
  A.hips.y += track(p, [
    [0, 0],
    [0.28, -0.2],
    [0.52, 0.2],
    [0.72, 0.3],
    [1, 0],
  ]);
  // Off hand stays up as a guard, then drops as the weight comes through.
  A.upperArmL.x += track(p, [
    [0, 0],
    [0.28, -0.4],
    [0.52, -0.3],
    [0.72, 0.2],
    [1, 0],
  ]);
  A.lowerArmL.x += track(p, [
    [0, 0],
    [0.28, -1.4],
    [0.52, -1.1],
    [0.72, -0.4],
    [1, -0.2],
  ]);
  const step = track(p, [
    [0, 0],
    [0.52, 1],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.22 * step;
  A.lowerLegL.x += 0.35 * step;
  A.upperLegR.x += 0.12 * step;
  A.head.y -= A.spine.y * 0.5;
}

/** Two-palm energy blast: gather at the hips, lunge and thrust both hands forward. */
function poseBlast(A: Angles, p: number) {
  // Gather low and back (0.3) → release (0.55) → hold the push (0.72) → recover.
  const armX = track(p, [
    [0, 0],
    [0.3, 0.5],
    [0.55, -1.55],
    [0.72, -1.45],
    [1, 0],
  ]);
  const armSpread = track(p, [
    [0, 0],
    [0.3, 0.2],
    [0.55, -0.28],
    [0.72, -0.25],
    [1, 0],
  ]);
  const elbow = track(p, [
    [0, 0],
    [0.3, -1.7],
    [0.55, -0.1],
    [0.72, -0.15],
    [1, -0.2],
  ]);
  // Palms flex back so they face the target when the arms are out.
  const palm = track(p, [
    [0, 0],
    [0.3, -0.3],
    [0.55, 0.85],
    [0.72, 0.8],
    [1, 0],
  ]);
  A.upperArmL.x += armX;
  A.upperArmR.x += armX;
  A.upperArmL.z += armSpread;
  A.upperArmR.z -= armSpread;
  A.lowerArmL.x += elbow;
  A.lowerArmR.x += elbow;
  A.handL.x += palm;
  A.handR.x += palm;

  // Coil back, then drive the whole body into the push.
  A.spine.x += track(p, [
    [0, 0],
    [0.3, -0.22],
    [0.55, 0.28],
    [0.72, 0.18],
    [1, 0],
  ]);
  A.hips.x += track(p, [
    [0, 0],
    [0.3, -0.1],
    [0.55, 0.12],
    [1, 0],
  ]);
  A.head.x -= A.spine.x * 0.7;

  // Deep gathering crouch that opens into a front lunge on the release.
  const crouch = track(p, [
    [0, 0],
    [0.3, 1],
    [0.55, 0.3],
    [1, 0],
  ]);
  const lunge = track(p, [
    [0, 0],
    [0.3, 0],
    [0.55, 1],
    [0.72, 0.9],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.35 * crouch + 0.2 * lunge;
  A.lowerLegL.x += 0.6 * crouch + 0.3 * lunge;
  A.upperLegR.x -= 0.35 * crouch - 0.25 * lunge;
  A.lowerLegR.x += 0.6 * crouch + 0.05 * lunge;
  A.footR.x -= 0.2 * lunge;
}
