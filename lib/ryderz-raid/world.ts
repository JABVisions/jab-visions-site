import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARENA_BUILDINGS, ARENA_HALF, CAR_MODELS } from './config';
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
  /** Walkable surface height at a point (roads are 0, sidewalks sit on a curb). */
  heightAt: (x: number, z: number) => number;
  animate: (time: number) => void;
  dispose: () => void;
}

/*
 * Arena layout (metres, +X east, +Z south):
 *
 *   - A north–south avenue, |x| < AVENUE_HALF, runs the full length of the block.
 *   - An east–west cross street, |z| < STREET_HALF.
 *   - They meet in a circular plaza of radius PLAZA_R around the signal spire.
 *   - Everything else is raised sidewalk (CURB high) up to the building line
 *     at ARENA_HALF, where the perimeter buildings stand.
 *   - The four quadrant blocks are dressed differently: a mid-block storefront
 *     with an alley (+x,+z), a surface parking lot (-x,-z), a pocket park
 *     (-x,+z) and an open storefront corner (+x,-z).
 *   - Perimeter lots and the corners use the textured street buildings.
 */
const BUILDING_DEPTH = 9;
const AVENUE_HALF = 8;
const STREET_HALF = 7;
const PLAZA_R = 12;
const CURB = 0.14;
const PARKING_LANE = 2.4;
const GROUND_HALF = ARENA_HALF + BUILDING_DEPTH + 6;
const CAR_LENGTH = 4.5;

interface AlleyGap {
  at: number;
  width: number;
}

// Spawn gaps between the perimeter buildings. Road-aligned gaps are street
// width so the avenue and cross street visibly continue out of the block.
const SIDES: { axis: 'x' | 'z'; sign: 1 | -1; gaps: AlleyGap[] }[] = [
  { axis: 'z', sign: -1, gaps: [{ at: 0, width: AVENUE_HALF * 2 }, { at: 18, width: 5.2 }] },
  { axis: 'x', sign: 1, gaps: [{ at: 0, width: STREET_HALF * 2 }, { at: -16, width: 5.2 }] },
  { axis: 'z', sign: 1, gaps: [{ at: 0, width: AVENUE_HALF * 2 }, { at: -18, width: 5.2 }] },
  { axis: 'x', sign: -1, gaps: [{ at: 0, width: STREET_HALF * 2 }, { at: 16, width: 5.2 }] },
];

export function groundHeight(x: number, z: number) {
  if (x * x + z * z < PLAZA_R * PLAZA_R) return 0;
  if (Math.abs(x) < AVENUE_HALF || Math.abs(z) < STREET_HALF) return 0;
  return CURB;
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function seededRandom(seed: number) {
  let rand = seed * 9301 + 49297;
  return () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280;
  };
}

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, rgb: [number, number, number], spread: number, next: () => number) {
  for (let i = 0; i < count; i += 1) {
    const d = Math.floor((next() - 0.5) * spread);
    ctx.fillStyle = `rgb(${rgb[0] + d}, ${rgb[1] + d}, ${rgb[2] + d})`;
    ctx.fillRect(next() * size, next() * size, 1 + next() * 2, 1 + next() * 2);
  }
}

/** Worn asphalt: dark blue-grey with grain, patches and a few hairline cracks. One tile ≈ 6 m. */
function makeAsphaltTexture() {
  return canvasTexture(512, (ctx, size) => {
    const next = seededRandom(11);
    ctx.fillStyle = '#2a2a33';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9; i += 1) {
      ctx.fillStyle = `rgba(${18 + next() * 10}, ${18 + next() * 10}, ${26 + next() * 10}, ${0.25 + next() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(next() * size, next() * size, 40 + next() * 90, 25 + next() * 60, next() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, size, 2600, [46, 46, 56], 26, next);
    ctx.strokeStyle = 'rgba(12, 12, 18, 0.7)';
    ctx.lineWidth = 1.5;
    for (let c = 0; c < 4; c += 1) {
      let x = next() * size;
      let y = next() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s += 1) {
        x += (next() - 0.5) * 70;
        y += (next() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Concrete sidewalk panels with expansion joints. One tile = 3 m = 2 × 2 panels. */
function makeSidewalkTexture() {
  return canvasTexture(512, (ctx, size) => {
    const next = seededRandom(23);
    ctx.fillStyle = '#6d6a78';
    ctx.fillRect(0, 0, size, size);
    const panel = size / 2;
    for (let py = 0; py < 2; py += 1) {
      for (let px = 0; px < 2; px += 1) {
        const d = Math.floor((next() - 0.5) * 10);
        ctx.fillStyle = `rgb(${109 + d}, ${106 + d}, ${120 + d})`;
        ctx.fillRect(px * panel + 3, py * panel + 3, panel - 6, panel - 6);
      }
    }
    speckle(ctx, size, 1800, [118, 114, 128], 30, next);
    ctx.strokeStyle = 'rgba(40, 36, 50, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(panel, 0);
    ctx.lineTo(panel, size);
    ctx.moveTo(0, panel);
    ctx.lineTo(size, panel);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40, 36, 50, 0.9)';
    ctx.strokeRect(2, 2, size - 4, size - 4);
  });
}

/** Plaza paving: two-tone square setts with the Ryderz signal rings painted on. Mapped once across the plaza disc. */
function makePlazaTexture() {
  return canvasTexture(1024, (ctx, size) => {
    const next = seededRandom(5);
    const tile = size / 24;
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const alt = (x + y) % 2 === 0;
        const d = Math.floor((next() - 0.5) * 8);
        ctx.fillStyle = alt ? `rgb(${88 + d}, ${78 + d}, ${104 + d})` : `rgb(${74 + d}, ${66 + d}, ${90 + d})`;
        ctx.fillRect(x * tile, y * tile, tile, tile);
        ctx.strokeStyle = 'rgba(30, 24, 40, 0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
      }
    }
    ctx.strokeStyle = 'rgba(120, 255, 190, 0.42)';
    ctx.lineWidth = 10;
    [0.33, 0.66, 0.95].forEach((f) => {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, (size / 2) * f, 0, Math.PI * 2);
      ctx.stroke();
    });
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, outline = 0.06) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  addOutline(mesh, outline);
  return mesh;
}

/** Flat decal lying on the ground (markings, grates). Lifted a hair and offset to avoid z-fighting. */
function decalMaterial(color: THREE.ColorRepresentation, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
}

function stripe(parent: THREE.Object3D, x: number, z: number, w: number, d: number, material: THREE.Material, y = 0.02) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function dashedLine(parent: THREE.Object3D, axis: 'x' | 'z', at: number, from: number, to: number, material: THREE.Material, dash = 3, gap = 3, width = 0.14) {
  for (let s = from; s < to; s += dash + gap) {
    const len = Math.min(dash, to - s);
    const center = s + len / 2;
    if (axis === 'z') stripe(parent, at, center, width, len, material);
    else stripe(parent, center, at, len, width, material);
  }
}

/** Zebra crossing: bars run parallel to traffic, laid side by side across the road. */
function crosswalk(parent: THREE.Object3D, trafficAxis: 'x' | 'z', center: number, roadHalf: number, material: THREE.Material) {
  const barLen = 3;
  const barW = 0.55;
  const pitch = 1.1;
  for (let a = -roadHalf + pitch / 2; a < roadHalf; a += pitch) {
    if (trafficAxis === 'z') stripe(parent, a, center, barW, barLen, material);
    else stripe(parent, center, a, barLen, barW, material);
  }
}

/** Quadrant sidewalk slab: the block rectangle minus the plaza circle, extruded to curb height. */
function quadrantSlab(sx: 1 | -1, sz: 1 | -1, materials: THREE.Material[]) {
  const zc = Math.sqrt(PLAZA_R * PLAZA_R - AVENUE_HALF * AVENUE_HALF);
  const xc = Math.sqrt(PLAZA_R * PLAZA_R - STREET_HALF * STREET_HALF);
  const outer = GROUND_HALF;
  // Shape space is (u, v) = (x, -z); the extrusion is then rotated flat.
  const pts: [number, number][] = [
    [sx * AVENUE_HALF, sz * outer],
    [sx * AVENUE_HALF, sz * zc],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  shape.lineTo(pts[1][0], -pts[1][1]);
  const a0 = Math.atan2(-sz * zc, sx * AVENUE_HALF);
  const a1 = Math.atan2(-sz * STREET_HALF, sx * xc);
  const delta = ((a1 - a0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  shape.absarc(0, 0, PLAZA_R, a0, a1, delta < 0);
  shape.lineTo(sx * outer, -sz * STREET_HALF);
  shape.lineTo(sx * outer, -sz * outer);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: CURB, bevelEnabled: false, curveSegments: 24 });
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function treeAt(parent: THREE.Object3D, x: number, z: number, y: number, scale = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 3.2 * scale, 8), toon(0x3a2a22));
  trunk.position.set(x, y + 1.6 * scale, z);
  addOutline(trunk, 0.03);
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * scale, 1), toon(0x2f7a46));
  canopy.position.set(x, y + 4.2 * scale, z);
  addOutline(canopy, 0.06);
  const canopy2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * scale, 1), toon(0x37904f));
  canopy2.position.set(x + 0.7 * scale, y + 5.1 * scale, z - 0.4 * scale);
  addOutline(canopy2, 0.05);
  parent.add(trunk, canopy, canopy2);
  return trunk;
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------

interface CarSlot {
  x: number;
  z: number;
  /** Yaw in radians; 0 faces +X (parallel to the cross street), π/2 faces -Z. */
  rot: number;
  color: number;
  /** Index into CAR_MODELS. */
  model: number;
}

const PROCEDURAL_CAR = { length: CAR_LENGTH, width: 1.9 };

function carModelFor(slot: CarSlot) {
  return CAR_MODELS.length ? CAR_MODELS[slot.model % CAR_MODELS.length] : null;
}

/** Footprint used for collision of the car in a slot. */
function carFootprint(slot: CarSlot) {
  const model = carModelFor(slot);
  return model ? { length: model.length, width: model.width } : PROCEDURAL_CAR;
}

/** Procedural toon sedan, 4.5 m long, facing +X, wheels on y = 0. */
function buildToonCar(color: number) {
  const car = new THREE.Group();
  const paint = toon(color);
  const glass = toon(0x0e1018);
  const trim = toon(0x16161e);
  const body = box(4.5, 0.74, 1.85, paint, 0, 0.53, 0, 0.05);
  const cabin = box(2.15, 0.56, 1.7, glass, -0.25, 1.18, 0, 0.05);
  const roof = box(1.7, 0.08, 1.74, paint, -0.3, 1.5, 0, 0.04);
  const bumperF = box(0.25, 0.3, 1.9, trim, 2.2, 0.42, 0, 0.04);
  const bumperR = box(0.25, 0.3, 1.9, trim, -2.2, 0.42, 0, 0.04);
  car.add(body, cabin, roof, bumperF, bumperR);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 10);
  const wheelMat = toon(0x0c0c12);
  const hubMat = toon(0x5a5a68);
  [
    [-1.45, 0.86],
    [1.45, 0.86],
    [-1.45, -0.86],
    [1.45, -0.86],
  ].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    addOutline(wheel, 0.035);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(wx, 0.34, wz);
    car.add(wheel, hub);
  });
  [-0.62, 0.62].forEach((wz) => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.42), glow(0xfff0c2, 1.15));
    head.position.set(2.27, 0.72, wz);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.4), glow(0xff3a3a, 0.9));
    tail.position.set(-2.27, 0.72, wz);
    car.add(head, tail);
  });
  return { car, solids: [body, cabin] as THREE.Mesh[] };
}

/**
 * Normalise an imported car model: longest horizontal axis along +X, `length`
 * metres long, centred, wheels on the ground. Returns the wrapper and its meshes.
 * Models are assumed to be authored nose-forward along their long axis (+Z or +X).
 */
function normaliseCarModel(scene: THREE.Object3D, length: number) {
  const wrapper = new THREE.Group();
  wrapper.add(scene);
  scene.updateWorldMatrix(true, true);
  let bounds = new THREE.Box3().setFromObject(scene);
  let size = bounds.getSize(new THREE.Vector3());
  if (size.z > size.x) {
    // +Z → +X
    scene.rotation.y = Math.PI / 2;
    scene.updateWorldMatrix(true, true);
    bounds = new THREE.Box3().setFromObject(scene);
    size = bounds.getSize(new THREE.Vector3());
  }
  const scale = length / Math.max(size.x, 0.001);
  scene.scale.multiplyScalar(scale);
  scene.updateWorldMatrix(true, true);
  bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= bounds.min.y;
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((m) => {
      if (m) m.userData.retain = true;
    });
    meshes.push(mesh);
  });
  return { wrapper, meshes };
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

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

interface SkylineSlot {
  model: number;
  x: number;
  z: number;
  /** Yaw that aims model +Z (the street facade) inward. */
  yaw: number;
  /** Facade width in metres along model local +X. */
  face: number;
}

function buildingScale(model: number, face: number) {
  const spec = ARENA_BUILDINGS[model % ARENA_BUILDINGS.length];
  const scale = face / Math.max(spec.width, 0.001);
  return { scale, depth: spec.depth * scale, height: spec.height * scale };
}

/** Axis-aligned half extents of a uniformly scaled, yawed building. */
function buildingExtents(model: number, face: number, yaw: number) {
  const { depth, height } = buildingScale(model, face);
  const hx = face / 2;
  const hz = depth / 2;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return { extX: c * hx + s * hz, extZ: s * hx + c * hz, height };
}

export function buildWorld(): World {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const occluders: THREE.Object3D[] = [];
  const alleys: World['alleys'] = [];
  const alleyNodes: THREE.Mesh[] = [];
  const textures: THREE.Texture[] = [];
  let disposed = false;

  group.add(makeSky());
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), glow(0x9dffc9, 0.9));
  moon.position.set(-90, 95, -150);
  group.add(moon);

  // --- Ground: asphalt everywhere, sidewalk slabs on top ---------------------
  const asphaltTex = makeAsphaltTexture();
  const sidewalkTex = makeSidewalkTexture();
  const plazaTex = makePlazaTexture();
  [asphaltTex, sidewalkTex, plazaTex].forEach((t) => t && textures.push(t));
  if (asphaltTex) asphaltTex.repeat.set((GROUND_HALF * 2) / 6, (GROUND_HALF * 2) / 6);
  if (sidewalkTex) sidewalkTex.repeat.set(1 / 3, 1 / 3);

  const asphaltMat = toon(0xffffff, { map: asphaltTex });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2), asphaltMat);
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  group.add(ground);
  occluders.push(ground);

  const sidewalkMat = toon(0xffffff, { map: sidewalkTex });
  const curbMat = toon(0x8a8694);
  const quadrants: [1 | -1, 1 | -1][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  quadrants.forEach(([sx, sz]) => {
    const slab = quadrantSlab(sx, sz, [sidewalkMat, curbMat]);
    slab.name = 'sidewalk';
    group.add(slab);
    occluders.push(slab);
  });

  // Plaza disc, flush with the road, with the signal rings painted in.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 72), toon(0xffffff, { map: plazaTex }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.012;
  plaza.material.polygonOffset = true;
  plaza.material.polygonOffsetFactor = -1;
  plaza.material.polygonOffsetUnits = -2;
  group.add(plaza);
  // Plaza curb: a thin kerb ring so the paving reads as a defined space.
  const plazaKerb = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R - 0.3, PLAZA_R, 72), decalMaterial(0x7c7886));
  plazaKerb.rotation.x = -Math.PI / 2;
  plazaKerb.position.y = 0.018;
  group.add(plazaKerb);

  // --- Road markings ----------------------------------------------------------
  const paintWhite = decalMaterial(0xcbc5d6, 0.82);
  const paintYellow = decalMaterial(0xd9b24a, 0.85);
  // Avenue (traffic along Z): dashed centre line, solid parking-lane lines.
  [1, -1].forEach((s) => {
    const from = PLAZA_R + 5.5;
    dashedLine(group, 'z', 0, s > 0 ? from : -GROUND_HALF, s > 0 ? GROUND_HALF : -from, paintYellow);
    [AVENUE_HALF - PARKING_LANE, -(AVENUE_HALF - PARKING_LANE)].forEach((x) => {
      const len = GROUND_HALF - from;
      stripe(group, x, s * (from + len / 2), 0.12, len, paintWhite);
    });
    // Cross street (traffic along X).
    dashedLine(group, 'x', 0, s > 0 ? from : -GROUND_HALF, s > 0 ? GROUND_HALF : -from, paintYellow);
    [STREET_HALF - PARKING_LANE, -(STREET_HALF - PARKING_LANE)].forEach((z) => {
      const len = GROUND_HALF - from;
      stripe(group, s * (from + len / 2), z, len, 0.12, paintWhite);
    });
    // Crosswalks where each road meets the plaza, with stop lines behind them.
    crosswalk(group, 'z', s * (PLAZA_R + 2), AVENUE_HALF, paintWhite);
    stripe(group, s * AVENUE_HALF * 0.5, s * (PLAZA_R + 4.1), AVENUE_HALF, 0.4, paintWhite);
    crosswalk(group, 'x', s * (PLAZA_R + 2), STREET_HALF, paintWhite);
    stripe(group, s * (PLAZA_R + 4.1), -s * STREET_HALF * 0.5, 0.4, STREET_HALF, paintWhite);
  });

  // Manholes and drains.
  const ironMat = decalMaterial(0x1c1b24);
  const ironRim = decalMaterial(0x3a3844);
  [
    [2.6, -19],
    [-3.4, 22.5],
    [-18, 2.8],
    [20.5, -2.6],
    [5.2, 6.8],
  ].forEach(([x, z]) => {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), ironRim);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, 0.016, z);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), ironMat);
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(x, 0.02, z);
    group.add(rim, lid);
  });
  // Storm drains along the avenue curbs.
  [
    [AVENUE_HALF - 0.45, 16],
    [-(AVENUE_HALF - 0.45), -17],
    [AVENUE_HALF - 0.45, -24],
    [-(AVENUE_HALF - 0.45), 24],
  ].forEach(([x, z]) => stripe(group, x, z, 0.5, 1.1, ironMat, 0.02));

  // --- Perimeter buildings & spawn alleys -----------------------------------
  // Textured storefronts and townhouses fill each lot. The facade (model +Z)
  // points inward; narrow lots take the townhouse so the street wall stays tall.
  const skyline: SkylineSlot[] = [];
  let lotPick = 0;
  const inwardYaw = (axis: 'x' | 'z', sign: 1 | -1) => {
    if (axis === 'z') return sign === -1 ? 0 : Math.PI;
    return sign === 1 ? -Math.PI / 2 : Math.PI / 2;
  };

  SIDES.forEach((side) => {
    const sorted = [...side.gaps].sort((a, b) => a.at - b.at);
    const edges = [-ARENA_HALF, ...sorted.flatMap((g) => [g.at - g.width / 2, g.at + g.width / 2]), ARENA_HALF];
    for (let i = 0; i < edges.length; i += 2) {
      const start = edges[i];
      const end = edges[i + 1];
      const length = end - start;
      if (length <= 0.5) continue;
      const segments = Math.max(1, Math.round(length / 11));
      const segLength = length / segments;
      for (let s = 0; s < segments; s += 1) {
        const center = start + s * segLength + segLength / 2;
        const face = segLength - 0.7;
        if (face < 4 || !ARENA_BUILDINGS.length) continue;
        const model = face < 8.4 ? 1 % ARENA_BUILDINGS.length : lotPick % ARENA_BUILDINGS.length;
        lotPick += 1;
        const yaw = inwardYaw(side.axis, side.sign);
        const { depth } = buildingScale(model, face);
        const outward = side.sign * (ARENA_HALF + depth / 2);
        skyline.push({
          model,
          yaw,
          face,
          x: side.axis === 'z' ? center : outward,
          z: side.axis === 'z' ? outward : center,
        });
      }
    }

    side.gaps.forEach((g) => {
      const outward = side.sign * (ARENA_HALF + 4.5);
      const position = side.axis === 'z' ? new THREE.Vector3(g.at, 0, outward) : new THREE.Vector3(outward, 0, g.at);
      const inward = position.clone().multiplyScalar(-1).setY(0).normalize();
      alleys.push({ position, inward });

      const nodeY = 4.2;
      const nodePos =
        side.axis === 'z'
          ? new THREE.Vector3(g.at, nodeY, side.sign * ARENA_HALF)
          : new THREE.Vector3(side.sign * ARENA_HALF, nodeY, g.at);
      const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), glow(0x6dff9e, 1.6));
      node.position.copy(nodePos);
      group.add(node);
      alleyNodes.push(node);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(g.width > 6 ? 4.2 : 2.7, 0.14, 8, 36), glow(0x36c56e, 1.1));
      arch.position.copy(nodePos).setY(0.6);
      if (side.axis === 'x') arch.rotation.y = Math.PI / 2;
      group.add(arch);
    });
  });

  // Corners turn to face the plaza, sitting just outside the side lots.
  quadrants.forEach(([sx, sz], i) => {
    if (!ARENA_BUILDINGS.length) return;
    const face = 11;
    const model = i % ARENA_BUILDINGS.length;
    const yaw = Math.atan2(-sx, -sz);
    const { extX, extZ } = buildingExtents(model, face, yaw);
    skyline.push({
      model,
      yaw,
      face,
      x: sx * (ARENA_HALF + extX),
      z: sz * (ARENA_HALF + extZ),
    });
  });

  // (+x,+z): mid-block storefront, door toward the cross street.
  if (ARENA_BUILDINGS.length) {
    skyline.push({ model: 0, x: 19.5, z: 17.5, yaw: Math.PI, face: 10 });
  }

  skyline.forEach((slot) => {
    const { extX, extZ } = buildingExtents(slot.model, slot.face, slot.yaw);
    obstacles.push({ kind: 'box', minX: slot.x - extX, maxX: slot.x + extX, minZ: slot.z - extZ, maxZ: slot.z + extZ });
  });

  const mountBuilding = (template: THREE.Object3D, slot: SkylineSlot) => {
    const { scale } = buildingScale(slot.model, slot.face);
    const root = new THREE.Group();
    const scene = template.clone(true);
    scene.scale.setScalar(scale);
    root.name = 'arena-building';
    root.add(scene);
    root.position.set(slot.x, CURB, slot.z);
    root.rotation.y = slot.yaw;
    group.add(root);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((m) => {
        if (m) m.userData.retain = true;
      });
      occluders.push(mesh);
    });
  };

  const addFallbackBuilding = (slot: SkylineSlot) => {
    const { extX, extZ, height } = buildingExtents(slot.model, slot.face, slot.yaw);
    const b = box(extX * 2, height, extZ * 2, toon(0x2a2136), slot.x, CURB + height / 2, slot.z, 0.08);
    group.add(b);
    occluders.push(b);
  };

  if (ARENA_BUILDINGS.length && skyline.length) {
    const loader = new GLTFLoader();
    const templates = ARENA_BUILDINGS.map((model) => loader.loadAsync(model.url).catch((error) => {
      console.warn('[raid] building model failed to load', model.url, error);
      return null;
    }));
    Promise.all(templates).then((loaded) => {
      if (disposed) return;
      const any = loaded.findIndex(Boolean);
      skyline.forEach((slot) => {
        const template = loaded[slot.model] ?? (any >= 0 ? loaded[any] : null);
        if (!template) {
          addFallbackBuilding(slot);
          return;
        }
        mountBuilding(template.scene, slot);
      });
    });
  }

  // --- Quadrant blocks --------------------------------------------------------
  // (-x,-z): surface parking lot on the sidewalk level.
  const lotMat = toon(0xffffff, { map: asphaltTex ? asphaltTex.clone() : null });
  if (lotMat.map) {
    lotMat.map.repeat.set(13 / 6, 14 / 6);
    lotMat.map.needsUpdate = true;
    textures.push(lotMat.map);
  }
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(13, 14), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(-17.5, CURB + 0.012, -17);
  lotMat.polygonOffset = true;
  lotMat.polygonOffsetFactor = -1;
  lotMat.polygonOffsetUnits = -2;
  group.add(lot);
  for (let i = 0; i < 5; i += 1) {
    stripe(group, -23.5 + i * 2.7, -21.4, 0.1, 5.2, paintWhite, CURB + 0.02);
  }
  stripe(group, -18.1, -18.8, 10.8, 0.1, paintWhite, CURB + 0.02);
  // Bollards along the lot's street edge.
  const bollardMat = toon(0x3a3848);
  [-13, -16.5, -20, -23.5].forEach((z) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.95, 10), bollardMat);
    b.position.set(-11.4, CURB + 0.475, z);
    addOutline(b, 0.03);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow(0xffd28a, 0.8));
    cap.position.set(-11.4, CURB + 0.98, z);
    group.add(b, cap);
    obstacles.push({ kind: 'circle', x: -11.4, z, r: 0.2 });
  });

  // (-x,+z): pocket park.
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 13), toon(0x2f5a3a));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(-18, CURB + 0.012, 17.5);
  (grass.material as THREE.Material).polygonOffset = true;
  (grass.material as THREE.Material).polygonOffsetFactor = -1;
  (grass.material as THREE.Material).polygonOffsetUnits = -2;
  group.add(grass);
  const parkPath = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 13), sidewalkMat.clone());
  parkPath.rotation.x = -Math.PI / 2;
  parkPath.position.set(-16, CURB + 0.016, 17.5);
  group.add(parkPath);
  [
    [-21, 21, 1],
    [-13.5, 13.5, 0.85],
    [-22, 13, 0.9],
    [-19.5, 24.5, 0.75],
  ].forEach(([x, z, s]) => {
    treeAt(group, x, z, CURB, s);
    obstacles.push({ kind: 'circle', x, z, r: 0.42 });
  });

  // (+x,-z): open storefront corner — kept clear for combat, framed by planters.

  // --- Signal spire on a raised island ---------------------------------------
  const islandMat = toon(0x4a425c);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.1, 0.18, 32), toon(0x5a526c));
  step.position.y = 0.09;
  addOutline(step, 0.05);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.36, 32), islandMat);
  island.position.y = 0.36;
  addOutline(island, 0.05);
  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 1.1, 24), toon(0x3a3350));
  spireBase.position.y = 0.54 + 0.55;
  addOutline(spireBase, 0.07);
  const spire = box(1.1, 8.5, 1.1, toon(0x1d1828), 0, 1.64 + 4.25, 0, 0.07);
  const spireRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), glow(0x6dff9e, 1.8));
  spireRing.position.y = 9.7;
  spireRing.rotation.x = Math.PI / 2;
  const spireTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glow(0x9dffc9, 2.4));
  spireTip.position.y = 11.1;
  group.add(step, island, spireBase, spire, spireRing, spireTip);
  occluders.push(step, island, spireBase, spire);
  obstacles.push({ kind: 'circle', x: 0, z: 0, r: 3.5 });

  // --- Cars -------------------------------------------------------------------
  const parkedAlongAvenue = Math.PI / 2;
  const slots: CarSlot[] = [
    // Avenue parking lanes, nose-to-tail along the curbs.
    { x: AVENUE_HALF - 1.25, z: 16, rot: parkedAlongAvenue, color: 0x8a2f2a, model: 0 },
    { x: AVENUE_HALF - 1.25, z: 22.2, rot: parkedAlongAvenue, color: 0x2c4f8a, model: 1 },
    { x: -(AVENUE_HALF - 1.25), z: -15.5, rot: -parkedAlongAvenue, color: 0xcfc7b8, model: 1 },
    { x: -(AVENUE_HALF - 1.25), z: -21.8, rot: -parkedAlongAvenue, color: 0x2e2e36, model: 0 },
    { x: -(AVENUE_HALF - 1.25), z: 19, rot: -parkedAlongAvenue, color: 0x5f7f4a, model: 0 },
    // Cross street curbs.
    { x: 18.5, z: -(STREET_HALF - 1.25), rot: 0, color: 0xb8782f, model: 1 },
    { x: -20, z: -(STREET_HALF - 1.25), rot: Math.PI, color: 0x3f3f4a, model: 0 },
    { x: -16.5, z: STREET_HALF - 1.25, rot: 0, color: 0x7a2f5a, model: 1 },
    // One abandoned mid-lane as the signal hit — skewed across the avenue.
    { x: -2.2, z: -18.5, rot: Math.PI / 2 + 0.55, color: 0xd9c46a, model: 0 },
    // Surface lot.
    { x: -22.15, z: -21.6, rot: parkedAlongAvenue, color: 0x8f8fa0, model: 1 },
    { x: -16.75, z: -21.6, rot: parkedAlongAvenue, color: 0x3c6b9c, model: 0 },
  ];

  const carRoots: THREE.Group[] = [];
  slots.forEach((slot) => {
    const root = new THREE.Group();
    root.position.set(slot.x, groundHeight(slot.x, slot.z), slot.z);
    root.rotation.y = slot.rot;
    const { car, solids } = buildToonCar(slot.color);
    root.add(car);
    group.add(root);
    carRoots.push(root);
    occluders.push(...solids);
    const { length, width } = carFootprint(slot);
    const halfL = length / 2 + 0.05;
    const halfW = width / 2 + 0.05;
    const c = Math.abs(Math.cos(slot.rot));
    const s = Math.abs(Math.sin(slot.rot));
    // Axis-aligned bounds of the rotated footprint.
    const extX = c * halfL + s * halfW;
    const extZ = s * halfL + c * halfW;
    obstacles.push({ kind: 'box', minX: slot.x - extX, maxX: slot.x + extX, minZ: slot.z - extZ, maxZ: slot.z + extZ });
  });

  // Swap in real car models when configured; procedural cars stay until then.
  if (CAR_MODELS.length) {
    const loader = new GLTFLoader();
    const templates = CAR_MODELS.map((model) => loader.loadAsync(model.url).catch((error) => {
      console.warn('[raid] car model failed to load', model.url, error);
      return null;
    }));
    Promise.all(templates).then((loaded) => {
      if (disposed) return;
      carRoots.forEach((root, i) => {
        const wanted = slots[i].model % CAR_MODELS.length;
        const index = loaded[wanted] ? wanted : loaded.findIndex(Boolean);
        const template = loaded[index];
        if (!template) return;
        const { wrapper, meshes } = normaliseCarModel(template.scene.clone(true), CAR_MODELS[index].length);
        const old = root.children[0];
        root.remove(old);
        old.traverse((o) => {
          const idx = occluders.indexOf(o);
          if (idx >= 0) occluders.splice(idx, 1);
        });
        root.add(wrapper);
        occluders.push(...meshes);
      });
    });
  }

  // --- Planters on the sidewalks ---------------------------------------------
  const planters = [
    [13.5, 13.5],
    [-13.5, 13.5],
    [13.5, -13.5],
    [-13.5, -13.5],
    [22, -10.2],
    [27, -22],
    [13, 26],
    [26.5, 9.8],
  ];
  planters.forEach(([x, z]) => {
    const y = groundHeight(x, z);
    const base = box(1.8, 0.8, 1.8, toon(0x4b4360), x, y + 0.4, z, 0.05);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), toon(0x2f8a4f));
    bush.position.set(x, y + 1.2, z);
    addOutline(bush, 0.05);
    group.add(base, bush);
    occluders.push(base);
    obstacles.push({ kind: 'box', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9 });
  });

  // --- Street lights: cobra-head poles on the curb line, arms over the road ---
  const lampMat = toon(0x22202c);
  const lamps: { x: number; z: number; arm: 'x' | 'z'; lit: boolean }[] = [
    { x: 9.4, z: 14.5, arm: 'x', lit: true },
    { x: -9.4, z: -14.5, arm: 'x', lit: true },
    { x: 9.4, z: -22.5, arm: 'x', lit: false },
    { x: -9.4, z: 22.5, arm: 'x', lit: false },
    { x: 15.5, z: -8.4, arm: 'z', lit: true },
    { x: -15.5, z: 8.4, arm: 'z', lit: true },
    { x: 24, z: 8.4, arm: 'z', lit: false },
    { x: -24, z: -8.4, arm: 'z', lit: false },
    // Plaza perimeter.
    { x: 13.2, z: 13.2, arm: 'x', lit: false },
    { x: -13.2, z: -13.2, arm: 'x', lit: false },
  ];
  lamps.forEach((lamp) => {
    const y = groundHeight(lamp.x, lamp.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.4, 10), lampMat);
    pole.position.set(lamp.x, y + 3.7, lamp.z);
    addOutline(pole, 0.03);
    const dir = lamp.arm === 'x' ? -Math.sign(lamp.x) : -Math.sign(lamp.z);
    const armLen = 2.3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(lamp.arm === 'x' ? armLen : 0.14, 0.14, lamp.arm === 'x' ? 0.14 : armLen), lampMat);
    arm.position.set(
      lamp.x + (lamp.arm === 'x' ? (dir * armLen) / 2 : 0),
      y + 7.3,
      lamp.z + (lamp.arm === 'z' ? (dir * armLen) / 2 : 0),
    );
    addOutline(arm, 0.025);
    const hx = lamp.x + (lamp.arm === 'x' ? dir * armLen : 0);
    const hz = lamp.z + (lamp.arm === 'z' ? dir * armLen : 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(lamp.arm === 'x' ? 0.9 : 0.4, 0.2, lamp.arm === 'x' ? 0.4 : 0.9), lampMat);
    head.position.set(hx, y + 7.2, hz);
    addOutline(head, 0.025);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(lamp.arm === 'x' ? 0.7 : 0.3, 0.06, lamp.arm === 'x' ? 0.3 : 0.7), glow(0xffd28a, lamp.lit ? 1.6 : 1.1));
    lens.position.set(hx, y + 7.08, hz);
    group.add(pole, arm, head, lens);
    if (lamp.lit) {
      const light = new THREE.PointLight(0xffc478, 34, 30, 2);
      light.position.set(hx, y + 6.9, hz);
      group.add(light);
    }
    obstacles.push({ kind: 'circle', x: lamp.x, z: lamp.z, r: 0.25 });
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
    disposed = true;
    textures.forEach((t) => t.dispose());
  };

  return { group, obstacles, occluders, alleys, spireRing, alleyNodes, heightAt: groundHeight, animate, dispose };
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
