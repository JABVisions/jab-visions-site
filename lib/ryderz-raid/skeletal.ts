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
  axis?: { from: BoneKey | BoneKey[]; to: BoneKey[]; dir: THREE.Vector3 };
  /** Leave the bone as exported when the feature axis cannot be measured. */
  axisOnly?: boolean;
  /**
   * Roll references, tried in order: a rest-pose vector between two bones and
   * where its component perpendicular to the bone should point. A reference is
   * skipped when that perpendicular component is too small to be trustworthy.
   */
  refs?: Array<{ from: BoneKey; to: BoneKey; target: THREE.Vector3 }>;
  /**
   * Apply the roll reference at full strength regardless of how far the
   * primary swing went. Only for bones whose reference is unambiguous (the
   * pelvis: the line between the hip joints always says which way is left).
   */
  trustRoll?: boolean;
}

function dir(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).normalize();
}

const BACK = new THREE.Vector3(0, 0, -1);
const FOOT_DIR = dir(0, -0.4, 0.92);
const SHOULDER_LINE = { from: 'shoulderR' as BoneKey, to: 'shoulderL' as BoneKey, target: LEFT };

const NEUTRAL: Partial<Record<BoneKey, NeutralTarget>> = {
  // The pelvis is levelled from the thigh line (knees → hip joints), not from
  // the hips → spine joint offset: on a figure exported bent at the waist that
  // offset leans forward, and swinging it upright pitched the pelvis back,
  // dragging hips-weighted skin (shorts, seat) away from the thighs. Following
  // the thighs keeps the exported hip-joint pose intact, and the spine chain
  // below straightens the torso where the bend actually is.
  hips: {
    dir: dir(0, 1, 0),
    axis: { from: ['lowerLegL', 'lowerLegR'], to: ['upperLegL', 'upperLegR'], dir: dir(0, 1, 0) },
    refs: [{ from: 'upperLegR', to: 'upperLegL', target: LEFT }],
    trustRoll: true,
  },
  // The shoulder line always says which way the torso faces, so its roll is
  // trusted outright: a pelvis squared up from a yawed hip line (a lunging
  // export) would otherwise hand that yaw down to a torso too straight to
  // earn its own roll correction, leaving the chest twisted.
  spine: { dir: dir(0, 1, 0.02), refs: [SHOULDER_LINE], trustRoll: true },
  chest: { dir: dir(0, 1, 0), refs: [SHOULDER_LINE], trustRoll: true },
  upperChest: { dir: dir(0, 1, -0.02), refs: [SHOULDER_LINE], trustRoll: true },
  neck: { dir: dir(0, 1, 0.08) },
  // Auto-rig head bones aim at the face, not the crown: level the head by
  // putting the eyes up-and-forward of the skull base instead. Swinging the
  // face forward tilts the eye line, and a level eye line is never ambiguous.
  head: {
    dir: dir(0, 1, 0),
    axis: { from: 'head', to: ['eyeL', 'eyeR'], dir: dir(0, 0.78, 0.63) },
    refs: [{ from: 'eyeR', to: 'eyeL', target: LEFT }],
    trustRoll: true,
  },
  // Clavicles: square them onto the shoulder line so a raised-arm bind
  // does not leave a collarbone aiming at the sky while the arm chain
  // tries to hang. Figures that must keep their export arm pose skip
  // this via `keep` instead — unfolding those joints corkscrews the skin.
  shoulderL: { dir: dir(1, -0.15, 0.05), refs: [SHOULDER_LINE], trustRoll: true },
  shoulderR: { dir: dir(-1, -0.15, 0.05), refs: [SHOULDER_LINE], trustRoll: true },
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
  // Feet are levelled from where the toes actually are (ankle → toes points
  // forward and a little down). Without toe bones the ankle angle is left as
  // exported: auto-rigs place foot bones too inconsistently to correct blindly.
  footL: { dir: FOOT_DIR, axis: { from: 'footL', to: ['toesL'], dir: FOOT_DIR }, axisOnly: true },
  footR: { dir: FOOT_DIR, axis: { from: 'footR', to: ['toesR'], dir: FOOT_DIR }, axisOnly: true },
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
const NON_STRIKE_CLIP = /idle|breath|stand|rest|walk|run|jog|sprint|angry|taunt|emote|gesture|cheer|dance|wave|death|die|hit_?react|cast|spell|dive|agree/i;
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
  /** Bones left in the export pose. Neutralisation is skipped so a large bind-pose swing cannot corkscrew geodesic weights; animation still layers on top. */
  private keep: Set<BoneKey>;

  constructor(figure: THREE.Object3D, options?: { keep?: BoneKey[] }) {
    this.figure = figure;
    this.angles = Object.fromEntries(
      (Object.keys(BONE_PATTERNS) as BoneKey[]).map((k) => [k, { x: 0, y: 0, z: 0 }]),
    ) as Record<BoneKey, PoseAngles>;
    this.keep = new Set(options?.keep ?? []);

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

      const target = entry.key && !this.keep.has(entry.key) ? NEUTRAL[entry.key] : undefined;
      if (!target) continue;

      // Primary: swing the bone axis (or a feature axis) onto its target direction.
      let primaryDir = target.dir;
      let gotAxis = false;
      if (target.axis) {
        const fromKeys = Array.isArray(target.axis.from) ? target.axis.from : [target.axis.from];
        const froms = fromKeys.map((k) => this.byKey.get(k)).filter(Boolean) as BoneEntry[];
        const tos = target.axis.to.map((k) => this.byKey.get(k)).filter(Boolean) as BoneEntry[];
        if (froms.length === fromKeys.length && tos.length) {
          _v2.set(0, 0, 0);
          tos.forEach((t) => _v2.add(t.restPos));
          _v2.multiplyScalar(1 / tos.length);
          _v.set(0, 0, 0);
          froms.forEach((f) => _v.add(f.restPos));
          _v2.addScaledVector(_v, -1 / froms.length);
          if (this.carryRestVector(entry, _v2, _v)) {
            primaryDir = target.axis.dir;
            gotAxis = true;
          }
        }
      }
      if (!gotAxis && target.axisOnly) continue;
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
      const rollWeight = target.trustRoll ? 1 : smooth((swing - 0.25) / 0.5);
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

  /**
   * Direction the bone runs in figure space once neutralised (the axis a
   * socket on that bone should hang equipment along). Falls back to straight
   * down for unmapped bones.
   */
  boneAxis(key: BoneKey, out: THREE.Vector3) {
    const entry = this.byKey.get(key);
    if (!entry) return out.set(0, -1, 0);
    return out.copy(Y_AXIS).applyQuaternion(entry.baseFig).normalize();
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
export type MeleeStyle =
  | 'chop'
  | 'slash'
  | 'punch'
  | 'punchR'
  | 'kick'
  | 'spinKick'
  | 'slap'
  | 'blast'
  | 'smash'
  | 'forkThrust'
  | 'forkSweep'
  | 'forkSlam';

/**
 * Full-body stances abilities hold the figure in (not timed like a melee
 * swing). `t` runs 0 → 1 across the stance so it can carry a little motion.
 */
export type AbilityPose =
  | 'crouch'
  | 'launch'
  | 'dive'
  | 'slam'
  | 'rush'
  | 'streak'
  | 'finish'
  | 'sink'
  | 'grab'
  | 'heave'
  | 'flip'
  | 'throw'
  | 'catch'
  | 'spin'
  | 'guard'
  | 'hover'
  | 'cast'
  | 'flight'
  | 'land'
  | 'channel'
  | 'summon'
  | 'grow'
  | 'stomp'
  | 'ride';

export interface PoseOverride {
  kind: AbilityPose;
  /** 0 → 1 progress through the stance. */
  t: number;
  /** Blend weight against locomotion, 0 → 1. */
  weight: number;
  /** Extra chest yaw, radians. Positive turns toward the character's left. */
  lean?: number;
  /** Extra roll, radians. */
  bank?: number;
}

/** How far each stance drops the root toward the ground, in figure metres. */
export const POSE_ROOT_DROP: Record<AbilityPose, number> = {
  crouch: 0.34,
  launch: 0,
  dive: 0,
  slam: 0.5,
  rush: 0.12,
  streak: 0.08,
  finish: 0.06,
  sink: 0,
  grab: 0.3,
  heave: 0.05,
  flip: 0,
  throw: 0.1,
  catch: 0.08,
  spin: 0.2,
  guard: 0.22,
  hover: 0,
  cast: 0.04,
  flight: 0,
  land: 0.22,
  channel: 0.06,
  summon: 0.02,
  grow: 0.12,
  stomp: 0.16,
  ride: 0,
};

export interface SkeletalMotion {
  phase: number;
  moving: number;
  sprinting: boolean;
  /** 1 → 0 across a melee swing; 0 when idle. */
  meleeT: number;
  /** Which melee animation `meleeT` drives; defaults to the overhead chop. */
  meleeStyle?: MeleeStyle;
  /** Ability stance layered over (and weighted against) locomotion. */
  pose?: PoseOverride | null;
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

  const pose = motion.pose;
  if (pose && pose.weight > 0) {
    // Stances fade the locomotion out underneath them so a dive does not
    // keep jogging its legs; compute into scratch and add weighted.
    const w = Math.min(1, pose.weight);
    if (w >= 1) skel.resetAngles();
    else scaleAngles(A, 1 - w);
    resetScratch();
    switch (pose.kind) {
      case 'crouch':
        poseCrouch(SCRATCH, pose.t);
        break;
      case 'launch':
        poseLaunch(SCRATCH, pose.t);
        break;
      case 'dive':
        poseDive(SCRATCH, pose.t);
        break;
      case 'slam':
        poseSlam(SCRATCH, pose.t);
        break;
      case 'rush':
        poseRush(SCRATCH, pose.t, phase);
        break;
      case 'streak':
        poseStreak(SCRATCH, pose.t);
        break;
      case 'finish':
        poseFinish(SCRATCH, pose.t);
        break;
      case 'sink':
        poseSink(SCRATCH, pose.t);
        break;
      case 'grab':
        poseGrab(SCRATCH, pose.t);
        break;
      case 'heave':
        poseHeave(SCRATCH, pose.t);
        break;
      case 'flip':
        poseFlip(SCRATCH, pose.t);
        break;
      case 'throw':
        poseThrow(SCRATCH, pose.t);
        break;
      case 'catch':
        poseCatch(SCRATCH, pose.t);
        break;
      case 'spin':
        poseSpin(SCRATCH, pose.t);
        break;
      case 'guard':
        poseGuard(SCRATCH, pose.t);
        break;
      case 'hover':
        poseHover(SCRATCH, pose.t);
        break;
      case 'cast':
        poseCast(SCRATCH, pose.t);
        break;
      case 'flight':
        poseFlight(SCRATCH, pose.t);
        break;
      case 'land':
        poseLand(SCRATCH, pose.t);
        break;
      case 'channel':
        poseChannel(SCRATCH, pose.t);
        break;
      case 'summon':
        poseSummon(SCRATCH, pose.t);
        break;
      case 'grow':
        poseGrow(SCRATCH, pose.t);
        break;
      case 'stomp':
        poseStomp(SCRATCH, pose.t);
        break;
      case 'ride':
        poseRide(SCRATCH, pose.t);
        break;
    }
    if (pose.lean) {
      SCRATCH.spine.y += pose.lean;
      SCRATCH.chest.y += pose.lean * 0.35;
    }
    if (pose.bank) {
      SCRATCH.spine.z += pose.bank;
      SCRATCH.hips.z += pose.bank * 0.6;
    }
    addAngles(A, SCRATCH, w);
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
      case 'punchR':
        resetScratch();
        posePunch(SCRATCH, p);
        mirrorAngles(SCRATCH);
        addAngles(A, SCRATCH, 1);
        break;
      case 'kick':
        poseKick(A, p);
        break;
      case 'spinKick':
        poseSpinKick(A, p);
        break;
      case 'slap':
        poseSlap(A, p);
        break;
      case 'blast':
        poseBlast(A, p);
        break;
      case 'smash':
        poseSmash(A, p);
        break;
      case 'forkThrust':
        poseForkThrust(A, p);
        break;
      case 'forkSweep':
        poseForkSweep(A, p);
        break;
      case 'forkSlam':
        poseForkSlam(A, p);
        break;
      default:
        poseChop(A, p);
    }
  }

  skel.apply();
}

type Angles = Record<BoneKey, PoseAngles>;

const ALL_KEYS = Object.keys(BONE_PATTERNS) as BoneKey[];
const SCRATCH: Angles = Object.fromEntries(ALL_KEYS.map((k) => [k, { x: 0, y: 0, z: 0 }])) as Angles;

function resetScratch() {
  for (const key of ALL_KEYS) {
    const a = SCRATCH[key];
    a.x = 0;
    a.y = 0;
    a.z = 0;
  }
}

function scaleAngles(A: Angles, s: number) {
  for (const key of ALL_KEYS) {
    const a = A[key];
    a.x *= s;
    a.y *= s;
    a.z *= s;
  }
}

function addAngles(A: Angles, B: Angles, w: number) {
  for (const key of ALL_KEYS) {
    const a = A[key];
    const b = B[key];
    a.x += b.x * w;
    a.y += b.y * w;
    a.z += b.z * w;
  }
}

const MIRROR_PAIRS: Array<[BoneKey, BoneKey]> = [
  ['shoulderL', 'shoulderR'],
  ['upperArmL', 'upperArmR'],
  ['lowerArmL', 'lowerArmR'],
  ['handL', 'handR'],
  ['upperLegL', 'upperLegR'],
  ['lowerLegL', 'lowerLegR'],
  ['footL', 'footR'],
  ['toesL', 'toesR'],
  ['eyeL', 'eyeR'],
];

/** Swap left/right limbs and flip the yaw/roll components so a pose plays on the other side. */
function mirrorAngles(A: Angles) {
  for (const [l, r] of MIRROR_PAIRS) {
    const a = A[l];
    const b = A[r];
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    a.x = b.x;
    a.y = -b.y;
    a.z = -b.z;
    b.x = ax;
    b.y = -ay;
    b.z = -az;
  }
  for (const key of ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'] as BoneKey[]) {
    A[key].y = -A[key].y;
    A[key].z = -A[key].z;
  }
}

// ---------------------------------------------------------------------------
// Ability stances
// ---------------------------------------------------------------------------

/** Compression before a launch: deep squat, fists pulled low and back, eyes forward. */
function poseCrouch(A: Angles, t: number) {
  const d = 0.75 + 0.25 * smooth(t);
  A.upperLegL.x -= 1.0 * d;
  A.upperLegR.x -= 1.0 * d;
  A.lowerLegL.x += 1.7 * d;
  A.lowerLegR.x += 1.7 * d;
  A.footL.x -= 0.4 * d;
  A.footR.x -= 0.4 * d;
  A.spine.x += 0.55 * d;
  A.hips.x += 0.15 * d;
  A.head.x -= 0.55 * d;
  A.upperArmL.x += 0.75 * d;
  A.upperArmR.x += 0.75 * d;
  A.upperArmL.z += 0.2 * d;
  A.upperArmR.z -= 0.2 * d;
  A.lowerArmL.x -= 0.9 * d;
  A.lowerArmR.x -= 0.9 * d;
}

/** Rising through the air: arms thrown down and back, one knee tucked, chest open to the sky. */
function poseLaunch(A: Angles, t: number) {
  const tuck = track(t, [
    [0, 0.2],
    [0.4, 1],
    [1, 0.6],
  ]);
  A.spine.x -= 0.22;
  A.head.x -= 0.3;
  A.upperArmL.x += 1.1;
  A.upperArmR.x += 1.1;
  A.upperArmL.z += 0.45;
  A.upperArmR.z -= 0.45;
  A.lowerArmL.x -= 0.35;
  A.lowerArmR.x -= 0.35;
  A.upperLegR.x -= 1.15 * tuck;
  A.lowerLegR.x += 1.8 * tuck;
  A.footR.x += 0.3 * tuck;
  A.upperLegL.x += 0.25;
  A.footL.x += 0.45;
}

/** Fist-first dive: the whole body pitches over the hips, lead arm driven straight down. */
function poseDive(A: Angles, t: number) {
  const pitch = track(t, [
    [0, 0.6],
    [0.5, 1.45],
    [1, 1.55],
  ]);
  A.hips.x += pitch;
  A.spine.x += 0.2;
  A.head.x += 0.25;
  A.upperArmR.x -= 2.85;
  A.lowerArmR.x -= 0.05;
  A.handR.x -= 0.3;
  A.upperArmL.x += 0.85;
  A.upperArmL.z += 0.35;
  A.lowerArmL.x -= 0.6;
  A.upperLegL.x += 0.15;
  A.upperLegR.x += 0.3;
  A.upperLegL.z += 0.15;
  A.upperLegR.z -= 0.15;
  A.footL.x += 0.5;
  A.footR.x += 0.5;
}

/** Landing crouch: one knee down, lead fist planted, head coming up through the dust. */
function poseSlam(A: Angles, t: number) {
  const rise = track(t, [
    [0, 0],
    [0.6, 0],
    [1, 0.45],
  ]);
  const d = 1 - rise;
  A.upperLegL.x -= 0.55 * d;
  A.lowerLegL.x += 2.3 * d;
  A.upperLegR.x -= 1.45 * d;
  A.lowerLegR.x += 1.9 * d;
  A.footR.x -= 0.5 * d;
  A.spine.x += 0.95 * d;
  A.hips.x += 0.25 * d;
  A.head.x -= 0.75 * d;
  A.upperArmR.x -= 0.55 * d;
  A.upperArmR.z -= 0.15 * d;
  A.lowerArmR.x -= 0.05;
  A.handR.x += 0.4 * d;
  A.upperArmL.x += 0.9 * d;
  A.upperArmL.z += 0.4 * d;
  A.lowerArmL.x -= 1.0 * d;
}

/** Shoulder-first sprint: deep forward lean, lead fist out, rear fist chambered, legs mid-stride. */
function poseRush(A: Angles, t: number, phase: number) {
  const sL = Math.sin(phase * 1.6);
  A.spine.x += 0.5;
  A.hips.x += 0.18;
  A.head.x -= 0.45;
  A.spine.y += 0.25;
  A.upperArmL.x -= 1.65;
  A.upperArmL.z -= 0.15;
  A.lowerArmL.x -= 0.25;
  A.upperArmR.x += 0.85;
  A.upperArmR.z -= 0.3;
  A.lowerArmR.x -= 1.45;
  A.upperLegL.x -= 0.55 + 0.25 * sL;
  A.upperLegR.x += 0.65 - 0.25 * sL;
  A.lowerLegL.x += 0.35;
  A.lowerLegR.x += 1.25;
  A.footR.x -= 0.4;
}

/** Overdrive pass: a flat backhand swept through the target as she streaks by. */
function poseStreak(A: Angles, t: number) {
  const sweep = track(t, [
    [0, -1.0],
    [0.5, 0.35],
    [1, 0.9],
  ]);
  A.spine.x += 0.4;
  A.hips.x += 0.1;
  A.spine.y += track(t, [
    [0, -0.5],
    [0.5, 0.3],
    [1, 0.55],
  ]);
  A.head.x -= 0.3;
  A.head.y -= A.spine.y * 0.5;
  A.upperArmR.x -= 1.5;
  A.upperArmR.z += sweep;
  A.lowerArmR.x -= 0.15;
  A.handR.z += 0.3;
  A.upperArmL.x += 0.4;
  A.upperArmL.z += 0.5;
  A.lowerArmL.x -= 1.2;
  A.upperLegL.x += 0.45;
  A.upperLegR.x += 0.3;
  A.lowerLegL.x += 1.0;
  A.lowerLegR.x += 0.7;
}

/** Overdrive finish: standing tall, arms thrown open as the marks detonate behind her. */
function poseFinish(A: Angles, t: number) {
  const open = track(t, [
    [0, 0.2],
    [0.3, 1],
    [1, 0.85],
  ]);
  A.spine.x -= 0.18 * open;
  A.head.x -= 0.15 * open;
  A.upperArmL.x -= 0.35 * open;
  A.upperArmR.x -= 0.35 * open;
  A.upperArmL.z += 1.25 * open;
  A.upperArmR.z -= 1.25 * open;
  A.lowerArmL.x -= 0.45 * open;
  A.lowerArmR.x -= 0.45 * open;
  A.handL.z += 0.3 * open;
  A.handR.z -= 0.3 * open;
  A.upperLegL.x -= 0.12;
  A.upperLegR.x -= 0.12;
  A.lowerLegL.x += 0.2;
  A.lowerLegR.x += 0.2;
  A.upperLegL.z += 0.12;
  A.upperLegR.z -= 0.12;
}

// ---------------------------------------------------------------------------
// Phantom stances (Keven)
// ---------------------------------------------------------------------------

/** Phasing into the floor: body straight, arms drifting up as the ground swallows him, chin down. */
function poseSink(A: Angles, t: number) {
  const rise = smooth(t);
  A.upperArmL.x -= 0.6 + 1.6 * rise;
  A.upperArmR.x -= 0.6 + 1.6 * rise;
  A.upperArmL.z += 0.35 * rise;
  A.upperArmR.z -= 0.35 * rise;
  A.lowerArmL.x -= 0.3 * (1 - rise);
  A.lowerArmR.x -= 0.3 * (1 - rise);
  A.handL.x -= 0.4 * rise;
  A.handR.x -= 0.4 * rise;
  A.head.x += 0.45 * rise;
  A.spine.x += 0.12 * rise;
  A.upperLegL.z += 0.04;
  A.upperLegR.z -= 0.04;
  A.footL.x += 0.35 * rise;
  A.footR.x += 0.35 * rise;
}

/** Hands erupt through the pavement, clamp the target, then yank it down. */
function poseGrab(A: Angles, t: number) {
  const reach = track(t, [
    [0, -2.9],
    [0.3, -1.55],
    [0.6, -1.4],
    [1, -0.5],
  ]);
  const clamp = track(t, [
    [0, 0.5],
    [0.3, 0.1],
    [1, 0.1],
  ]);
  const yank = track(t, [
    [0, 0],
    [0.6, 0],
    [1, 1],
  ]);
  A.upperArmL.x += reach;
  A.upperArmR.x += reach;
  A.upperArmL.z += clamp;
  A.upperArmR.z -= clamp;
  A.lowerArmL.x -= 0.35 + 0.5 * yank;
  A.lowerArmR.x -= 0.35 + 0.5 * yank;
  A.handL.x -= 0.4;
  A.handR.x -= 0.4;
  A.spine.x += 0.3 + 0.45 * yank;
  A.hips.x += 0.1 * yank;
  A.head.x -= 0.25 - 0.4 * yank;
  A.upperLegL.x -= 0.7;
  A.upperLegR.x -= 0.7;
  A.lowerLegL.x += 1.3;
  A.lowerLegR.x += 1.3;
}

/** Hurling the target back up: arms thrown overhead, back arched, legs straightening out of the crouch. */
function poseHeave(A: Angles, t: number) {
  const throwUp = track(t, [
    [0, 0],
    [0.45, 1],
    [1, 0.85],
  ]);
  const stand = smooth(t * 1.4);
  A.upperArmL.x -= 0.5 + 2.3 * throwUp;
  A.upperArmR.x -= 0.5 + 2.3 * throwUp;
  A.upperArmL.z += 0.4 * throwUp;
  A.upperArmR.z -= 0.4 * throwUp;
  A.lowerArmL.x -= 0.8 * (1 - throwUp);
  A.lowerArmR.x -= 0.8 * (1 - throwUp);
  A.handL.x -= 0.5 * throwUp;
  A.handR.x -= 0.5 * throwUp;
  A.spine.x += 0.6 * (1 - stand) - 0.35 * throwUp;
  A.head.x -= 0.6 * throwUp;
  A.upperLegL.x -= 0.6 * (1 - stand);
  A.upperLegR.x -= 0.6 * (1 - stand);
  A.lowerLegL.x += 1.1 * (1 - stand);
  A.lowerLegR.x += 1.1 * (1 - stand);
}

/**
 * Standing backflip: the whole figure rotates a full turn backward over the
 * hips, tucking tight through the middle of the arc and opening out to land.
 * Arms sweep overhead on take-off, come down to fire through the top of the
 * flip, and settle for the landing.
 */
function poseFlip(A: Angles, t: number) {
  const turn = track(t, [
    [0, 0],
    [0.12, 0.08],
    [0.88, 0.94],
    [1, 1],
  ]);
  const tuck = track(t, [
    [0, 0],
    [0.3, 1],
    [0.65, 1],
    [0.9, 0],
  ]);
  const arms = track(t, [
    [0, -2.6],
    [0.3, -1.9],
    [0.7, -1.6],
    [1, 0.2],
  ]);
  A.hips.x -= Math.PI * 2 * turn;
  A.spine.x += 0.25 * tuck;
  A.head.x += 0.3 * tuck - 0.25 * (1 - tuck);
  A.upperLegL.x -= 1.7 * tuck;
  A.upperLegR.x -= 1.7 * tuck;
  A.lowerLegL.x += 2.2 * tuck;
  A.lowerLegR.x += 2.2 * tuck;
  A.footL.x += 0.4 * tuck;
  A.footR.x += 0.4 * tuck;
  A.upperArmL.x += arms;
  A.upperArmR.x += arms;
  A.upperArmL.z += 0.5 * tuck + 0.2;
  A.upperArmR.z -= 0.5 * tuck + 0.2;
  A.lowerArmL.x -= 0.4 + 0.5 * tuck;
  A.lowerArmR.x -= 0.4 + 0.5 * tuck;
  A.handL.x -= 0.3;
  A.handR.x -= 0.3;
}

// ---------------------------------------------------------------------------
// Axe stances (Aaron)
// ---------------------------------------------------------------------------

/**
 * Side-arm throw: the axe arm swings out wide and back behind the shoulder as
 * the torso coils right, then whips forward across the body with a step into
 * the release; the free arm sights the throw and pulls in.
 */
function poseThrow(A: Angles, t: number) {
  A.upperArmR.z += track(t, [
    [0, 0],
    [0.4, -1.45],
    [0.7, -1.05],
    [1, -0.3],
  ]);
  A.upperArmR.y += track(t, [
    [0, 0],
    [0.4, -0.95],
    [0.6, 1.15],
    [1, 0.3],
  ]);
  A.upperArmR.x += track(t, [
    [0, 0],
    [0.4, -0.1],
    [0.6, -0.45],
    [1, -0.1],
  ]);
  A.lowerArmR.x += track(t, [
    [0, 0],
    [0.4, -1.15],
    [0.6, -0.15],
    [1, -0.3],
  ]);
  A.handR.x += track(t, [
    [0, 0],
    [0.4, -0.35],
    [0.6, 0.2],
    [1, 0],
  ]);
  A.spine.y += track(t, [
    [0, 0],
    [0.4, -0.7],
    [0.65, 0.6],
    [1, 0.1],
  ]);
  A.spine.x += track(t, [
    [0, 0],
    [0.4, -0.1],
    [0.65, 0.3],
    [1, 0.08],
  ]);
  A.hips.y += track(t, [
    [0, 0],
    [0.4, -0.3],
    [0.65, 0.3],
    [1, 0],
  ]);
  A.head.y -= A.spine.y * 0.6;
  A.upperArmL.x += track(t, [
    [0, 0],
    [0.4, -0.95],
    [0.65, -0.3],
    [1, 0],
  ]);
  A.lowerArmL.x += track(t, [
    [0, 0],
    [0.4, -0.2],
    [0.65, -1.0],
    [1, -0.3],
  ]);
  A.upperLegL.x += track(t, [
    [0, 0],
    [0.4, -0.1],
    [0.65, -0.55],
    [1, -0.15],
  ]);
  A.lowerLegL.x += track(t, [
    [0, 0],
    [0.65, 0.55],
    [1, 0.15],
  ]);
  A.upperLegR.x += track(t, [
    [0, 0],
    [0.65, 0.4],
    [1, 0.1],
  ]);
  A.footR.x -= track(t, [
    [0, 0],
    [0.65, 0.35],
    [1, 0.1],
  ]);
}

/** Receiving the returning axe: arm out to meet it, a braced recoil on impact, then settle. */
function poseCatch(A: Angles, t: number) {
  A.upperArmR.x += track(t, [
    [0, -1.25],
    [0.3, -1.05],
    [0.55, -0.75],
    [1, 0],
  ]);
  A.upperArmR.z += track(t, [
    [0, -0.6],
    [0.3, -0.45],
    [1, 0],
  ]);
  A.lowerArmR.x += track(t, [
    [0, -0.1],
    [0.3, -0.6],
    [0.55, -0.75],
    [1, -0.2],
  ]);
  A.handR.x += track(t, [
    [0, -0.4],
    [0.3, 0],
    [1, 0],
  ]);
  A.spine.x += track(t, [
    [0, -0.05],
    [0.3, 0.25],
    [1, 0],
  ]);
  A.spine.y += track(t, [
    [0, -0.3],
    [0.35, 0.12],
    [1, 0],
  ]);
  A.head.y -= A.spine.y * 0.5;
  const brace = track(t, [
    [0, 0.2],
    [0.3, 1],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.25 * brace;
  A.upperLegR.x -= 0.25 * brace;
  A.lowerLegL.x += 0.45 * brace;
  A.lowerLegR.x += 0.45 * brace;
  A.upperArmL.z += 0.5 * brace;
  A.upperArmL.x += 0.2 * brace;
  A.lowerArmL.x -= 0.6 * brace;
}

/**
 * Greed Swing stance: both hands on the haft, axe thrust straight out ahead at
 * chest height (the wrist flips it to run along the arm instead of up from the
 * fist), torso leaning into the spin over a wide, bent-knee base. `t` is how
 * far the spin has ramped: the lean deepens and the arms lock out.
 */
function poseSpin(A: Angles, t: number) {
  const ramp = smooth(t);
  A.upperArmR.x -= 1.3 + 0.1 * ramp;
  A.upperArmR.z -= 0.5;
  A.lowerArmR.x -= 0.08;
  A.handR.x += Math.PI;
  A.handR.z -= 0.15;
  A.upperArmL.x -= 1.15 + 0.1 * ramp;
  A.upperArmL.z -= 0.35;
  A.lowerArmL.x -= 0.45 - 0.2 * ramp;
  A.spine.x += 0.22 + 0.12 * ramp;
  A.spine.y -= 0.35;
  A.hips.x += 0.05;
  A.head.y += 0.3;
  A.head.x -= 0.25;
  A.upperLegL.x -= 0.32;
  A.upperLegR.x -= 0.32;
  A.lowerLegL.x += 0.6;
  A.lowerLegR.x += 0.6;
  A.upperLegL.z += 0.22;
  A.upperLegR.z -= 0.22;
  A.footL.x -= 0.25;
  A.footR.x -= 0.25;
}

/** Combat-ready crouch after a Shadow Strike: axe shouldered, free hand up as a guard, weight low. */
function poseGuard(A: Angles, t: number) {
  const settle = 1 - 0.25 * smooth(t);
  A.upperArmR.x += 0.35 * settle;
  A.upperArmR.z -= 0.25;
  A.lowerArmR.x -= 0.65;
  A.handR.x -= 0.2;
  A.upperArmL.x -= 0.85 * settle;
  A.upperArmL.z += 0.1;
  A.lowerArmL.x -= 1.15;
  A.spine.x += 0.3 * settle;
  A.spine.y -= 0.2;
  A.head.x -= 0.32 * settle;
  A.head.y += 0.15;
  A.upperLegL.x -= 0.5 * settle;
  A.upperLegR.x -= 0.4 * settle;
  A.lowerLegL.x += 0.9 * settle;
  A.lowerLegR.x += 0.75 * settle;
  A.upperLegL.z += 0.18;
  A.upperLegR.z -= 0.18;
  A.footL.x -= 0.3 * settle;
  A.footR.x -= 0.25 * settle;
}

/** Suspended inside a force-field sphere: knees soft, legs trailing, arms floating ready. */
function poseHover(A: Angles, t: number) {
  const wave = Math.sin(t * Math.PI * 2);
  A.spine.x -= 0.08;
  A.head.x -= 0.12 + wave * 0.03;
  A.upperArmL.x -= 0.55;
  A.upperArmR.x -= 0.45;
  A.upperArmL.z += 0.32;
  A.upperArmR.z -= 0.38;
  A.lowerArmL.x -= 0.55 + wave * 0.08;
  A.lowerArmR.x -= 0.48 - wave * 0.08;
  A.handL.x += 0.2;
  A.handR.x += 0.15;
  A.upperLegL.x -= 0.35;
  A.upperLegR.x -= 0.22 + wave * 0.12;
  A.lowerLegL.x += 0.55;
  A.lowerLegR.x += 0.7 + wave * 0.1;
  A.upperLegL.z += 0.12;
  A.upperLegR.z -= 0.14;
  A.footL.x += 0.2;
  A.footR.x += 0.35;
}

/**
 * Force-field projection: coil, then both palms thrust toward the aim.
 * `t` 0 → 0.4 gathers, 0.4 → 1 holds the push.
 */
function poseCast(A: Angles, t: number) {
  const gather = 1 - smooth(Math.min(1, t / 0.4));
  const push = smooth(Math.min(1, Math.max(0, t - 0.28) / 0.35));
  A.spine.x += -0.18 * gather + 0.22 * push;
  A.spine.y -= 0.12 * push;
  A.head.x -= 0.1 * gather + 0.18 * push;
  A.upperArmL.x += 0.45 * gather - 1.55 * push;
  A.upperArmR.x += 0.55 * gather - 1.7 * push;
  A.upperArmL.z += 0.18 * gather - 0.12 * push;
  A.upperArmR.z -= 0.22 * gather + 0.08 * push;
  A.lowerArmL.x -= 1.4 * gather + 0.12 * push;
  A.lowerArmR.x -= 1.55 * gather + 0.08 * push;
  A.handL.x += 0.7 * push;
  A.handR.x += 0.85 * push;
  A.upperLegL.x -= 0.22 * gather + 0.12 * push;
  A.upperLegR.x -= 0.18 * gather - 0.18 * push;
  A.lowerLegL.x += 0.4 * gather;
  A.lowerLegR.x += 0.28 * gather;
}

/** Both palms turned down over a pool: elbows high, wrists dropped, weight in the hips. */
function poseChannel(A: Angles, t: number) {
  const d = 0.55 + 0.45 * smooth(t);
  A.spine.x += 0.28 * d;
  A.head.x += 0.22 * d;
  A.upperArmL.x -= 0.35 * d;
  A.upperArmR.x -= 0.35 * d;
  A.upperArmL.z += 0.55 * d;
  A.upperArmR.z -= 0.55 * d;
  A.lowerArmL.x -= 1.35 * d;
  A.lowerArmR.x -= 1.35 * d;
  A.handL.x += 0.6 * d;
  A.handR.x += 0.6 * d;
  A.upperLegL.x -= 0.18 * d;
  A.upperLegR.x -= 0.18 * d;
  A.lowerLegL.x += 0.28 * d;
  A.lowerLegR.x += 0.28 * d;
}

/** Arms spread to open a circle, then lowered as the pulse fires. */
function poseSummon(A: Angles, t: number) {
  const open = track(t, [
    [0, 0],
    [0.45, 1],
    [0.75, 1],
    [1, 0.15],
  ]);
  A.spine.x -= 0.08 * open;
  A.head.x -= 0.06 * open;
  A.upperArmL.z += 1.35 * open;
  A.upperArmR.z -= 1.35 * open;
  A.upperArmL.x -= 0.15 * open;
  A.upperArmR.x -= 0.15 * open;
  A.lowerArmL.x -= 0.25 * open;
  A.lowerArmR.x -= 0.25 * open;
  A.upperLegL.x -= 0.12;
  A.upperLegR.x -= 0.12;
}

/** Feet planted, chest lifted, arms tucked as the body swells. */
function poseGrow(A: Angles, t: number) {
  const d = 0.4 + 0.6 * smooth(t);
  A.upperLegL.x -= 0.35 * d;
  A.upperLegR.x -= 0.35 * d;
  A.lowerLegL.x += 0.55 * d;
  A.lowerLegR.x += 0.55 * d;
  A.upperLegL.z += 0.18 * d;
  A.upperLegR.z -= 0.18 * d;
  A.spine.x -= 0.16 * d;
  A.head.x -= 0.08 * d;
  A.upperArmL.x += 0.35 * d;
  A.upperArmR.x += 0.35 * d;
  A.upperArmL.z += 0.28 * d;
  A.upperArmR.z -= 0.28 * d;
  A.lowerArmL.x -= 1.1 * d;
  A.lowerArmR.x -= 1.1 * d;
}

/** One foot driven into the ground. `t` near 0 is the left foot, near 1 the right. */
function poseStomp(A: Angles, t: number) {
  if (t >= 0.5) {
    A.upperLegR.x += 0.95;
    A.lowerLegR.x += 0.12;
    A.upperLegL.x -= 0.5;
    A.lowerLegL.x += 0.75;
  } else {
    A.upperLegL.x += 0.95;
    A.lowerLegL.x += 0.12;
    A.upperLegR.x -= 0.5;
    A.lowerLegR.x += 0.75;
  }
  A.spine.x += 0.22;
  A.head.x += 0.08;
  A.upperArmL.x += 0.4;
  A.upperArmR.x += 0.4;
}

/** Aerial strafing run: chest open to the ground, arms wide, legs streaming back. */
function poseFlight(A: Angles, t: number) {
  const shoot = smooth(Math.min(1, t));
  A.hips.x += 0.18;
  A.spine.x += 0.42;
  A.head.x += 0.2;
  A.upperArmL.x -= 0.35 + 1.1 * shoot;
  A.upperArmR.x -= 0.25 + 1.25 * shoot;
  A.upperArmL.z += 0.55 - 0.2 * shoot;
  A.upperArmR.z -= 0.6 - 0.15 * shoot;
  A.lowerArmL.x -= 0.35 - 0.2 * shoot;
  A.lowerArmR.x -= 0.3 - 0.25 * shoot;
  A.handL.x += 0.45 * shoot;
  A.handR.x += 0.55 * shoot;
  A.upperLegL.x += 0.55;
  A.upperLegR.x += 0.7;
  A.lowerLegL.x += 0.35;
  A.lowerLegR.x += 0.55;
  A.footL.x += 0.4;
  A.footR.x += 0.5;
}

/** Controlled landing after an aerial: one knee absorbs, arms open, then rise. */
function poseLand(A: Angles, t: number) {
  const d = 1 - smooth(t);
  A.upperLegL.x -= 0.7 * d;
  A.upperLegR.x -= 1.15 * d;
  A.lowerLegL.x += 1.2 * d;
  A.lowerLegR.x += 1.7 * d;
  A.footR.x -= 0.35 * d;
  A.spine.x += 0.45 * d;
  A.head.x -= 0.35 * d;
  A.upperArmL.x -= 0.65 * d;
  A.upperArmR.x -= 0.55 * d;
  A.upperArmL.z += 0.35 * d;
  A.upperArmR.z -= 0.3 * d;
  A.lowerArmL.x -= 0.4 * d;
  A.lowerArmR.x -= 0.35 * d;
}

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

/** Spinning back kick: the hips carry the whole body around once, right leg whipped out at the apex. */
function poseSpinKick(A: Angles, p: number) {
  // Load (0.15) → spin through the back (0.3–0.7), leg out at 0.5 → plant.
  A.hips.y += track(p, [
    [0.12, 0],
    [0.7, -Math.PI * 2],
    [1, -Math.PI * 2],
  ]);
  const leg = track(p, [
    [0.2, 0],
    [0.45, 1],
    [0.6, 1],
    [0.82, 0],
  ]);
  A.upperLegR.x -= 1.35 * leg;
  A.upperLegR.z -= 0.55 * leg;
  A.lowerLegR.x += track(p, [
    [0.2, 0],
    [0.38, 1.6],
    [0.5, 0.1],
    [0.62, 0.15],
    [0.82, 0],
  ]);
  A.footR.x -= 0.4 * leg;
  // Lean away from the kick over the support leg, knee soft.
  A.spine.x -= 0.35 * leg;
  A.spine.z -= 0.25 * leg;
  A.hips.x -= 0.1 * leg;
  A.upperLegL.x -= 0.15 * leg;
  A.lowerLegL.x += 0.3 * leg;
  A.head.x += 0.3 * leg;
  // Arms flung wide for balance, fists closed.
  A.upperArmL.x -= 0.4 * leg;
  A.upperArmL.z += 0.9 * leg;
  A.lowerArmL.x -= 0.5 * leg;
  A.upperArmR.x -= 0.2 * leg;
  A.upperArmR.z -= 0.9 * leg;
  A.lowerArmR.x -= 0.7 * leg;
  const load = track(p, [
    [0, 0],
    [0.15, 1],
    [0.3, 0.3],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.2 * load;
  A.upperLegR.x -= 0.2 * load;
  A.lowerLegL.x += 0.35 * load;
  A.lowerLegR.x += 0.35 * load;
}

/** Spiked-knuckle smash: huge overhand right driven down through the target, body dropping with it. */
function poseSmash(A: Angles, p: number) {
  // Wind the fist high behind the head (0.3) → hammer through (0.55) →
  // hold low (0.72) → recover.
  A.upperArmR.x += track(p, [
    [0, 0],
    [0.3, -2.9],
    [0.55, -0.95],
    [0.72, -0.6],
    [1, 0],
  ]);
  A.upperArmR.z += track(p, [
    [0, 0],
    [0.3, -0.55],
    [0.55, 0.1],
    [1, 0],
  ]);
  A.lowerArmR.x += track(p, [
    [0, 0],
    [0.3, -1.9],
    [0.55, -0.1],
    [0.72, -0.25],
    [1, -0.2],
  ]);
  A.handR.x += track(p, [
    [0, 0],
    [0.3, -0.5],
    [0.55, 0.45],
    [1, 0],
  ]);
  A.spine.x += track(p, [
    [0, 0],
    [0.3, -0.3],
    [0.55, 0.55],
    [0.72, 0.45],
    [1, 0],
  ]);
  A.spine.y += track(p, [
    [0, 0],
    [0.3, -0.5],
    [0.55, 0.45],
    [1, 0],
  ]);
  A.hips.y += track(p, [
    [0, 0],
    [0.3, -0.25],
    [0.55, 0.3],
    [1, 0],
  ]);
  A.head.x -= A.spine.x * 0.8;
  A.head.y -= A.spine.y * 0.6;
  // Off arm pulls back hard for torque, then guards.
  A.upperArmL.x += track(p, [
    [0, 0],
    [0.3, -0.6],
    [0.55, 0.7],
    [1, 0],
  ]);
  A.lowerArmL.x += track(p, [
    [0, 0],
    [0.3, -1.3],
    [0.55, -0.9],
    [1, -0.2],
  ]);
  // Rise on the windup, drop the whole stance into the impact.
  const drop = track(p, [
    [0, 0],
    [0.3, -0.25],
    [0.55, 1],
    [0.72, 0.9],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.55 * drop;
  A.upperLegR.x -= 0.55 * drop;
  A.lowerLegL.x += 0.95 * drop;
  A.lowerLegR.x += 0.95 * drop;
  A.footL.x -= 0.25 * drop;
  A.footR.x -= 0.25 * drop;
}

/**
 * Seated on the pitchfork. Thighs forward, knees bent, both arms on the shaft.
 * Arm bends stay moderate: Lilly's export corkscrews if the elbows wind too far.
 */
function poseRide(A: Angles, t: number) {
  const d = 0.92 + Math.sin(t * Math.PI * 2) * 0.08;
  A.spine.x += 0.32 * d;
  A.chest.x += 0.12 * d;
  A.head.x -= 0.14 * d;
  A.upperArmL.x -= 1.05 * d;
  A.upperArmR.x -= 1.15 * d;
  A.upperArmL.z += 0.28 * d;
  A.upperArmR.z -= 0.08 * d;
  A.lowerArmL.x -= 0.7 * d;
  A.lowerArmR.x -= 0.75 * d;
  A.upperLegL.x -= 1.15 * d;
  A.upperLegR.x -= 1.15 * d;
  A.upperLegL.z += 0.42 * d;
  A.upperLegR.z -= 0.42 * d;
  A.lowerLegL.x += 1.25 * d;
  A.lowerLegR.x += 1.25 * d;
  A.footL.x -= 0.35 * d;
  A.footR.x -= 0.35 * d;
}

/** Both hands drive the pitchfork straight out. */
function poseForkThrust(A: Angles, p: number) {
  const reach = track(p, [
    [0, 0],
    [0.28, 0.35],
    [0.5, -1.25],
    [0.68, -1.15],
    [1, 0],
  ]);
  const elbow = track(p, [
    [0, 0],
    [0.28, -0.9],
    [0.5, -0.15],
    [1, 0],
  ]);
  A.upperArmL.x += reach;
  A.upperArmR.x += reach - 0.08;
  A.upperArmL.z += 0.22;
  A.upperArmR.z -= 0.06;
  A.lowerArmL.x += elbow;
  A.lowerArmR.x += elbow;
  A.spine.x += track(p, [
    [0, 0],
    [0.28, -0.16],
    [0.5, 0.22],
    [1, 0],
  ]);
  A.upperLegL.x -= 0.2;
  A.upperLegR.x -= 0.45 * Math.max(0, -reach);
  A.head.x -= A.spine.x * 0.5;
}

/** A wide horizontal cut. The chest turns; the arms stay in a reachable bend. */
function poseForkSweep(A: Angles, p: number) {
  const sweep = track(p, [
    [0, 0],
    [0.3, -1],
    [0.55, 1],
    [0.75, 0.7],
    [1, 0],
  ]);
  A.spine.y += sweep * 0.7;
  A.chest.y += sweep * 0.35;
  A.head.y -= sweep * 0.25;
  A.upperArmL.x -= 0.7;
  A.upperArmR.x -= 0.85;
  A.upperArmL.z += 0.55 + sweep * 0.25;
  A.upperArmR.z -= 0.35 - sweep * 0.2;
  A.lowerArmL.x -= 0.55;
  A.lowerArmR.x -= 0.6;
  A.upperLegL.x -= 0.25;
  A.upperLegR.x -= 0.15;
  A.hips.y += sweep * 0.2;
}

/** Overhead harvest brought down in front. */
function poseForkSlam(A: Angles, p: number) {
  const lift = track(p, [
    [0, 0],
    [0.32, 1],
    [0.58, 0],
    [1, 0],
  ]);
  const drop = track(p, [
    [0, 0],
    [0.32, 0],
    [0.58, 1],
    [0.75, 0.85],
    [1, 0],
  ]);
  A.upperArmL.x += -0.9 * lift - 0.55 * drop;
  A.upperArmR.x += -1.05 * lift - 0.7 * drop;
  A.upperArmL.z += 0.4 * lift;
  A.upperArmR.z -= 0.15 * lift;
  A.lowerArmL.x -= 0.85 * lift + 0.2 * drop;
  A.lowerArmR.x -= 0.95 * lift + 0.15 * drop;
  A.spine.x += -0.2 * lift + 0.35 * drop;
  A.upperLegL.x -= 0.4 * drop;
  A.upperLegR.x -= 0.4 * drop;
  A.lowerLegL.x += 0.55 * drop;
  A.lowerLegR.x += 0.55 * drop;
  A.head.x += 0.15 * drop;
}
