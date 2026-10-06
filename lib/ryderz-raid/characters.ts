import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HOST_MODELS, type EnemyKind, type RyderId, type RyderSpec } from './config';
import { applyGlbRepair, type GlbRepair } from './mesh-repair';
import {
  POSE_ROOT_DROP,
  ProceduralSkeleton,
  assessSkinning,
  bakeSkinnedMeshes,
  extractStrikes,
  poseSkeleton,
  type BoneKey,
  type MeleeStyle,
  type PoseOverride,
} from './skeletal';
import { addOutline, buildHumanoid, glow, toon, type Humanoid } from './toon';
import { PlasmaOrbits } from './plasma-orbs';

const BLADE = new THREE.BoxGeometry(0.08, 0.95, 0.08);
const AXE_HANDLE = new THREE.CylinderGeometry(0.05, 0.06, 1.15, 8);
const AXE_HEAD = new THREE.BoxGeometry(0.08, 0.38, 0.55);
const DART_GUN = new THREE.BoxGeometry(0.12, 0.12, 0.42);
const HALO = new THREE.TorusGeometry(0.55, 0.045, 8, 24);
const VEIN = new THREE.BoxGeometry(0.18, 0.42, 0.06);

const SKINS = [0xf3d2b5, 0xe0b48a, 0xc58c62, 0x8d5524, 0xf6e0c8, 0xb07a52];
const HAIR = [0x1a1210, 0x3b2416, 0x6b3a1f, 0x111111, 0xc8b48a, 0x4a2030];
const TOPS = [0x3a3a48, 0x5a2a2a, 0x2a3a5a, 0x3a4a32, 0x4a3a48, 0x22222c];
const BOTTOMS = [0x1c1c28, 0x243044, 0x2c241c, 0x1a2220];

export type ClipRole = 'idle' | 'walk' | 'run' | 'attack';

/**
 * Runtime state for a GLB-driven Ryder.
 * - Skeleton + locomotion clips: driven with an AnimationMixer.
 * - Skeleton, no locomotion clips (Tripo auto-rig): bones posed procedurally;
 *   any fight clips are cut into strikes and layered on top for melee.
 * - Static mesh: "puppet" motion (lean / bob / sway / chop) on the whole figure.
 */
export interface GltfRig {
  figure: THREE.Object3D;
  basePosition: THREE.Vector3;
  skinned: boolean;
  mixer: THREE.AnimationMixer | null;
  skeleton: ProceduralSkeleton | null;
  actions: Partial<Record<ClipRole, THREE.AnimationAction>>;
  current: ClipRole | null;
  attackLeft: number;
  /** Short in-place melee clips played over the procedural skeleton. */
  strikes: THREE.AnimationAction[];
  strikeIndex: number;
  strike: THREE.AnimationAction | null;
  /** Seconds left before the finished strike releases its bones back to the skeleton. */
  strikeRelease: number;
  /** Authored procedural melee styles, cycled per swing; `style` is the one in flight. */
  styles: MeleeStyle[];
  styleIndex: number;
  style: MeleeStyle;
  /** Socket the weapon hangs from. A hand bone when rigged, a fixed point otherwise. */
  weaponSocket: THREE.Object3D;
  /** Same for the free hand; null when the rig has no left hand bone. */
  offhandSocket: THREE.Object3D | null;
  /** Zoe's three plasma satellites; other Ryderz leave this unset. */
  orbs?: PlasmaOrbits;
}

/** Per-frame extras for `animateGltfFighter`: an ability stance and/or a chosen strike. */
export interface AnimateExtras {
  pose?: PoseOverride | null;
  /** Strike to play for this `meleeStarted`, instead of cycling the authored list. */
  style?: MeleeStyle;
  /** Substring of a baked clip name, from a civilian or Ryder animation map. */
  clipHint?: string;
  camera?: THREE.Camera;
}

export interface Fighter {
  humanoid: Humanoid;
  weapons: THREE.Object3D[];
  glowMeshes: THREE.Mesh[];
  meshSource: 'procedural' | 'gltf';
  rig?: GltfRig;
  /** Central plasma-orb controller (Zoe). Ticked from `animateGltfFighter`. */
  orbs?: PlasmaOrbits;
}

interface GltfTemplate {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  strikes: THREE.AnimationClip[];
  skinned: boolean;
}

const gltfLoader = new GLTFLoader();
const gltfTemplates = new Map<RyderId, GltfTemplate>();
const hostTemplates: GltfTemplate[] = [];
const civilianByUrl = new Map<string, GltfTemplate>();

async function loadGltfTemplate(url: string, label: string, repair?: GlbRepair): Promise<GltfTemplate> {
  const gltf = await gltfLoader.loadAsync(url);
  if (repair) applyGlbRepair(gltf.scene, repair, label);
  let skinned = false;
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mark = (material: THREE.Material) => {
      material.userData.retain = true;
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(mark);
    else if (mesh.material) mark(mesh.material);
  });
  if (skinned) {
    // A rig whose weights do not match its geometry would tear apart when
    // posed; freeze it in its export pose and animate it as a puppet instead.
    const broken = assessSkinning(gltf.scene);
    if (broken.length) {
      bakeSkinnedMeshes(gltf.scene);
      skinned = false;
      console.info('[raid] %s: untrusted rig (%s), using static mesh', label, broken.join(', '));
    }
  }
  const clips = gltf.animations ?? [];
  const strikes = skinned && clips.length ? extractStrikes(gltf.scene, clips) : [];
  if (clips.length) {
    console.info('[raid] %s clips:', label, clips.map((c) => c.name).join(', '));
    if (strikes.length) console.info('[raid] %s strikes:', label, strikes.length);
  }
  return { scene: gltf.scene, clips, strikes, skinned };
}

export async function preloadRyderGltf(spec: RyderSpec) {
  if (!spec.glb || gltfTemplates.has(spec.id)) return;
  gltfTemplates.set(spec.id, await loadGltfTemplate(spec.glb, spec.id, spec.glbRepair));
}

/** Load the host mob models; failures are logged and that model is skipped. */
export async function preloadHostGltf() {
  if (hostTemplates.length || !HOST_MODELS.length) return;
  const loaded = await Promise.all(
    HOST_MODELS.map((url) =>
      loadGltfTemplate(url, `host ${url.split('/').pop()}`).catch((error) => {
        console.warn('[raid] host model failed to load', url, error);
        return null;
      }),
    ),
  );
  loaded.forEach((template) => {
    if (template) hostTemplates.push(template);
  });
}

/** Load civilian bodies named in the registry. Known host files are reused. */
export async function preloadCivilianModels(urls: Array<string | null | undefined>) {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  await Promise.all(
    unique.map(async (url) => {
      if (civilianByUrl.has(url)) return;
      const hostIndex = HOST_MODELS.indexOf(url);
      if (hostIndex >= 0 && hostTemplates[hostIndex]) {
        civilianByUrl.set(url, hostTemplates[hostIndex]);
        return;
      }
      try {
        civilianByUrl.set(url, await loadGltfTemplate(url, `civilian ${url.split('/').pop()}`));
      } catch (error) {
        console.warn('[raid] civilian model failed to load', url, error);
      }
    }),
  );
}

const CLIP_PATTERNS: Record<ClipRole, RegExp> = {
  idle: /idle|breath|stand|rest/i,
  walk: /walk/i,
  run: /run|jog|sprint/i,
  attack: /attack|swing|slash|chop|melee|punch|strike|hit/i,
};

function pickClip(clips: THREE.AnimationClip[], role: ClipRole) {
  return clips.find((c) => CLIP_PATTERNS[role].test(c.name)) ?? null;
}

function findHandBone(root: THREE.Object3D): THREE.Bone | null {
  let right: THREE.Bone | null = null;
  let any: THREE.Bone | null = null;
  root.traverse((o) => {
    const bone = o as THREE.Bone;
    if (!bone.isBone || !/hand/i.test(bone.name)) return;
    if (/wrist|thumb|index|middle|ring|pinky|finger/i.test(bone.name)) return;
    if (!any) any = bone;
    if (!right && /right|_r$|\.r$|^r_|r_hand|righthand|hand_r/i.test(bone.name)) right = bone;
  });
  return right ?? any;
}

/**
 * For an unrigged mesh: find the raised fist so we can hang a weapon from it.
 * Picks the highest vertex that sits well outside the torso centre line.
 */
function findRaisedHand(figure: THREE.Object3D, lateralMin: number) {
  figure.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(figure.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const best = new THREE.Vector3(0.3, 1.5, 0.05);
  let bestY = -Infinity;
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    local.multiplyMatrices(inverse, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(local);
      if (Math.abs(v.x) < lateralMin) continue;
      if (v.y > bestY) {
        bestY = v.y;
        best.copy(v);
      }
    }
  });
  return best;
}

function dummyPart(name: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
  mesh.name = name;
  mesh.visible = false;
  return mesh;
}

/** Figure-space bounds, re-evaluating skinned meshes against their current pose. */
function measureFigure(figure: THREE.Object3D) {
  figure.updateWorldMatrix(true, true);
  figure.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    mesh.computeBoundingBox();
  });
  return new THREE.Box3().setFromObject(figure);
}

function wrapGltfAsHumanoid(
  template: GltfTemplate,
  height = 1.88,
  options: { ownMaterials?: boolean; strikes?: MeleeStyle[]; keep?: BoneKey[] } = {},
): { humanoid: Humanoid; rig: GltfRig } {
  const group = new THREE.Group();
  const figure = template.skinned ? (cloneSkeleton(template.scene) as THREE.Group) : template.scene.clone(true);

  // Rigged exports without locomotion clips get a procedural skeleton, which
  // also squares up whatever pose the model was exported in before we measure it.
  const hasLocomotion = (['idle', 'walk', 'run'] as ClipRole[]).some((role) => pickClip(template.clips, role));
  let skeleton: ProceduralSkeleton | null = null;
  if (template.skinned && !hasLocomotion) {
    const candidate = new ProceduralSkeleton(figure, options.keep ? { keep: options.keep } : undefined);
    if (candidate.isUsable) {
      skeleton = candidate;
      skeleton.apply();
    }
  }

  const box = measureFigure(figure);
  const size = box.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 0.001);
  figure.scale.setScalar(scale);
  figure.position.set(
    -(box.min.x + box.max.x) * 0.5 * scale,
    -box.min.y * scale,
    -(box.min.z + box.max.z) * 0.5 * scale,
  );
  // Tripo exports face +Z, which is this game's forward; no yaw correction needed.
  figure.rotation.y = 0;
  figure.name = 'TripoFigure';
  group.add(figure);

  // Materials are shared with the template (and every other instance) unless
  // the caller needs to tint or flash this figure on its own.
  const materials: THREE.Material[] = [];
  const owned = new Map<THREE.Material, THREE.Material>();
  figure.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    if (options.ownMaterials) {
      const own = (material: THREE.Material) => {
        let copy = owned.get(material);
        if (!copy) {
          copy = material.clone();
          copy.userData.retain = false;
          owned.set(material, copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => {
      if (material && !materials.includes(material)) materials.push(material);
    });
  });

  // Weapon socket: hand bone when rigged, otherwise the raised fist of the static pose.
  let weaponSocket: THREE.Object3D;
  let offhandSocket: THREE.Object3D | null = null;
  const bone = template.skinned ? (skeleton?.bone('handR') ?? findHandBone(figure)) : null;
  const offBone = template.skinned ? skeleton?.bone('handL') ?? null : null;
  if (offBone) {
    offhandSocket = new THREE.Object3D();
    offhandSocket.name = 'OffhandSocket';
    offhandSocket.scale.setScalar(1 / scale);
    offBone.add(offhandSocket);
    skeleton?.alignSocket('handL', offhandSocket);
  }
  if (bone) {
    weaponSocket = new THREE.Object3D();
    weaponSocket.name = 'WeaponSocket';
    // Bones live inside the scaled figure; undo that so weapons keep metre sizes.
    weaponSocket.scale.setScalar(1 / scale);
    bone.add(weaponSocket);
    // Weapons are authored in figure space (grip at origin, blade along +Y).
    skeleton?.alignSocket('handR', weaponSocket);
  } else {
    // Anchor on the figure (so it follows puppet lean/twist), then step back
    // into metre space for the weapon itself.
    const anchor = new THREE.Object3D();
    anchor.name = 'WeaponAnchor';
    anchor.position.copy(findRaisedHand(figure, 0.2 / scale));
    anchor.scale.setScalar(1 / scale);
    figure.add(anchor);
    weaponSocket = new THREE.Object3D();
    weaponSocket.name = 'WeaponSocket';
    anchor.add(weaponSocket);
  }

  let mixer: THREE.AnimationMixer | null = null;
  const actions: GltfRig['actions'] = {};
  const strikes: THREE.AnimationAction[] = [];
  if (skeleton && template.strikes.length) {
    mixer = new THREE.AnimationMixer(figure);
    template.strikes.forEach((clip) => {
      const action = mixer!.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      strikes.push(action);
    });
  } else if (template.skinned && template.clips.length) {
    mixer = new THREE.AnimationMixer(figure);
    (['idle', 'walk', 'run', 'attack'] as ClipRole[]).forEach((role) => {
      const clip = pickClip(template.clips, role);
      if (clip) actions[role] = mixer!.clipAction(clip);
    });
    if (!actions.idle) actions.idle = mixer.clipAction(template.clips[0]);
    if (!actions.run) actions.run = actions.walk;
    if (!actions.walk) actions.walk = actions.run;
    if (actions.attack) {
      actions.attack.setLoop(THREE.LoopOnce, 1);
      actions.attack.clampWhenFinished = true;
    }
  }

  const rig: GltfRig = {
    figure,
    basePosition: figure.position.clone(),
    skinned: template.skinned,
    mixer,
    skeleton,
    actions,
    current: null,
    attackLeft: 0,
    strikes,
    strikeIndex: 0,
    strike: null,
    strikeRelease: 0,
    styles: options.strikes?.length ? options.strikes : ['chop'],
    styleIndex: 0,
    style: options.strikes?.[0] ?? 'chop',
    weaponSocket,
    offhandSocket,
  };

  const torso = dummyPart('Torso');
  const head = dummyPart('Head');
  const armL = dummyPart('ArmL');
  const armR = dummyPart('ArmR');
  const legL = dummyPart('LegL');
  const legR = dummyPart('LegR');
  const handL: THREE.Object3D = offhandSocket ?? new THREE.Object3D();
  if (!offhandSocket) armL.add(handL);
  group.add(torso, head, armL, armR, legL, legR);

  return {
    humanoid: {
      group,
      torso,
      head,
      armL,
      armR,
      legL,
      legR,
      handL,
      handR: weaponSocket,
      eyeMaterial: new THREE.MeshBasicMaterial({ visible: false }),
      materials,
      height,
    },
    rig,
  };
}

/** Matte black battle axe with a thin aura edge so it reads against the night city. */
function buildBlackAxe(auraColor: THREE.ColorRepresentation, intensity: number) {
  const axe = new THREE.Group();
  axe.name = 'BlackAxe';
  // Fist sits at the origin and grips the haft about a third of the way up.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 10), toon(0x111116));
  handle.position.y = 0.15;
  addOutline(handle, 0.02);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.26, 10), toon(0x1e1a24));
  grip.position.y = 0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.48), toon(0x0a0a0e));
  head.position.set(0, 0.46, 0.16);
  addOutline(head, 0.025);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), toon(0x0a0a0e));
  spike.position.y = 0.7;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.035), glow(auraColor, intensity));
  edge.position.set(0, 0.46, 0.39);
  axe.add(handle, grip, head, spike, edge);
  return { axe, edge };
}

const KNUCKLE_BAR = new THREE.BoxGeometry(0.096, 0.03, 0.078);
const KNUCKLE_PLATE = new THREE.BoxGeometry(0.088, 0.016, 0.086);
const KNUCKLE_SPIKE = new THREE.ConeGeometry(0.016, 0.07, 4);
const KNUCKLE_SEAM = new THREE.BoxGeometry(0.092, 0.007, 0.012);
const KNUCKLE_NODE = new THREE.BoxGeometry(0.013, 0.013, 0.013);
const KNUCKLE_STRAP = new THREE.BoxGeometry(0.1, 0.04, 0.012);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Ryder-tech spiked knuckles: a gunmetal bar over the fingers, four angular
 * spikes, and emissive seams that the power system drives (bright with power,
 * flaring on hits, dim when burnt out). Authored in hand space for a hanging
 * arm — fingers along -Y, knuckle face toward -Y, hand width along X — and
 * rotated onto the socket by the caller.
 */
export function buildSpikedKnuckles(auraColor: THREE.ColorRepresentation, intensity: number) {
  const group = new THREE.Group();
  group.name = 'SpikedKnuckles';
  const metal = toon(0x2a2e38);
  const dark = toon(0x16181f);
  const seamMat = glow(auraColor, intensity);

  const bar = new THREE.Mesh(KNUCKLE_BAR, metal);
  addOutline(bar, 0.012);
  const plate = new THREE.Mesh(KNUCKLE_PLATE, dark);
  plate.position.set(0, 0.02, 0);
  group.add(bar, plate);
  // Straps band the fist on both faces just above the bar (toward the wrist).
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(KNUCKLE_STRAP, dark);
    strap.position.set(0, 0.04, side * 0.044);
    group.add(strap);
  }

  const seams: THREE.Mesh[] = [];
  const seamFront = new THREE.Mesh(KNUCKLE_SEAM, seamMat);
  seamFront.position.set(0, -0.006, 0.042);
  const seamBack = new THREE.Mesh(KNUCKLE_SEAM, seamMat);
  seamBack.position.set(0, -0.006, -0.042);
  group.add(seamFront, seamBack);
  seams.push(seamFront, seamBack);

  for (let i = 0; i < 4; i += 1) {
    const x = (i - 1.5) * 0.025;
    const spike = new THREE.Mesh(KNUCKLE_SPIKE, metal);
    spike.position.set(x, -0.048, 0);
    spike.rotation.set(Math.PI, Math.PI / 4, 0);
    const node = new THREE.Mesh(KNUCKLE_NODE, seamMat);
    node.position.set(x, -0.018, 0.034);
    const nodeBack = new THREE.Mesh(KNUCKLE_NODE, seamMat);
    nodeBack.position.set(x, -0.018, -0.034);
    group.add(spike, node, nodeBack);
    seams.push(node, nodeBack);
  }
  return { group, seams };
}

function fitRigAction(rig: GltfRig, role: ClipRole, fade = 0.16) {
  const next = rig.actions[role];
  if (!next || rig.current === role) return;
  const prev = rig.current ? rig.actions[rig.current] : null;
  next.enabled = true;
  next.reset().fadeIn(fade).play();
  if (prev && prev !== next) prev.fadeOut(fade);
  rig.current = role;
}

/** Melee duration the strike clips are fitted to; matches the engine's swing window. */
const STRIKE_TIME = 0.45;
/** How far the figure steps into each procedural melee style, in metres. */
const STRIKE_LUNGE: Record<MeleeStyle, number> = {
  chop: 0.22,
  slash: 0.18,
  punch: 0.3,
  punchR: 0.3,
  kick: 0.1,
  spinKick: 0.16,
  slap: 0.2,
  blast: 0.35,
  smash: 0.38,
};
const STRIKE_RELEASE = 0.12;

/**
 * Procedural locomotion with baked strikes layered on top. The skeleton is
 * posed every frame; while a strike plays the mixer overrides the bones it
 * animates, blending from (and back to) the pose it found when it started.
 * The action is stopped once released so the mixer lets go of the bones.
 */
function clipForStyle(style: MeleeStyle | undefined, count: number) {
  if (!count) return 0;
  if (style === 'kick' || style === 'spinKick') return 1 % count;
  if (style === 'smash' || style === 'slash' || style === 'chop') return Math.min(2, count - 1);
  if (style === 'blast' || style === 'slap') return Math.min(3, count - 1);
  return 0;
}

function strikeForHint(strikes: THREE.AnimationAction[], hint: string | undefined) {
  if (!hint) return null;
  const needle = hint.toLowerCase();
  return strikes.find((action) => action.getClip().name.toLowerCase().includes(needle)) ?? null;
}

function animateSkeletonWithStrikes(
  rig: GltfRig,
  dt: number,
  phase: number,
  moving: number,
  sprinting: boolean,
  meleeStarted: boolean,
  pose: PoseOverride | null,
  style?: MeleeStyle,
  clipHint?: string,
) {
  const skeleton = rig.skeleton!;
  const mixer = rig.mixer!;
  // The clip supplies the swing, so the procedural chop stays off.
  poseSkeleton(skeleton, { phase, moving, sprinting, meleeT: 0, pose });
  const f = rig.figure;
  f.position.copy(rig.basePosition);
  f.position.y += Math.abs(Math.sin(phase)) * (sprinting ? 0.045 : 0.025) * moving * (pose ? 1 - pose.weight : 1);
  if (pose) f.position.y -= POSE_ROOT_DROP[pose.kind] * Math.min(1, pose.weight);
  f.rotation.set(0, 0, 0);

  if (meleeStarted) {
    rig.strike?.stop();
    const hinted = strikeForHint(rig.strikes, clipHint);
    const index = style ? clipForStyle(style, rig.strikes.length) : rig.strikeIndex % rig.strikes.length;
    const strike = hinted ?? rig.strikes[index];
    rig.strikeIndex += 1;
    const length = strike.getClip().duration || STRIKE_TIME;
    strike.timeScale = length / STRIKE_TIME;
    strike.reset().fadeIn(0.05).play();
    rig.strike = strike;
    rig.attackLeft = STRIKE_TIME;
    rig.strikeRelease = STRIKE_RELEASE;
  }
  if (!rig.strike) return;

  if (rig.attackLeft > 0) {
    rig.attackLeft -= dt;
    if (rig.attackLeft <= 0) rig.strike.fadeOut(STRIKE_RELEASE);
  } else {
    rig.strikeRelease -= dt;
    if (rig.strikeRelease <= 0) {
      rig.strike.stop();
      rig.strike = null;
      return;
    }
  }
  mixer.update(dt);
}

/**
 * Per-frame animation for a GLB Ryder.
 * - Rigged: crossfades idle / walk / run clips and fires the attack clip on melee.
 * - Static: puppet motion on the whole figure so he still reads as alive.
 */
export function animateGltfFighter(
  fighter: Fighter,
  dt: number,
  phase: number,
  moving: number,
  sprinting: boolean,
  meleeT: number,
  meleeStarted: boolean,
  extras?: AnimateExtras,
) {
  const rig = fighter.rig;
  if (!rig) return;
  const pose = extras?.pose && extras.pose.weight > 0 ? extras.pose : null;

  if (rig.skeleton && rig.mixer && rig.strikes.length) {
    animateSkeletonWithStrikes(rig, dt, phase, moving, sprinting, meleeStarted, pose, extras?.style, extras?.clipHint);
  } else if (rig.mixer) {
    if (meleeStarted && rig.actions.attack) {
      const attack = rig.actions.attack;
      const clipLen = attack.getClip().duration || 0.6;
      attack.timeScale = clipLen / 0.55;
      rig.current = null;
      Object.values(rig.actions).forEach((a) => a && a !== attack && a.fadeOut(0.08));
      attack.reset().fadeIn(0.06).play();
      rig.attackLeft = 0.55;
    }
    if (rig.attackLeft > 0) {
      rig.attackLeft -= dt;
    } else {
      const role: ClipRole = moving > 0.1 ? (sprinting || !rig.actions.walk ? 'run' : 'walk') : 'idle';
      fitRigAction(rig, role);
      const act = rig.actions[role];
      if (act && role !== 'idle') act.timeScale = sprinting ? 1.25 : 1;
    }
    rig.mixer.update(dt);
    rig.figure.position.copy(rig.basePosition);
    rig.figure.rotation.set(0, 0, 0);
  } else if (rig.skeleton) {
    if (meleeStarted) {
      if (extras?.style) {
        rig.style = extras.style;
      } else {
        rig.style = rig.styles[rig.styleIndex % rig.styles.length];
        rig.styleIndex += 1;
      }
    }
    poseSkeleton(rig.skeleton, { phase, moving, sprinting, meleeT, meleeStyle: rig.style, pose });
    const f = rig.figure;
    const swing = meleeT > 0 ? Math.sin((1 - meleeT) * Math.PI) : 0;
    f.position.copy(rig.basePosition);
    f.position.y += Math.abs(Math.sin(phase)) * (sprinting ? 0.045 : 0.025) * moving * (pose ? 1 - pose.weight : 1);
    if (pose) f.position.y -= POSE_ROOT_DROP[pose.kind] * Math.min(1, pose.weight);
    f.position.z += swing * STRIKE_LUNGE[rig.style];
    f.rotation.set(0, 0, 0);
  } else {
    // --- Puppet fallback for an unrigged mesh -------------------------------
    const f = rig.figure;
    const swing = meleeT > 0 ? Math.sin((1 - meleeT) * Math.PI) : 0;
    const lean = moving * (sprinting ? 0.2 : 0.11);
    f.position.copy(rig.basePosition);
    f.position.y += Math.abs(Math.sin(phase)) * 0.05 * moving;
    f.position.z += swing * 0.28;
    f.rotation.x = lean + swing * 0.3;
    f.rotation.z = Math.sin(phase) * 0.045 * moving - swing * 0.12;
    f.rotation.y = Math.sin(phase) * 0.07 * moving - swing * 0.55;

    // Raised-fist chop: upright at rest, arcs forward and down through the swing.
    const socket = rig.weaponSocket;
    socket.rotation.x = swing * 1.7;
    socket.rotation.z = -swing * 0.2;
    socket.position.set(0, -swing * 0.25, swing * 0.35);
  }

  const orbs = fighter.orbs ?? rig.orbs;
  if (orbs) orbs.update(dt, extras?.camera);
}

function attachPlasmaOrbs(parent: THREE.Object3D, color: THREE.ColorRepresentation) {
  const orbs = new PlasmaOrbits(color);
  parent.add(orbs.group);
  return orbs;
}

export function buildRyder(spec: RyderSpec, options: { clone?: boolean } = {}): Fighter {
  const template = gltfTemplates.get(spec.id);
  if (template) {
    // Own materials: the player fades, glows and goes translucent per frame, and
    // none of that may bleed into the template shared with clones and the showcase.
    const { humanoid, rig } = wrapGltfAsHumanoid(template, options.clone ? 1.72 : 1.88, {
      strikes: spec.strikes,
      ownMaterials: true,
      keep: spec.skelKeep,
    });
    const weapons: THREE.Object3D[] = [];
    const glowMeshes: THREE.Mesh[] = [];
    const aura = glow(spec.color, options.clone ? 1.4 : 2);
    if (spec.id === 'aaron') {
      const { axe, edge } = buildBlackAxe(spec.color, options.clone ? 0.7 : 1.1);
      rig.weaponSocket.add(axe);
      weapons.push(axe);
      glowMeshes.push(edge);
    } else if (spec.id === 'leo') {
      // Spiked knuckles over both fists. Sockets sit at the wrist in figure
      // space; the fist runs ~11 cm along the hand bone's axis, so the bar is
      // slid down that axis to the knuckle line and the spikes point past it.
      const sockets: Array<[THREE.Object3D | null, 'handR' | 'handL']> = [
        [rig.weaponSocket, 'handR'],
        [rig.offhandSocket, 'handL'],
      ];
      const fist = new THREE.Vector3();
      for (const [socket, key] of sockets) {
        if (!socket) continue;
        const { group, seams } = buildSpikedKnuckles(spec.color, options.clone ? 0.9 : 1.5);
        rig.skeleton?.boneAxis(key, fist) ?? fist.set(0, -1, 0);
        group.quaternion.setFromUnitVectors(DOWN, fist);
        group.position.copy(fist).multiplyScalar(0.082);
        socket.add(group);
        weapons.push(group);
        glowMeshes.push(...seams);
      }
    } else if (spec.id === 'zoe') {
      const orbs = attachPlasmaOrbs(humanoid.group, spec.color);
      glowMeshes.push(...orbs.glowMeshes);
      rig.orbs = orbs;
      return { humanoid, weapons, glowMeshes, meshSource: 'gltf' as const, rig, orbs };
    }
    // Keven's dart and Rubi's blade are modelled into their Tripo meshes, so
    // neither gets a socketed weapon.
    return { humanoid, weapons, glowMeshes, meshSource: 'gltf', rig };
  }

  const humanoid = buildHumanoid({
    skin: spec.id === 'aaron' ? 0xc9a882 : spec.id === 'keven' ? 0xe8c4a0 : 0xf0c8a8,
    top: spec.color,
    bottom: 0x16141f,
    hair: spec.id === 'leo' ? 0x1a120c : spec.id === 'zoe' ? 0x3a2418 : 0x120e0c,
    eyes: spec.color,
    eyeIntensity: 2.4,
    scale: options.clone ? 0.92 : 1,
    outline: 0.045,
  });

  const weapons: THREE.Object3D[] = [];
  const glowMeshes: THREE.Mesh[] = [];
  const aura = glow(spec.color, options.clone ? 1.4 : 2);

  const addWeapon = (mesh: THREE.Mesh, hand: 'L' | 'R') => {
    addOutline(mesh, 0.03);
    (hand === 'R' ? humanoid.handR : humanoid.handL).add(mesh);
    weapons.push(mesh);
    glowMeshes.push(mesh);
  };

  if (spec.id === 'rubi') {
    const l = new THREE.Mesh(BLADE, aura.clone());
    l.position.set(0, -0.15, 0.05);
    l.rotation.x = 0.2;
    const r = new THREE.Mesh(BLADE, aura);
    r.position.set(0, -0.15, 0.05);
    r.rotation.x = 0.2;
    addWeapon(l, 'L');
    addWeapon(r, 'R');
  } else if (spec.id === 'leo') {
    for (const hand of ['L', 'R'] as const) {
      const { group, seams } = buildSpikedKnuckles(spec.color, options.clone ? 1 : 1.6);
      group.position.set(0, -0.06, 0.06);
      group.rotation.x = Math.PI / 2;
      (hand === 'R' ? humanoid.handR : humanoid.handL).add(group);
      weapons.push(group);
      glowMeshes.push(...seams);
    }
  } else if (spec.id === 'aaron') {
    const axe = new THREE.Group();
    const handle = new THREE.Mesh(AXE_HANDLE, toon(0x1a1422));
    addOutline(handle, 0.03);
    const head = new THREE.Mesh(AXE_HEAD, aura);
    head.position.set(0, 0.42, 0.12);
    addOutline(head, 0.03);
    axe.add(handle, head);
    axe.rotation.x = Math.PI / 2;
    humanoid.handR.add(axe);
    weapons.push(axe);
    glowMeshes.push(head);
  } else if (spec.id === 'zoe') {
    const orbs = attachPlasmaOrbs(humanoid.group, spec.color);
    glowMeshes.push(...orbs.glowMeshes);
    if (options.clone) {
      humanoid.materials.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.72;
      });
    }
    return { humanoid, weapons, glowMeshes, meshSource: 'procedural', orbs };
  } else {
    const gun = new THREE.Mesh(DART_GUN, aura);
    gun.position.set(0, 0, 0.12);
    addWeapon(gun, 'R');
  }

  if (options.clone) {
    humanoid.materials.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.72;
    });
  }

  return { humanoid, weapons, glowMeshes, meshSource: 'procedural' };
}

/** Albedo tint per host kind so the mob reads at a glance even on one shared model. */
const HOST_TINT: Record<EnemyKind, number> = {
  walker: 0xffffff,
  sprinter: 0xc9ffd2,
  heavy: 0xffc9a6,
  thrower: 0xd6f0ff,
  broadcaster: 0xd9b3ff,
};

export function buildHost(kind: EnemyKind, modelPath?: string | null): Fighter {
  const scale = kind === 'broadcaster' ? 2.05 : kind === 'heavy' ? 1.42 : kind === 'sprinter' ? 0.9 : 1;
  const eye =
    kind === 'broadcaster' ? 0xb84dff : kind === 'sprinter' ? 0xb6ff3a : kind === 'heavy' ? 0xff7a1a : 0x5dff9a;

  const mapped = modelPath ? civilianByUrl.get(modelPath) : undefined;
  const template = mapped ?? (hostTemplates.length ? hostTemplates[Math.floor(Math.random() * hostTemplates.length)] : undefined);
  if (template) {
    const { humanoid, rig } = wrapGltfAsHumanoid(template, 1.9 * scale, { ownMaterials: true });
    humanoid.materials.forEach((material) => {
      const m = material as THREE.MeshStandardMaterial;
      if (m.color) m.color.set(HOST_TINT[kind]);
    });

    // Signal vein on the chest: ride the chest bone when rigged so it follows the torso.
    const vein = new THREE.Mesh(VEIN, glow(eye, 1.6));
    const chest = rig.skeleton?.bone('chest');
    if (chest) {
      const socket = new THREE.Object3D();
      socket.scale.setScalar(1 / rig.figure.scale.x);
      chest.add(socket);
      rig.skeleton?.alignSocket('chest', socket);
      vein.position.set(0, 0.07 * scale, 0.15 * scale);
      vein.scale.setScalar(0.55 * scale);
      socket.add(vein);
    } else {
      vein.position.set(0, 1.25 * scale, 0.15 * scale);
      vein.scale.setScalar(0.55 * scale);
      humanoid.group.add(vein);
    }

    const glowMeshes: THREE.Mesh[] = [vein];
    const weapons: THREE.Object3D[] = [];
    if (kind === 'broadcaster') {
      const crown = new THREE.Mesh(HALO, glow(0xb84dff, 1.8));
      crown.rotation.x = Math.PI / 2;
      crown.position.y = humanoid.height + 0.08;
      crown.scale.setScalar(scale * 0.6);
      humanoid.group.add(crown);
      glowMeshes.push(crown);
      weapons.push(crown);
    }
    return { humanoid, weapons, glowMeshes, meshSource: 'gltf', rig };
  }

  const humanoid = buildHumanoid({
    skin: SKINS[Math.floor(Math.random() * SKINS.length)],
    top: kind === 'broadcaster' ? 0x2a1038 : TOPS[Math.floor(Math.random() * TOPS.length)],
    bottom: BOTTOMS[Math.floor(Math.random() * BOTTOMS.length)],
    hair: HAIR[Math.floor(Math.random() * HAIR.length)],
    eyes: eye,
    eyeIntensity: kind === 'broadcaster' ? 3.4 : 2.6,
    scale,
    outline: kind === 'broadcaster' ? 0.07 : 0.04,
  });

  const vein = new THREE.Mesh(VEIN, glow(eye, 1.6));
  vein.position.set(0, 0.06, 0.17);
  humanoid.torso.add(vein);

  const glowMeshes: THREE.Mesh[] = [vein];
  const weapons: THREE.Object3D[] = [];

  if (kind === 'broadcaster') {
    const crown = new THREE.Mesh(HALO, glow(0xb84dff, 1.8));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 1.95;
    humanoid.group.add(crown);
    glowMeshes.push(crown);
    weapons.push(crown);
  }

  return { humanoid, weapons, glowMeshes, meshSource: 'procedural' };
}

export function setWeaponGlow(fighter: Fighter, on: boolean, color: THREE.ColorRepresentation) {
  fighter.glowMeshes.forEach((mesh) => {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (!('color' in mat)) return;
    mat.color.set(color);
    mat.color.multiplyScalar(on ? 2 : 0.25);
  });
}

export const BOLT_GEOMETRY = new THREE.SphereGeometry(0.16, 10, 8);
export const SLASH_GEOMETRY = new THREE.TorusGeometry(0.7, 0.06, 6, 16, Math.PI);
