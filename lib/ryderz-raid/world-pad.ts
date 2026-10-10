import * as THREE from 'three';
import type { Obstacle, World } from './world';

/**
 * Training P.A.D. — a circular facility on its own world, built the first time
 * the arena is selected so the city block does not load it.
 *
 * Walkable height is a single surface: the chamber floor, three stair ramps,
 * and a balcony ring. Nothing stacks a floor on top of another walkable cell,
 * which is what the raid's height field can carry.
 */

const FLOOR = 4.4;
const CORE_R = 2.35;
const STAIR_HALF = 2.15;

interface Barrier {
  obstacle: Obstacle;
  mesh: THREE.Object3D;
}

function canvasFloor() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#141b24';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#2c9eb8';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.beginPath();
  ctx.arc(128, 128, 90, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#d7f4ff';
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(128, 128, 30 + i * 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function metal(color: number, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.72,
    roughness: 0.38,
  });
}

function holo(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** 0 on the chamber floor, rising through the stairs, FLOOR on the balcony. */
export function padHeight(x: number, z: number) {
  if (x >= -17.4 && x <= -12.1 && Math.abs(z) <= STAIR_HALF) {
    const t = THREE.MathUtils.clamp((-12.1 - x) / 5.3, 0, 1);
    return t * FLOOR;
  }
  if (z >= 12.1 && z <= 17.4 && Math.abs(x) <= STAIR_HALF) {
    const t = THREE.MathUtils.clamp((z - 12.1) / 5.3, 0, 1);
    return t * FLOOR;
  }
  if (z <= -12.1 && z >= -17.4 && Math.abs(x) <= STAIR_HALF) {
    const t = THREE.MathUtils.clamp((-12.1 - z) / 5.3, 0, 1);
    return t * FLOOR;
  }
  const r = Math.hypot(x, z);
  if (r >= 16.15 && r <= 23.35 && Math.abs(Math.atan2(z, x)) > 0.62) return FLOOR;
  return 0;
}

function addBox(
  group: THREE.Group,
  obstacles: Obstacle[],
  occluders: THREE.Object3D[],
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  block = true,
  occlude = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  if (block) {
    obstacles.push({ kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  if (occlude) occluders.push(mesh);
  return mesh;
}

function stairRun(group: THREE.Group, material: THREE.Material, axis: 'x' | 'z', sign: 1 | -1) {
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const along = 12.35 + t * 4.7;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.62 : 4.1, 0.18, axis === 'z' ? 0.62 : 4.1), material);
    const pos = sign * along;
    mesh.position.set(axis === 'x' ? pos : 0, t * FLOOR - 0.05, axis === 'z' ? pos : 0);
    group.add(mesh);
  }
}

export function buildPadWorld(): World {
  const group = new THREE.Group();
  group.name = 'TrainingPAD';
  const obstacles: Obstacle[] = [];
  const occluders: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];
  const pulse: THREE.Material[] = [];

  const floorMap = canvasFloor();
  if (floorMap) textures.push(floorMap);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a222c,
    map: floorMap,
    metalness: 0.64,
    roughness: 0.42,
    emissive: 0x062028,
    emissiveIntensity: 0.4,
  });
  const wallMat = metal(0x2a3542, 0x12343f, 0.18);
  const trimMat = metal(0x8fdfff, 0x39e7ff, 0.85);
  const darkMat = metal(0x10151c, 0x1a1030, 0.15);
  const glass = holo(0x9aefff, 0.16);
  const barrierMat = holo(0x67f0ff, 0.42);
  pulse.push(glass, barrierMat);

  const chamber = new THREE.Mesh(new THREE.CircleGeometry(15.5, 48), floorMat);
  chamber.rotation.x = -Math.PI / 2;
  chamber.position.y = 0.02;
  group.add(chamber);

  const balcony = new THREE.Mesh(new THREE.RingGeometry(16.2, 23.2, 48), floorMat);
  balcony.rotation.x = -Math.PI / 2;
  balcony.position.y = FLOOR + 0.02;
  group.add(balcony);

  const corridor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.08, 6.2), floorMat);
  corridor.position.set(30, 0.02, 0);
  group.add(corridor);

  stairRun(group, trimMat, 'x', -1);
  stairRun(group, trimMat, 'z', 1);
  stairRun(group, trimMat, 'z', -1);

  obstacles.push({ kind: 'circle', x: 0, z: 0, r: CORE_R });
  const core = new THREE.Group();
  const coreOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), holo(0xf4fbff, 0.85));
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.06, 8, 32), trimMat);
  coreRing.rotation.x = Math.PI / 2;
  const coreRingB = coreRing.clone();
  coreRingB.rotation.x = 0.4;
  core.add(coreOrb, coreRing, coreRingB);
  core.position.y = 1.7;
  group.add(core);

  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.34) continue;
    const x = Math.cos(a) * 26.2;
    const z = Math.sin(a) * 26.2;
    addBox(group, obstacles, occluders, wallMat, x, 2.6, z, 3.2, 5.2, 1.15, true, true);
    addBox(group, obstacles, occluders, trimMat, x, 4.8, z, 3.2, 0.12, 1.2, false, false);
  }

  const railMat = metal(0x41515c, 0x39e7ff, 0.25);
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const ang = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(ang) < 0.7) continue;
    const nearStair =
      (Math.abs(ang - Math.PI) < 0.28 || Math.abs(ang - Math.PI / 2) < 0.28 || Math.abs(ang + Math.PI / 2) < 0.28);
    if (nearStair) continue;
    const x = Math.cos(a) * 16.55;
    const z = Math.sin(a) * 16.55;
    addBox(group, obstacles, occluders, railMat, x, FLOOR + 0.55, z, 1.3, 1.05, 0.16, true, false);
  }

  addBox(group, obstacles, occluders, darkMat, 38, 2.4, -7.2, 16, 4.8, 0.4, true, true);
  addBox(group, obstacles, occluders, darkMat, 38, 2.4, 7.2, 16, 4.8, 0.4, true, true);
  addBox(group, obstacles, occluders, darkMat, 46, 2.4, 0, 0.4, 4.8, 14, true, true);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 8, 1, true), holo(0xb388ff, 0.35));
  cage.position.set(38, 1.7, 0);
  group.add(cage);
  obstacles.push({ kind: 'circle', x: 38, z: 0, r: 1.45 });
  pulse.push(cage.material as THREE.Material);

  const screenMat = holo(0xd7f6ff, 0.8);
  pulse.push(screenMat);
  for (const spot of [
    { x: 7.2, z: -6.2 },
    { x: -6.4, z: 7.4 },
    { x: 34, z: 3.2 },
  ]) {
    addBox(group, obstacles, occluders, wallMat, spot.x, 0.85, spot.z, 1.4, 1.1, 0.7, true, false);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.62), screenMat);
    screen.position.set(spot.x, 1.15, spot.z + 0.36);
    group.add(screen);
  }

  const roomMat = glass;
  for (const spot of [
    { x: -18, z: 8 },
    { x: -18, z: -8 },
  ]) {
    const room = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.4), roomMat);
    room.position.set(spot.x, FLOOR + 1.3, spot.z);
    group.add(room);
    addBox(group, obstacles, occluders, trimMat, spot.x - 1.9, FLOOR + 1.2, spot.z, 0.12, 2.2, 3.2, true, false);
    addBox(group, obstacles, occluders, trimMat, spot.x + 1.9, FLOOR + 1.2, spot.z, 0.12, 2.2, 3.2, true, false);
  }

  const barriers: Barrier[] = [];
  for (const spot of [
    { x: 4.2, z: 3.4, w: 3.2, d: 0.18 },
    { x: -3.6, z: -4.2, w: 0.18, d: 3.4 },
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spot.w, 2.2, spot.d), barrierMat);
    mesh.position.set(spot.x, 1.2, spot.z);
    group.add(mesh);
    const obstacle: Obstacle = {
      kind: 'box',
      minX: spot.x - spot.w / 2,
      maxX: spot.x + spot.w / 2,
      minZ: spot.z - spot.d / 2,
      maxZ: spot.z + spot.d / 2,
    };
    obstacles.push(obstacle);
    barriers.push({ obstacle, mesh });
  }

  const postGeo = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  const posts = new THREE.InstancedMesh(postGeo, railMat, 18);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 22.4, FLOOR + 0.55, Math.sin(a) * 22.4);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  group.add(posts);

  const drones: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const drone = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), holo(0xf7fdff, 0.9));
    group.add(drone);
    drones.push(drone);
    pulse.push(drone.material as THREE.Material);
  }

  const alleys = [
    { position: new THREE.Vector3(-8, 0, 9), inward: new THREE.Vector3(0.6, 0, -0.8).normalize() },
    { position: new THREE.Vector3(9, 0, -7), inward: new THREE.Vector3(-0.8, 0, 0.6).normalize() },
    { position: new THREE.Vector3(0, 0, -10), inward: new THREE.Vector3(0, 0, 1) },
    { position: new THREE.Vector3(24, 0, 0), inward: new THREE.Vector3(-1, 0, 0) },
  ];

  let barriersUp = true;
  const toggleBarriers = () => {
    barriersUp = !barriersUp;
    for (const barrier of barriers) {
      barrier.mesh.visible = barriersUp;
      const index = obstacles.indexOf(barrier.obstacle);
      if (barriersUp && index < 0) obstacles.push(barrier.obstacle);
      if (!barriersUp && index >= 0) obstacles.splice(index, 1);
    }
    return !barriersUp;
  };

  return {
    group,
    obstacles,
    occluders,
    alleys,
    alleyNodes: [],
    training: true,
    interactives: [{ kind: 'sim', x: 7.2, z: -4.6 }],
    toggleBarriers,
    heightAt: padHeight,
    animate: (time) => {
      core.rotation.y = time * 0.35;
      coreRing.rotation.z = time * 0.8;
      core.position.y = 1.7 + Math.sin(time * 1.4) * 0.12;
      const glowPulse = 0.28 + Math.sin(time * 2.2) * 0.1;
      for (const material of pulse) {
        if ('opacity' in material) material.opacity = material === barrierMat ? (barriersUp ? 0.34 + glowPulse * 0.3 : 0.15) : glowPulse + 0.2;
      }
      drones.forEach((drone, i) => {
        const a = time * 0.45 + i * 2.1;
        drone.position.set(Math.cos(a) * (6 + i), 2.4 + Math.sin(time * 2 + i) * 0.35, Math.sin(a) * (6 + i));
        drone.rotation.y = time;
      });
    },
    dispose: () => {
      textures.forEach((texture) => texture.dispose());
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}
