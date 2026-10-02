import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (typeof FileReader === 'undefined') {
  class NodeFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((event: { target: NodeFileReader }) => void) | null = null;
    onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;

    #finish(result: string | ArrayBuffer) {
      this.result = result;
      const event = { target: this };
      this.onload?.(event);
      this.onloadend?.(event);
    }

    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          const bytes = Buffer.from(buffer);
          const type = blob.type || 'application/octet-stream';
          this.#finish(`data:${type};base64,${bytes.toString('base64')}`);
        })
        .catch((error) => this.onerror?.(error));
    }

    readAsArrayBuffer(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => this.#finish(buffer))
        .catch((error) => this.onerror?.(error));
    }
  }

  (globalThis as { FileReader?: typeof NodeFileReader }).FileReader = NodeFileReader;
}
import { buildRyder } from './characters';
import {
  RYDER_ORDER,
  RYDERZ,
  type RyderId,
} from './config';

function slugName(value: string) {
  return value.replace(/\s+/g, '');
}

function toStandard(material: THREE.Material): THREE.MeshStandardMaterial {
  if (material instanceof THREE.MeshStandardMaterial) return material;

  const standard = new THREE.MeshStandardMaterial({
    name: material.name || material.type,
    roughness: 0.68,
    metalness: 0.08,
  });

  if ('color' in material && material.color instanceof THREE.Color) {
    standard.color.copy(material.color);
  }
  if ('emissive' in material && material.emissive instanceof THREE.Color) {
    standard.emissive.copy(material.emissive);
    standard.emissiveIntensity =
      'emissiveIntensity' in material && typeof material.emissiveIntensity === 'number'
        ? material.emissiveIntensity
        : 1;
  } else if (material instanceof THREE.MeshBasicMaterial) {
    standard.emissive.copy(material.color);
    standard.emissiveIntensity = material.name === 'outline' ? 0 : 1.15;
    standard.roughness = 0.42;
  }
  if ('transparent' in material) standard.transparent = Boolean(material.transparent);
  if ('opacity' in material && typeof material.opacity === 'number') standard.opacity = material.opacity;
  if ('side' in material) standard.side = material.side;

  return standard;
}

function bakeExportMaterials(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const current = mesh.material;
    if (Array.isArray(current)) {
      mesh.material = current.map((item) => toStandard(item));
      return;
    }
    mesh.material = toStandard(current);
  });
}

function nameParts(id: RyderId, root: THREE.Object3D) {
  const spec = RYDERZ[id];
  root.name = slugName(spec.name);
  root.userData = {
    title: spec.title,
    flaw: spec.flaw,
    role: spec.role,
    weapon: spec.weapon,
    copyright: 'JAB Visions',
  };
  root.traverse((object) => {
    if (!object.name) {
      object.name = object.type;
    }
  });
}

export function buildRyderExportRoot(id: RyderId) {
  const spec = RYDERZ[id];
  const fighter = buildRyder(spec);
  const group = fighter.humanoid.group;
  group.getObjectByName('blob-shadow')?.removeFromParent();

  fighter.humanoid.head.name = 'Head';
  fighter.humanoid.torso.name = 'Torso';
  fighter.humanoid.armL.name = 'ArmL';
  fighter.humanoid.armR.name = 'ArmR';
  fighter.humanoid.legL.name = 'LegL';
  fighter.humanoid.legR.name = 'LegR';
  fighter.humanoid.handL.name = 'HandL';
  fighter.humanoid.handR.name = 'HandR';

  fighter.humanoid.armL.rotation.z = 0.32;
  fighter.humanoid.armR.rotation.z = -0.32;
  fighter.humanoid.armR.rotation.x = -0.42;

  fighter.weapons.forEach((weapon, index) => {
    if (!weapon.name || weapon.name === 'Group' || weapon.name === 'Mesh') {
      weapon.name = `${slugName(spec.weapon)}${index + 1}`;
    }
  });

  nameParts(id, group);
  bakeExportMaterials(group);
  return group;
}

async function toGlb(root: THREE.Object3D, extras: Record<string, string>) {
  const scene = new THREE.Scene();
  scene.name = extras.title || 'ThoseRyderz';
  scene.userData = extras;
  scene.add(root);

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    maxTextureSize: 256,
  });

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('GLTF exporter returned JSON instead of a GLB buffer');
  }
  return result;
}

export async function exportRyderGlb(id: RyderId): Promise<ArrayBuffer> {
  const spec = RYDERZ[id];
  return toGlb(buildRyderExportRoot(id), {
    title: spec.name,
    generator: 'Those Ryderz: Raid',
    copyright: 'JAB Visions',
  });
}

export async function exportAllRyderzGlb(): Promise<ArrayBuffer> {
  const pack = new THREE.Group();
  pack.name = 'ThoseRyderz';
  RYDER_ORDER.forEach((id, index) => {
    const figure = buildRyderExportRoot(id);
    figure.position.x = (index - (RYDER_ORDER.length - 1) / 2) * 1.7;
    pack.add(figure);
  });
  return toGlb(pack, {
    title: 'Those Ryderz',
    generator: 'Those Ryderz: Raid',
    copyright: 'JAB Visions',
  });
}
