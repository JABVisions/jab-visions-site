import * as THREE from 'three';
import type { EnemyKind, RyderSpec } from './config';
import { addOutline, buildHumanoid, glow, toon, type Humanoid } from './toon';

const BLADE = new THREE.BoxGeometry(0.08, 0.95, 0.08);
const SPIKE = new THREE.ConeGeometry(0.07, 0.28, 6);
const AXE_HANDLE = new THREE.CylinderGeometry(0.05, 0.06, 1.15, 8);
const AXE_HEAD = new THREE.BoxGeometry(0.08, 0.38, 0.55);
const ORB = new THREE.SphereGeometry(0.16, 12, 10);
const DART_GUN = new THREE.BoxGeometry(0.12, 0.12, 0.42);
const HALO = new THREE.TorusGeometry(0.55, 0.045, 8, 24);
const VEIN = new THREE.BoxGeometry(0.18, 0.42, 0.06);

const SKINS = [0xf3d2b5, 0xe0b48a, 0xc58c62, 0x8d5524, 0xf6e0c8, 0xb07a52];
const HAIR = [0x1a1210, 0x3b2416, 0x6b3a1f, 0x111111, 0xc8b48a, 0x4a2030];
const TOPS = [0x3a3a48, 0x5a2a2a, 0x2a3a5a, 0x3a4a32, 0x4a3a48, 0x22222c];
const BOTTOMS = [0x1c1c28, 0x243044, 0x2c241c, 0x1a2220];

export interface Fighter {
  humanoid: Humanoid;
  weapons: THREE.Object3D[];
  glowMeshes: THREE.Mesh[];
}

export function buildRyder(spec: RyderSpec, options: { clone?: boolean } = {}): Fighter {
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
      for (let i = 0; i < 3; i += 1) {
        const s = new THREE.Mesh(SPIKE, i === 0 ? aura : aura.clone());
        s.position.set((i - 1) * 0.08, -0.05, 0.08);
        s.rotation.x = Math.PI / 2;
        addWeapon(s, hand);
      }
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
    const orb = new THREE.Mesh(ORB, aura);
    orb.position.set(0, 0.05, 0.1);
    addWeapon(orb, 'R');
    const halo = new THREE.Mesh(HALO, aura.clone());
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.95;
    humanoid.group.add(halo);
    weapons.push(halo);
    glowMeshes.push(halo);
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

  return { humanoid, weapons, glowMeshes };
}

export function buildHost(kind: EnemyKind): Fighter {
  const scale = kind === 'broadcaster' ? 2.05 : kind === 'heavy' ? 1.42 : kind === 'sprinter' ? 0.9 : 1;
  const eye =
    kind === 'broadcaster' ? 0xb84dff : kind === 'sprinter' ? 0xb6ff3a : kind === 'heavy' ? 0xff7a1a : 0x5dff9a;
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

  if (kind === 'thrower') {
    const orb = new THREE.Mesh(ORB, glow(0x5dff9a, 1.4));
    orb.position.set(0, 0.02, 0.08);
    humanoid.handR.add(orb);
    weapons.push(orb);
    glowMeshes.push(orb);
  }

  return { humanoid, weapons, glowMeshes };
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
