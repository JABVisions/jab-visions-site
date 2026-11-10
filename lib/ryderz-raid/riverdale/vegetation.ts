import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARENA_TREE } from '../config';
import { adoptImportedMesh } from '../render/surfaces';
import { instanceCopies } from '../render/instancing';
import type { Obstacle } from '../world';
import { RIVERDALE, RIVERDALE_CACHES, RIVERDALE_HALF_X, RIVERDALE_HALF_Z, RIVERDALE_SPAWN, SIDE_TRAIL } from './config';
import { keep, placeMatrix, scatter, seededRandom, type BuildKit } from './kit';
import { leafCard } from './surfaces';
import { riverdaleGround, trailDistance, underStructure } from './terrain';

/**
 * An overgrown corner of a Bronx park: tall deciduous street trees, dense
 * shrubs, ferns, ivy and grass, fallen logs and branches, stumps and rocks.
 * Everything small is instanced and has no collision; tree trunks, stumps and
 * the larger rocks stop bodies.
 */

/** The street tree reduced to about 2,300 triangles. A whole forest of them stands here. */
const RIVERDALE_TREE_URL = '/assets/those-ryderz/models/arena-tree-lite.glb';

interface Spot {
  x: number;
  z: number;
}

function forestSpots(count: number, minGap: number, seed: number, accept: (x: number, z: number) => boolean) {
  const rand = seededRandom(seed);
  const spots: Spot[] = [];
  const limit = RIVERDALE.bounds - 1;
  for (let tries = 0; tries < count * 30 && spots.length < count; tries += 1) {
    const x = (rand() * 2 - 1) * limit;
    const z = -BACK_HILL + rand() * (limit + BACK_HILL);
    if (!accept(x, z)) continue;
    if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < minGap * minGap)) continue;
    spots.push({ x, z });
  }
  return spots;
}

const keepClear: Spot[] = [RIVERDALE_SPAWN, ...RIVERDALE_CACHES];

function clearOfLandmarks(x: number, z: number, r: number) {
  return keepClear.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r);
}

/** How far up the hill behind the back wall the woods are planted, for the view past the ends. */
const BACK_HILL = 42;

/** Open forest: outside the slab with a margin for the canopy, off the trails. */
function woods(x: number, z: number, trailGap: number, slabGap: number) {
  if (underStructure(x, z, slabGap)) return false;
  // The building above the slab reaches back into the hill.
  if (Math.abs(x) < RIVERDALE_HALF_X + 2 && z < -RIVERDALE_HALF_Z && z > -24) return false;
  return trailDistance(x, z) > trailGap;
}

/** Ground cover only where a fighter can stand, not on the unreachable hill. */
function reachable(x: number, z: number) {
  return z > -RIVERDALE_HALF_Z + 0.4;
}

function roughSphere(radius: number, detail: number, amount: number, seed: number) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const rand = seededRandom(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = 1 + (rand() - 0.5) * amount;
      cache.set(key, k);
    }
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A shrub as a puff of leaf cards around a centre. Normals point out from the
 * centre so the clump shades like one rounded mass instead of flat planes.
 */
function leafPuff(cards: number, seed: number) {
  const rand = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < cards; i += 1) {
    const card = new THREE.PlaneGeometry(1.25, 1.25);
    const dir = new THREE.Vector3(rand() - 0.5, rand() * 0.8 - 0.2, rand() - 0.5).normalize();
    card.lookAt(dir);
    card.rotateZ(rand() * Math.PI);
    card.translate(dir.x * 0.32, dir.y * 0.32, dir.z * 0.32);
    parts.push(card);
  }
  const geo = joinGeometries(parts);
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).add(new THREE.Vector3(0, 0.25, 0)).normalize();
    normal.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

function joinGeometries(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let offset = 0;
  for (const p of parts) {
    positions.push(...(p.attributes.position.array as Float32Array));
    normals.push(...(p.attributes.normal.array as Float32Array));
    uvs.push(...(p.attributes.uv.array as Float32Array));
    (p.index!.array as Uint16Array).forEach((i) => index.push(i + offset));
    offset += p.attributes.position.count;
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  return geo;
}

function crossedCard(width: number, height: number) {
  const a = new THREE.PlaneGeometry(width, height);
  a.translate(0, height / 2, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const c = a.clone().rotateY(Math.PI / 4);
  return joinGeometries([a, b, c]);
}

export function buildVegetation(kit: BuildKit, obstacles: Obstacle[], isDisposed: () => boolean) {
  const { group } = kit;
  const rand = seededRandom(5113);

  // --- Trees ----------------------------------------------------------------------------
  const treeSpots = forestSpots(78, 6.4, 77, (x, z) => woods(x, z, 2.6, 2.5) && clearOfLandmarks(x, z, 3) && Math.max(Math.abs(x), z) < RIVERDALE.bounds + 4);
  for (const t of treeSpots) obstacles.push({ kind: 'circle', x: t.x, z: t.z, r: 0.42 });
  const loader = new GLTFLoader();
  loader.load(
    RIVERDALE_TREE_URL,
    (gltf) => {
      if (isDisposed()) return;
      const fit = ARENA_TREE.height / ARENA_TREE.sourceHeight;
      const roots: THREE.Object3D[] = [];
      treeSpots.forEach((spot, i) => {
        const scene = gltf.scene.clone(true);
        const size = 1.55 + ((i * 37) % 11) * 0.07;
        scene.scale.setScalar(fit * size);
        const root = new THREE.Group();
        root.name = 'riverdale-tree';
        root.add(scene);
        root.position.set(spot.x, riverdaleGround(spot.x, spot.z) - 0.15, spot.z);
        root.rotation.y = i * 2.39;
        group.add(root);
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) adoptImportedMesh(mesh, 0.6);
        });
        roots.push(root);
      });
      instanceCopies(group, roots, 'riverdale-trees');
      roots.forEach((r) => r.removeFromParent());
    },
    undefined,
    (error) => console.warn('[raid] riverdale tree failed to load', error),
  );

  // --- Shrubs ---------------------------------------------------------------------------
  const shrub = leafCard('shrub');
  kit.textures.push(shrub);
  const bushMat = keep(kit, new THREE.MeshStandardMaterial({ map: shrub, color: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
  const bushGeo = leafPuff(9, 9);
  const bushSpots = forestSpots(620, 1.35, 91, (x, z) => woods(x, z, 1.7, 0.6) && clearOfLandmarks(x, z, 1.6));
  // Brush crowds the trail edges and hides the gap with the cache.
  for (const p of [...SIDE_TRAIL, { x: 24, z: 28.5 }, { x: 28, z: 26 }, { x: 25.5, z: 24.5 }]) {
    for (let k = 0; k < 3; k += 1) bushSpots.push({ x: p.x + (rand() - 0.5) * 7, z: p.z + (rand() - 0.5) * 7 });
  }
  const bushes = bushSpots
    .filter((s) => trailDistance(s.x, s.z) > 1.4 && clearOfLandmarks(s.x, s.z, 1.3))
    .map((s) => {
      const size = 0.7 + rand() * 1.0;
      return placeMatrix(s.x, riverdaleGround(s.x, s.z) + size * 0.35, s.z, rand() * 6.28, [size * (1 + rand() * 0.4), size * (0.7 + rand() * 0.4), size]);
    });
  const bushColors = bushes.map(() => new THREE.Color().setHSL(0.27 + rand() * 0.06, 0.35 + rand() * 0.2, 0.62 + rand() * 0.2));
  scatter(kit, bushGeo, bushMat, bushes, { shadow: true, colors: bushColors, name: 'riverdale-bushes' });

  // --- Distant canopy -----------------------------------------------------------------
  // Past the playable square the woods carry on as crossed canopy cards.
  const canopy = leafCard('canopy');
  kit.textures.push(canopy);
  const canopyMat = keep(kit, new THREE.MeshStandardMaterial({ map: canopy, color: 0xb8c8a0, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }));
  const far: THREE.Matrix4[] = [];
  for (let i = 0; i < 150; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = RIVERDALE.bounds + 6 + rand() * 34;
    const x = Math.cos(a) * r * 1.1;
    const z = Math.sin(a) * r;
    if (z < -BACK_HILL + 4 || (Math.abs(x) < RIVERDALE_HALF_X + 4 && z < 0)) continue;
    const k = 9 + rand() * 6;
    far.push(placeMatrix(x, riverdaleGround(x, z) - 0.5, z, rand() * 6.28, [k * 1.1, k, k * 1.1]));
  }
  scatter(kit, crossedCard(1, 1), canopyMat, far, { name: 'riverdale-far-canopy' });

  // --- Ferns, grass and ivy clumps -------------------------------------------------------
  const fern = leafCard('fern');
  const grass = leafCard('grass');
  const ivy = leafCard('ivy');
  kit.textures.push(fern, grass, ivy);
  const card = (map: THREE.Texture | null, color: number) =>
    keep(kit, new THREE.MeshStandardMaterial({ map, color, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }));
  const ground = (spots: Spot[], scale: [number, number]) =>
    spots.map((s) => {
      const k = scale[0] + rand() * (scale[1] - scale[0]);
      return placeMatrix(s.x, riverdaleGround(s.x, s.z) - 0.05, s.z, rand() * 6.28, k);
    });
  const fernSpots = forestSpots(700, 0.9, 101, (x, z) => reachable(x, z) && woods(x, z, 1.1, -1.5));
  scatter(kit, crossedCard(1.3, 0.9), card(fern, 0xc8dcb0), ground(fernSpots, [0.7, 1.3]), { name: 'riverdale-ferns' });
  const grassSpots = forestSpots(520, 0.8, 131, (x, z) => (reachable(x, z) && woods(x, z, 0.8, -3)) || (underStructure(x, z) && z > RIVERDALE_HALF_Z - 3));
  scatter(kit, crossedCard(0.9, 0.6), card(grass, 0xd0dca8), ground(grassSpots, [0.7, 1.2]), { name: 'riverdale-grass' });
  // Ground ivy spills under the slab at the open side and the ends.
  const ivySpots = forestSpots(420, 0.8, 151, (x, z) => {
    if (trailDistance(x, z) < 0.9) return false;
    const edge = z > RIVERDALE_HALF_Z - 4 || Math.abs(x) > RIVERDALE_HALF_X - 5;
    return edge && z > -RIVERDALE_HALF_Z + 2 && Math.abs(x) < RIVERDALE.clearing.halfX + 40 && !(Math.abs(x) < RIVERDALE.clearing.halfX && z < RIVERDALE_HALF_Z - 2);
  });
  const ivyFlat = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2).translate(0, 0.07, 0);
  scatter(kit, ivyFlat, card(ivy, 0xa8c890), ground(ivySpots, [0.8, 1.6]), { name: 'riverdale-ivy' });

  // --- Logs, branches, stumps and rocks -------------------------------------------------
  const barkMat = keep(kit, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }));
  const logGeo = new THREE.CylinderGeometry(1, 1, 1, 9).rotateZ(Math.PI / 2);
  const logs: THREE.Matrix4[] = [];
  forestSpots(26, 6, 171, (x, z) => reachable(x, z) && woods(x, z, 1.6, 1) && clearOfLandmarks(x, z, 2)).forEach((s) => {
    const r = 0.16 + rand() * 0.16;
    logs.push(placeMatrix(s.x, riverdaleGround(s.x, s.z) + r * 0.6, s.z, rand() * 6.28, [2 + rand() * 3.5, r, r], [0, (rand() - 0.5) * 0.12]));
  });
  scatter(kit, logGeo, barkMat, logs, { shadow: true, name: 'riverdale-logs' });
  const branchGeo = new THREE.CylinderGeometry(1, 0.6, 1, 5).rotateZ(Math.PI / 2);
  const branches: THREE.Matrix4[] = [];
  forestSpots(180, 1.2, 181, (x, z) => reachable(x, z) && (woods(x, z, 0.4, -2) || underStructure(x, z))).forEach((s) => {
    const r = 0.025 + rand() * 0.04;
    branches.push(placeMatrix(s.x, riverdaleGround(s.x, s.z) + r, s.z, rand() * 6.28, [0.8 + rand() * 1.8, r, r], [0, (rand() - 0.5) * 0.3]));
  });
  scatter(kit, branchGeo, barkMat, branches, { name: 'riverdale-branches' });

  const stumpGeo = new THREE.CylinderGeometry(0.38, 0.5, 0.7, 10);
  stumpGeo.translate(0, 0.3, 0);
  const stumps: THREE.Matrix4[] = [];
  const stumpSpots = forestSpots(16, 7, 191, (x, z) => reachable(x, z) && woods(x, z, 1.8, 1.5) && clearOfLandmarks(x, z, 2));
  const sideEnd = SIDE_TRAIL[SIDE_TRAIL.length - 1];
  stumpSpots.push({ x: sideEnd.x - 0.4, z: sideEnd.z - 1.6 });
  stumpSpots.forEach((s) => {
    const k = 0.8 + rand() * 0.5;
    stumps.push(placeMatrix(s.x, riverdaleGround(s.x, s.z) - 0.05, s.z, rand() * 6.28, [k, 0.6 + rand() * 0.8, k]));
    obstacles.push({ kind: 'circle', x: s.x, z: s.z, r: 0.42 * k });
  });
  scatter(kit, stumpGeo, barkMat, stumps, { shadow: true, name: 'riverdale-stumps' });

  const rockMat = keep(kit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }));
  const rockGeo = roughSphere(1, 0, 0.5, 211);
  const rocks: THREE.Matrix4[] = [];
  const rockColors: THREE.Color[] = [];
  forestSpots(110, 2, 221, (x, z) => reachable(x, z) && (woods(x, z, 1.2, -1) || underStructure(x, z)) && clearOfLandmarks(x, z, 1.5)).forEach((s, i) => {
    const big = i % 9 === 0 && trailDistance(s.x, s.z) > 3;
    const k = big ? 0.7 + rand() * 0.35 : 0.14 + rand() * 0.26;
    rocks.push(placeMatrix(s.x, riverdaleGround(s.x, s.z) + k * 0.15, s.z, rand() * 6.28, [k * 1.2, k * 0.7, k]));
    rockColors.push(new THREE.Color().setHSL(0.12, 0.04, 0.2 + rand() * 0.1));
    if (big) obstacles.push({ kind: 'circle', x: s.x, z: s.z, r: k * 1.05 });
  });
  scatter(kit, rockGeo, rockMat, rocks, { shadow: true, colors: rockColors, name: 'riverdale-rocks' });

  return { treeSpots };
}
