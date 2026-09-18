import * as THREE from 'three';
import { ARENA_HALF } from './config';
import { addOutline, glow, toon } from './toon';

export type Obstacle =
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { kind: 'circle'; x: number; z: number; r: number };

export interface World {
  group: THREE.Group;
  obstacles: Obstacle[];
  occluders: THREE.Object3D[];
  alleys: { position: THREE.Vector3; inward: THREE.Vector3 }[];
  spireRing: THREE.Mesh;
  alleyNodes: THREE.Mesh[];
  animate: (time: number) => void;
  dispose: () => void;
}

const BUILDING_DEPTH = 9;
const ALLEY_WIDTH = 5.2;

function makeFacadeTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const palette = ['#2a2136', '#1f2434', '#332430', '#26302b'];
  ctx.fillStyle = palette[seed % palette.length];
  ctx.fillRect(0, 0, 256, 512);
  let rand = seed * 9301 + 49297;
  const next = () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280;
  };
  const cols = 5;
  const rows = 12;
  const w = 256 / cols;
  const h = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = next() > 0.62;
      ctx.fillStyle = lit ? (next() > 0.5 ? '#ffd27a' : '#8ff5c4') : 'rgba(6, 4, 12, 0.9)';
      ctx.fillRect(c * w + w * 0.22, r * h + h * 0.2, w * 0.56, h * 0.55);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#2b2634';
  ctx.fillRect(0, 0, 1024, 1024);
  const tile = 64;
  for (let y = 0; y < 1024; y += tile) {
    for (let x = 0; x < 1024; x += tile) {
      const shade = ((x / tile + y / tile) % 2 === 0 ? 0 : 6) + Math.floor(Math.random() * 5);
      ctx.fillStyle = `rgb(${46 + shade}, ${40 + shade}, ${58 + shade})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }
  ctx.strokeStyle = 'rgba(120, 255, 190, 0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(512, 512, 200, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(512, 512, 340, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  outline = 0.06,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  addOutline(mesh, outline);
  return mesh;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(260, 24, 16);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  const top = new THREE.Color(0x06030f);
  const mid = new THREE.Color(0x2a1446);
  const bottom = new THREE.Color(0x4a1d4f);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 260;
    if (y > 0) color.lerpColors(mid, top, Math.min(1, y / 0.7));
    else color.lerpColors(mid, bottom, Math.min(1, -y / 0.3));
    colors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
}

export function buildWorld(): World {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const occluders: THREE.Object3D[] = [];
  const alleys: World['alleys'] = [];
  const alleyNodes: THREE.Mesh[] = [];
  const textures: THREE.Texture[] = [];

  group.add(makeSky());

  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), glow(0x9dffc9, 0.9));
  moon.position.set(-90, 95, -150);
  group.add(moon);

  const groundTex = makeGroundTexture();
  if (groundTex) textures.push(groundTex);
  const groundMat = toon(0xffffff, { map: groundTex });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry((ARENA_HALF + BUILDING_DEPTH + 6) * 2, (ARENA_HALF + BUILDING_DEPTH + 6) * 2),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  group.add(ground);
  occluders.push(ground);

  const facades = [0, 1, 2, 3].map((s) => makeFacadeTexture(s));
  facades.forEach((t) => t && textures.push(t));
  const buildingMat = (i: number) => toon(0xffffff, { map: facades[i % facades.length] });

  const sides: { axis: 'x' | 'z'; sign: 1 | -1; gaps: number[] }[] = [
    { axis: 'z', sign: -1, gaps: [-13, 12] },
    { axis: 'x', sign: 1, gaps: [-9, 13] },
    { axis: 'z', sign: 1, gaps: [0] },
    { axis: 'x', sign: -1, gaps: [-14, 7] },
  ];

  let facadeIndex = 0;
  sides.forEach((side) => {
    const edges = [-ARENA_HALF, ...side.gaps.flatMap((g) => [g - ALLEY_WIDTH / 2, g + ALLEY_WIDTH / 2]), ARENA_HALF];
    for (let i = 0; i < edges.length; i += 2) {
      const start = edges[i];
      const end = edges[i + 1];
      const length = end - start;
      if (length <= 0.5) continue;
      const segments = Math.max(1, Math.round(length / 11));
      const segLength = length / segments;
      for (let s = 0; s < segments; s += 1) {
        const a = start + s * segLength;
        const center = a + segLength / 2;
        const height = 11 + ((facadeIndex * 7) % 13) + (s % 2) * 4;
        const offset = side.sign * (ARENA_HALF + BUILDING_DEPTH / 2);
        const w = side.axis === 'z' ? segLength - 0.3 : BUILDING_DEPTH;
        const d = side.axis === 'z' ? BUILDING_DEPTH : segLength - 0.3;
        const x = side.axis === 'z' ? center : offset;
        const z = side.axis === 'z' ? offset : center;
        const b = box(w, height, d, buildingMat(facadeIndex), x, height / 2, z, 0.1);
        group.add(b);
        occluders.push(b);
        obstacles.push({ kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        facadeIndex += 1;
      }
    }

    side.gaps.forEach((g) => {
      const outward = side.sign * (ARENA_HALF + 4.5);
      const position =
        side.axis === 'z' ? new THREE.Vector3(g, 0, outward) : new THREE.Vector3(outward, 0, g);
      const inward = position.clone().multiplyScalar(-1).setY(0).normalize();
      alleys.push({ position, inward });

      const nodeY = 4.2;
      const nodePos =
        side.axis === 'z'
          ? new THREE.Vector3(g, nodeY, side.sign * ARENA_HALF)
          : new THREE.Vector3(side.sign * ARENA_HALF, nodeY, g);
      const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), glow(0x6dff9e, 1.6));
      node.position.copy(nodePos);
      group.add(node);
      alleyNodes.push(node);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.14, 8, 28), glow(0x36c56e, 1.1));
      arch.position.copy(nodePos).setY(0.6);
      if (side.axis === 'x') arch.rotation.y = Math.PI / 2;
      group.add(arch);
    });
  });

  const cornerHeights = [22, 17, 26, 19];
  [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].forEach(([sx, sz], i) => {
    const size = BUILDING_DEPTH;
    const x = sx * (ARENA_HALF + size / 2);
    const z = sz * (ARENA_HALF + size / 2);
    const h = cornerHeights[i];
    const b = box(size, h, size, buildingMat(i + 2), x, h / 2, z, 0.1);
    group.add(b);
    occluders.push(b);
    obstacles.push({
      kind: 'box',
      minX: x - size / 2,
      maxX: x + size / 2,
      minZ: z - size / 2,
      maxZ: z + size / 2,
    });
  });

  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 1.1, 24), toon(0x3a3350));
  spireBase.position.y = 0.55;
  addOutline(spireBase, 0.07);
  const spire = box(1.1, 8.5, 1.1, toon(0x1d1828), 0, 1.1 + 4.25, 0, 0.07);
  const spireRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), glow(0x6dff9e, 1.8));
  spireRing.position.y = 9.2;
  spireRing.rotation.x = Math.PI / 2;
  const spireTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glow(0x9dffc9, 2.4));
  spireTip.position.y = 10.6;
  group.add(spireBase, spire, spireRing, spireTip);
  occluders.push(spireBase, spire);
  obstacles.push({ kind: 'circle', x: 0, z: 0, r: 2.7 });

  const carColors = [0xd94a3d, 0x3c7bd9, 0xe0c341, 0xf2f2f2, 0x2f9e6d, 0xd97e3d];
  const cars: { x: number; z: number; rot: number }[] = [
    { x: -14, z: -6, rot: 0 },
    { x: 15, z: -12, rot: Math.PI / 2 },
    { x: 12, z: 14, rot: 0 },
    { x: -17, z: 12, rot: Math.PI / 2 },
    { x: 4, z: -19, rot: 0.25 },
    { x: -5, z: 20, rot: -0.2 },
  ];
  cars.forEach((c, i) => {
    const car = new THREE.Group();
    const bodyMat = toon(carColors[i % carColors.length]);
    const body = box(4.2, 1, 1.9, bodyMat, 0, 0.75, 0, 0.05);
    const cabin = box(2.1, 0.75, 1.7, toon(0x141420), -0.2, 1.62, 0, 0.05);
    car.add(body, cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    const wheelMat = toon(0x0d0d14);
    [
      [-1.4, 0.95],
      [1.4, 0.95],
      [-1.4, -0.95],
      [1.4, -0.95],
    ].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      addOutline(wheel, 0.04);
      car.add(wheel);
    });
    car.position.set(c.x, 0, c.z);
    car.rotation.y = c.rot;
    group.add(car);
    occluders.push(body, cabin);
    const halfW = Math.abs(Math.cos(c.rot)) * 2.1 + Math.abs(Math.sin(c.rot)) * 0.95;
    const halfD = Math.abs(Math.sin(c.rot)) * 2.1 + Math.abs(Math.cos(c.rot)) * 0.95;
    obstacles.push({ kind: 'box', minX: c.x - halfW, maxX: c.x + halfW, minZ: c.z - halfD, maxZ: c.z + halfD });
  });

  const planters = [
    [-8, -12],
    [9, -6],
    [-10, 8],
    [7, 8],
    [20, 3],
    [-22, -3],
    [0, -26],
    [-24, 22],
    [22, -22],
  ];
  planters.forEach(([x, z]) => {
    const base = box(1.8, 0.9, 1.8, toon(0x4b4360), x, 0.45, z, 0.05);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), toon(0x2f8a4f));
    bush.position.set(x, 1.35, z);
    addOutline(bush, 0.05);
    group.add(base, bush);
    occluders.push(base);
    obstacles.push({ kind: 'box', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9 });
  });

  const lampPositions = [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
    [0, -12],
    [0, 12],
    [-12, 0],
    [12, 0],
  ];
  const lampMat = toon(0x22202c);
  lampPositions.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), lampMat);
    pole.position.set(x, 2.6, z);
    addOutline(pole, 0.03);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), glow(0xffd28a, 1.5));
    head.position.set(x, 5.3, z);
    group.add(pole, head);
    if (i < 4) {
      const light = new THREE.PointLight(0xffc478, 26, 24, 2);
      light.position.set(x, 5.1, z);
      group.add(light);
    }
    obstacles.push({ kind: 'circle', x, z, r: 0.25 });
  });

  const animate = (time: number) => {
    const pulse = 1 + Math.sin(time * 3) * 0.12;
    spireRing.scale.setScalar(pulse);
    spireRing.rotation.z = time * 0.6;
    spireTip.rotation.y = time * 1.4;
    alleyNodes.forEach((n, i) => {
      n.rotation.y = time * 1.2 + i;
      n.rotation.x = time * 0.7;
      n.position.y = 4.2 + Math.sin(time * 2 + i * 1.3) * 0.25;
    });
  };

  const dispose = () => {
    textures.forEach((t) => t.dispose());
  };

  return { group, obstacles, occluders, alleys, spireRing, alleyNodes, animate, dispose };
}

const closest = new THREE.Vector2();

/** Push a circle (x,z,r) out of every obstacle it overlaps. Mutates `pos`. */
export function resolveCircle(pos: THREE.Vector3, radius: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    if (o.kind === 'box') {
      closest.set(Math.max(o.minX, Math.min(pos.x, o.maxX)), Math.max(o.minZ, Math.min(pos.z, o.maxZ)));
      let dx = pos.x - closest.x;
      let dz = pos.z - closest.y;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      if (distSq < 1e-8) {
        const left = pos.x - o.minX;
        const right = o.maxX - pos.x;
        const near = pos.z - o.minZ;
        const far = o.maxZ - pos.z;
        const min = Math.min(left, right, near, far);
        if (min === left) pos.x = o.minX - radius;
        else if (min === right) pos.x = o.maxX + radius;
        else if (min === near) pos.z = o.minZ - radius;
        else pos.z = o.maxZ + radius;
        continue;
      }
      const dist = Math.sqrt(distSq);
      dx /= dist;
      dz /= dist;
      pos.x = closest.x + dx * radius;
      pos.z = closest.y + dz * radius;
    } else {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const minDist = o.r + radius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq) || 0.0001;
      pos.x = o.x + (dx / dist) * minDist;
      pos.z = o.z + (dz / dist) * minDist;
    }
  }
}

export function pointBlocked(x: number, z: number, radius: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    if (o.kind === 'box') {
      const cx = Math.max(o.minX, Math.min(x, o.maxX));
      const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    } else {
      const dx = x - o.x;
      const dz = z - o.z;
      const m = o.r + radius;
      if (dx * dx + dz * dz < m * m) return true;
    }
  }
  return false;
}
