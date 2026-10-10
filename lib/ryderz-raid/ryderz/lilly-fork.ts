import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FORK_URL = '/assets/those-ryderz/models/lilly-pitchfork.glb?v=1';
const FORK_SCALE = 1.45;
const GREEN = 0x39f07a;
/**
 * The export shaft leans about 30 degrees and the tines sit at the low end.
 * This stands the head up and turns the flat of the fork toward +Z.
 */
const FORK_ALIGN = new THREE.Quaternion(-0.94714, 0.23552, -0.18102, 0.12117);
/** Butt hangs just under the hand. Head is up. */
const HAND_POS = new THREE.Vector3(0.206, 1.1615, 0.1842);
/** Shaft midpoint on the mount, so the head leads and the handle trails. */
const RIDE_POS = new THREE.Vector3(0.206, 0.6681, 0.1842);

const loader = new GLTFLoader();
let template: THREE.Object3D | null = null;
const byBody = new WeakMap<THREE.Object3D, LillyFork>();

export async function preloadLillyFork() {
  if (template) return;
  const gltf = await loader.loadAsync(FORK_URL);
  template = gltf.scene;
}

/**
 * One pitchfork. It moves between the right hand and a hip mount.
 * Never cloned per state: the same mesh is reparented.
 */
export class LillyFork {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Object3D;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private hand: THREE.Object3D | null = null;
  private readonly mount = new THREE.Object3D();
  private mode: 'hand' | 'ride' = 'hand';

  constructor(source: THREE.Object3D) {
    this.mesh = source.clone(true);
    this.mesh.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      const own = (material: THREE.Material) => {
        const copy = material.clone() as THREE.MeshStandardMaterial;
        copy.userData.retain = false;
        if (copy.emissive) {
          copy.emissive.setHex(0x000000);
          this.materials.push(copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    });
    this.root.name = 'LillyPitchfork';
    this.root.add(this.mesh);
    this.mount.name = 'ForkMount';
    this.poseMesh('hand');
  }

  /** Parent the mount to the body and start in the right hand. */
  attach(hand: THREE.Object3D, body: THREE.Object3D) {
    this.hand = hand;
    this.mount.position.set(0, 0.86, 0.08);
    body.add(this.mount);
    this.mode = 'ride';
    this.hold();
    byBody.set(body, this);
  }

  hold() {
    if (!this.hand || this.mode === 'hand') return;
    this.mode = 'hand';
    this.poseMesh('hand');
    this.hand.add(this.root);
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
  }

  ride() {
    if (this.mode === 'ride') return;
    this.mode = 'ride';
    this.poseMesh('ride');
    this.mount.add(this.root);
    // Shaft (model +Y, head up) turns to face forward. The body stays upright.
    this.root.rotation.set(-Math.PI / 2, 0, 0);
    this.root.position.set(0, 0, 0);
  }

  setShown(on: boolean) {
    this.root.visible = on;
  }

  setGlow(on: boolean) {
    for (const material of this.materials) {
      material.emissive.setHex(on ? GREEN : 0x000000);
      material.emissiveIntensity = on ? 0.55 : 0;
    }
  }

  /** Hand grip near the butt. Ride grip on the middle of the shaft. */
  private poseMesh(mode: 'hand' | 'ride') {
    this.mesh.quaternion.copy(FORK_ALIGN);
    this.mesh.scale.setScalar(FORK_SCALE);
    this.mesh.position.copy(mode === 'hand' ? HAND_POS : RIDE_POS);
  }
}

export function createLillyFork(): LillyFork | null {
  if (!template) return null;
  return new LillyFork(template);
}

export function forkOn(body: THREE.Object3D | null | undefined): LillyFork | null {
  if (!body) return null;
  return byBody.get(body) ?? null;
}
