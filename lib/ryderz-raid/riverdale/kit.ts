import * as THREE from 'three';

/** Shared bookkeeping for the Riverdale builders: what to dispose and what the camera treats as solid. */
export interface BuildKit {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: (THREE.Texture | null)[];
  occluders: THREE.Object3D[];
}

export function createKit(group: THREE.Group): BuildKit {
  return { group, geometries: [], materials: [], textures: [], occluders: [] };
}

export function keep<T extends THREE.Material>(kit: BuildKit, material: T) {
  kit.materials.push(material);
  return material;
}

export function keepGeo<T extends THREE.BufferGeometry>(kit: BuildKit, geometry: T) {
  kit.geometries.push(geometry);
  return geometry;
}

/** A box stretched between two points: a steel channel, a cable tray, a branch. */
export function beamGeometry(a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geo = new THREE.BoxGeometry(width, depth, length);
  const look = new THREE.Matrix4().lookAt(a, b, Math.abs(dir.y) > length * 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  const m = new THREE.Matrix4().makeTranslation(0, 0, -length / 2);
  geo.applyMatrix4(m);
  geo.applyMatrix4(look);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** Instanced copies of one geometry from a list of matrices. */
export function scatter(
  kit: BuildKit,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  options: { shadow?: boolean; receive?: boolean; colors?: THREE.Color[]; name?: string } = {},
) {
  const mesh = new THREE.InstancedMesh(keepGeo(kit, geometry), material, Math.max(1, matrices.length));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (options.colors) options.colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.count = matrices.length;
  mesh.castShadow = Boolean(options.shadow);
  mesh.receiveShadow = options.receive ?? true;
  mesh.name = options.name ?? 'riverdale-scatter';
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  kit.group.add(mesh);
  return mesh;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function placeMatrix(x: number, y: number, z: number, yaw = 0, scale: number | [number, number, number] = 1, tilt: [number, number] = [0, 0]) {
  _e.set(tilt[0], yaw, tilt[1]);
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
  else _s.setScalar(scale);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
