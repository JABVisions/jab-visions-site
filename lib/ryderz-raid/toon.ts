import * as THREE from 'three';

let gradientMap: THREE.DataTexture | null = null;

/** Three hard shading bands give the flat, comic-book look. */
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const steps = [70, 150, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export const OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x07040c,
  side: THREE.BackSide,
  toneMapped: false,
});

export function toon(
  color: THREE.ColorRepresentation,
  options: {
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    map?: THREE.Texture | null;
  } = {},
) {
  return new THREE.MeshToonMaterial({
    color,
    map: options.map ?? null,
    gradientMap: getGradientMap(),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

export function glow(color: THREE.ColorRepresentation, intensity = 2.2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
  });
}

const boundsBox = new THREE.Box3();
const boundsSize = new THREE.Vector3();
const boundsCenter = new THREE.Vector3();

/** Inverted-hull ink line: a back-face copy of the mesh inflated by `thickness` world units. */
export function addOutline(mesh: THREE.Mesh, thickness = 0.045) {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  boundsBox.copy(geometry.boundingBox as THREE.Box3);
  boundsBox.getSize(boundsSize);
  const outline = new THREE.Mesh(geometry, OUTLINE_MATERIAL);
  outline.scale.set(
    1 + (2 * thickness) / Math.max(boundsSize.x, 0.001),
    1 + (2 * thickness) / Math.max(boundsSize.y, 0.001),
    1 + (2 * thickness) / Math.max(boundsSize.z, 0.001),
  );
  boundsBox.getCenter(boundsCenter);
  outline.position.copy(boundsCenter).multiplyScalar(-1).multiply(outline.scale).add(boundsCenter);
  outline.renderOrder = -1;
  outline.name = 'outline';
  mesh.add(outline);
  return outline;
}

export interface HumanoidLook {
  skin: THREE.ColorRepresentation;
  top: THREE.ColorRepresentation;
  bottom: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  eyes: THREE.ColorRepresentation;
  eyeIntensity?: number;
  scale?: number;
  outline?: number;
}

export interface Humanoid {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  handR: THREE.Object3D;
  handL: THREE.Object3D;
  eyeMaterial: THREE.MeshBasicMaterial;
  materials: THREE.MeshToonMaterial[];
  height: number;
}

const HEAD_GEOMETRY = new THREE.SphereGeometry(0.21, 18, 14);
const HAIR_GEOMETRY = new THREE.SphereGeometry(0.225, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
const TORSO_GEOMETRY = new THREE.BoxGeometry(0.58, 0.62, 0.32);
const ARM_GEOMETRY = new THREE.BoxGeometry(0.17, 0.66, 0.17).translate(0, -0.33, 0);
const LEG_GEOMETRY = new THREE.BoxGeometry(0.21, 0.8, 0.23).translate(0, -0.4, 0);
const EYE_GEOMETRY = new THREE.SphereGeometry(0.035, 8, 6);
const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.42, 16);

export function buildHumanoid(look: HumanoidLook): Humanoid {
  const group = new THREE.Group();
  const scale = look.scale ?? 1;
  const outlineThickness = look.outline ?? 0.04;
  const materials: THREE.MeshToonMaterial[] = [];

  const mat = (c: THREE.ColorRepresentation, extra?: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number }) => {
    const m = toon(c, extra);
    materials.push(m);
    return m;
  };

  const skinMat = mat(look.skin);
  const topMat = mat(look.top);
  const bottomMat = mat(look.bottom);
  const hairMat = mat(look.hair);

  const shadow = new THREE.Mesh(
    SHADOW_GEOMETRY,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.name = 'blob-shadow';

  const legL = new THREE.Mesh(LEG_GEOMETRY, bottomMat);
  legL.position.set(-0.15, 0.8, 0);
  const legR = new THREE.Mesh(LEG_GEOMETRY, bottomMat);
  legR.position.set(0.15, 0.8, 0);

  const torso = new THREE.Mesh(TORSO_GEOMETRY, topMat);
  torso.position.set(0, 1.12, 0);

  const head = new THREE.Mesh(HEAD_GEOMETRY, skinMat);
  head.position.set(0, 1.66, 0);
  const hair = new THREE.Mesh(HAIR_GEOMETRY, hairMat);
  hair.position.set(0, 0.03, -0.02);
  head.add(hair);

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(look.eyes).multiplyScalar(look.eyeIntensity ?? 1.5),
    toneMapped: false,
  });
  const eyeL = new THREE.Mesh(EYE_GEOMETRY, eyeMaterial);
  eyeL.position.set(-0.075, 0.02, 0.185);
  const eyeR = new THREE.Mesh(EYE_GEOMETRY, eyeMaterial);
  eyeR.position.set(0.075, 0.02, 0.185);
  head.add(eyeL, eyeR);

  const armL = new THREE.Mesh(ARM_GEOMETRY, topMat);
  armL.position.set(-0.38, 1.4, 0);
  const armR = new THREE.Mesh(ARM_GEOMETRY, topMat);
  armR.position.set(0.38, 1.4, 0);

  const handL = new THREE.Object3D();
  handL.position.set(0, -0.7, 0);
  armL.add(handL);
  const handR = new THREE.Object3D();
  handR.position.set(0, -0.7, 0);
  armR.add(handR);

  [legL, legR, torso, head, armL, armR].forEach((m) => addOutline(m, outlineThickness));
  addOutline(hair, outlineThickness);

  group.add(shadow, legL, legR, torso, head, armL, armR);
  group.scale.setScalar(scale);

  return {
    group,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    handL,
    handR,
    eyeMaterial,
    materials,
    height: 1.9 * scale,
  };
}

/** Procedural locomotion: swings limbs by `phase`, scaled by how fast the body is moving. */
export function animateHumanoid(h: Humanoid, phase: number, moveAmount: number, time: number) {
  const swing = Math.sin(phase) * 0.75 * moveAmount;
  h.legL.rotation.x = swing;
  h.legR.rotation.x = -swing;
  h.armL.rotation.x = -swing * 0.8;
  const bob = Math.abs(Math.sin(phase)) * 0.05 * moveAmount;
  h.torso.position.y = 1.12 + bob + Math.sin(time * 2.2) * 0.008;
  h.head.position.y = 1.66 + bob + Math.sin(time * 2.2) * 0.008;
  h.armL.position.y = 1.4 + bob;
  h.armR.position.y = 1.4 + bob;
}

export function poseMelee(h: Humanoid, t: number) {
  const swing = Math.sin(t * Math.PI);
  h.armR.rotation.x = -0.15 - swing * 1.7;
  h.armR.rotation.z = swing * 0.55;
}

export function poseAim(h: Humanoid, pitch: number) {
  h.armR.rotation.x = -1.15 - pitch * 0.35;
  h.armR.rotation.z = 0.12;
}

export function setHumanoidOpacity(h: Humanoid, opacity: number) {
  const transparent = opacity < 0.999;
  h.materials.forEach((m) => {
    m.transparent = transparent;
    m.opacity = opacity;
    m.depthWrite = !transparent || opacity > 0.5;
  });
  h.eyeMaterial.transparent = transparent;
  h.eyeMaterial.opacity = opacity;
  h.group.traverse((o) => {
    if (o.name === 'outline') o.visible = opacity > 0.55;
  });
}

export function flashEmissive(h: Humanoid, color: THREE.ColorRepresentation, intensity: number) {
  h.materials.forEach((m) => {
    m.emissive.set(color);
    m.emissiveIntensity = intensity;
  });
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m !== OUTLINE_MATERIAL && m.dispose());
    } else if (material && material !== OUTLINE_MATERIAL) {
      material.dispose();
    }
  });
}
