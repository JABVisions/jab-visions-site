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

/** Observation deck meets the west stair at full height. The hall continues west of the door. */
const DECK_EAST = -17.35;
const DECK_WEST = -40.6;
const DECK_HALF_Z = 8.7;
const HALL_EAST = -40.15;
const HALL_WEST = -68.2;
const HALL_HALF_Z = 3.55;
const DOOR_X = -40.4;

/** 0 on the chamber floor, rising through the stairs, FLOOR on the balcony, deck, and lab hall. */
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
  if (x <= DECK_EAST && x >= DECK_WEST && Math.abs(z) <= DECK_HALF_Z) return FLOOR;
  if (x <= HALL_EAST && x >= HALL_WEST && Math.abs(z) <= HALL_HALF_Z) return FLOOR;
  const r = Math.hypot(x, z);
  if (r >= 16.15 && r <= 23.35 && Math.abs(Math.atan2(z, x)) > 0.62) return FLOOR;
  return 0;
}

/**
 * Waypoint between floors. A host on the chamber floor is sent up the west stair;
 * a host crossing into the lab is sent through the observation-deck door.
 */
export function padRoute(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number } | null {
  const fromUp = padHeight(fromX, fromZ) > 2.2;
  const toUp = padHeight(toX, toZ) > 2.2;
  const stairBase = { x: -12.4, z: 0 };
  const stairTop = { x: -18.2, z: 0 };
  const door = { x: DOOR_X + 1.2, z: 0 };
  const inHall = (x: number) => x < -41.6;
  if (!fromUp && toUp) {
    if (fromX > -13.2) return stairBase;
    if (padHeight(fromX, fromZ) < 3.6) return stairTop;
    if (inHall(toX) && fromX > -39.4) return door;
    return null;
  }
  if (fromUp && !toUp) {
    if (inHall(fromX)) return door;
    if (fromX < -18.8) return stairTop;
    if (padHeight(fromX, fromZ) > 1) return stairBase;
    return null;
  }
  if (fromUp && toUp) {
    if (inHall(toX) !== inHall(fromX)) return door;
  }
  return null;
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

function buildObservationWing(
  group: THREE.Group,
  obstacles: Obstacle[],
  occluders: THREE.Object3D[],
  pulse: THREE.Material[],
) {
  const deckMat = metal(0x1c2430, 0x062028, 0.22);
  const railMat = metal(0x8fdfff, 0x39e7ff, 0.45);
  const consoleMat = metal(0x24303a, 0x39e7ff, 0.35);
  const glass = holo(0xb9f6ff, 0.18);
  const tubeGlass = holo(0xd7fbff, 0.28);
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f6f8, metalness: 0.08, roughness: 0.32 });
  const whiteTrim = new THREE.MeshStandardMaterial({
    color: 0xd5dee6,
    emissive: 0x9fdfff,
    emissiveIntensity: 0.18,
    metalness: 0.2,
    roughness: 0.28,
  });
  const led = new THREE.MeshStandardMaterial({
    color: 0xf7fbff,
    emissive: 0xf4fbff,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });
  const securedMat = new THREE.MeshStandardMaterial({
    color: 0xc8d0d6,
    emissive: 0xff3355,
    emissiveIntensity: 0.45,
    metalness: 0.4,
    roughness: 0.35,
  });
  pulse.push(glass, tubeGlass);

  const deckFloor = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.22, 17.4), deckMat);
  deckFloor.position.set(-28.55, FLOOR - 0.08, 0);
  group.add(deckFloor);

  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 5.4), railMat);
  porch.position.set(-17.2, FLOOR - 0.02, 0);
  group.add(porch);

  // Side rails on the west stair so the ramp does not drop off into the void.
  const stairPitch = -Math.atan2(FLOOR, 5.3);
  const northRail = addBox(group, obstacles, occluders, railMat, -14.8, 2.15, 2.45, 5.6, 0.14, 0.14, true, false);
  const southRail = addBox(group, obstacles, occluders, railMat, -14.8, 2.15, -2.45, 5.6, 0.14, 0.14, true, false);
  northRail.rotation.z = stairPitch;
  southRail.rotation.z = stairPitch;

  // Deck shell. The east face stays open over the arena, with a glass rail.
  addBox(group, obstacles, occluders, metal(0x121820), -29, FLOOR + 2.15, 8.85, 22.6, 4.3, 0.28, true, true);
  addBox(group, obstacles, occluders, metal(0x121820), -29, FLOOR + 2.15, -8.85, 22.6, 4.3, 0.28, true, true);
  const ceiling = addBox(group, obstacles, occluders, metal(0x10161e), -29.4, FLOOR + 4.35, 0, 22.2, 0.22, 17.2, false, true);
  ceiling.receiveShadow = false;
  for (let i = 0; i < 4; i += 1) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.28), led);
    strip.position.set(-22.4 - i * 4.4, FLOOR + 4.2, 0);
    group.add(strip);
  }
  addBox(group, obstacles, occluders, railMat, -18.15, FLOOR + 0.62, -5.6, 0.12, 1.15, 5.6, true, true);
  addBox(group, obstacles, occluders, railMat, -18.15, FLOOR + 0.62, 5.6, 0.12, 1.15, 5.6, true, true);
  for (const side of [-5.4, 5.4]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 6.2), glass);
    pane.position.set(-18.15, FLOOR + 2.55, side);
    group.add(pane);
  }

  const screenMat = holo(0xd7f6ff, 0.82);
  pulse.push(screenMat);
  const screens: THREE.Mesh[] = [];
  for (const spot of [
    { x: -24.5, z: 6.4, rot: 0 },
    { x: -33.5, z: -6.4, rot: Math.PI },
    { x: -37.2, z: 6.55, rot: Math.PI },
  ]) {
    addBox(group, obstacles, occluders, consoleMat, spot.x, FLOOR + 0.85, spot.z, 1.8, 1.05, 0.7, true, false);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.72), screenMat);
    screen.position.set(spot.x, FLOOR + 1.55, spot.z + (spot.rot === 0 ? 0.2 : spot.rot === Math.PI ? -0.2 : 0));
    screen.rotation.y = spot.rot;
    group.add(screen);
    screens.push(screen);
  }

  const specimens: THREE.Mesh[] = [];
  const tubeColors = [0x7d5cff, 0x3de7ff, 0xff4d8d, 0x8dff6a, 0xffe28a];
  for (const [index, spot] of [
    { x: -24, z: 5.1 },
    { x: -30, z: 5.3 },
    { x: -36, z: 4.8 },
    { x: -27, z: -5.2 },
    { x: -34, z: -5.0 },
  ].entries()) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.5, 16, 1, true), tubeGlass);
    tube.position.set(spot.x, FLOOR + 1.35, spot.z);
    group.add(tube);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 12), railMat);
    cap.position.set(spot.x, FLOOR + 2.6, spot.z);
    group.add(cap);
    const specimen = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: tubeColors[index % tubeColors.length], transparent: true, opacity: 0.9 }),
    );
    specimen.position.set(spot.x, FLOOR + 1.3, spot.z);
    group.add(specimen);
    specimens.push(specimen);
    obstacles.push({ kind: 'circle', x: spot.x, z: spot.z, r: 0.55 });
  }

  // Sliding door on the rear (west) wall. Panels move apart; collision follows them.
  const doorMat = metal(0xd5dee6, 0x9fefff, 0.4);
  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.35, 1.42), doorMat);
  const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.35, 1.42), doorMat);
  leftPanel.position.set(DOOR_X, FLOOR + 1.7, -0.72);
  rightPanel.position.set(DOOR_X, FLOOR + 1.7, 0.72);
  group.add(leftPanel, rightPanel);
  const frameMat = metal(0x9fd8e4, 0x39e7ff, 0.7);
  addBox(group, obstacles, occluders, metal(0x121820), DOOR_X, FLOOR + 2.15, -5.2, 0.28, 4.3, 7.0, true, true);
  addBox(group, obstacles, occluders, metal(0x121820), DOOR_X, FLOOR + 2.15, 5.2, 0.28, 4.3, 7.0, true, true);
  addBox(group, obstacles, occluders, frameMat, DOOR_X, FLOOR + 3.5, 0, 0.22, 0.16, 3.3, false, false);
  addBox(group, obstacles, occluders, frameMat, DOOR_X, FLOOR + 1.7, -1.7, 0.22, 3.4, 0.16, true, false);
  addBox(group, obstacles, occluders, frameMat, DOOR_X, FLOOR + 1.7, 1.7, 0.22, 3.4, 0.16, true, false);
  const leftHit: Obstacle = { kind: 'box', minX: DOOR_X - 0.2, maxX: DOOR_X + 0.2, minZ: -1.43, maxZ: -0.01 };
  const rightHit: Obstacle = { kind: 'box', minX: DOOR_X - 0.2, maxX: DOOR_X + 0.2, minZ: 0.01, maxZ: 1.43 };
  obstacles.push(leftHit, rightHit);

  // White laboratory hall, square in section, ending at a secured door.
  const hallFloor = new THREE.Mesh(new THREE.BoxGeometry(28.2, 0.2, 7.1), white);
  hallFloor.position.set(-54.2, FLOOR - 0.06, 0);
  group.add(hallFloor);
  addBox(group, obstacles, occluders, white, -54.2, FLOOR + 2.05, 3.65, 27.6, 4.1, 0.22, true, true);
  addBox(group, obstacles, occluders, white, -54.2, FLOOR + 2.05, -3.65, 27.6, 4.1, 0.22, true, true);
  const hallCeiling = addBox(group, obstacles, occluders, white, -54.2, FLOOR + 4.15, 0, 27.6, 0.18, 7.1, false, true);
  hallCeiling.receiveShadow = false;
  for (let i = 0; i < 6; i += 1) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.1), led);
    light.position.set(-45.5 - i * 3.6, FLOOR + 4.02, 0);
    group.add(light);
  }
  for (const spot of [-48, -56, -63]) {
    addBox(group, obstacles, occluders, whiteTrim, spot, FLOOR + 1.7, 3.4, 1.5, 2.6, 0.18, true, false);
    addBox(group, obstacles, occluders, whiteTrim, spot, FLOOR + 1.7, -3.4, 1.5, 2.6, 0.18, true, false);
    const window = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), glass);
    window.position.set(spot, FLOOR + 2.3, 3.5);
    group.add(window);
    const windowB = window.clone();
    windowB.position.z = -3.5;
    windowB.rotation.y = Math.PI;
    group.add(windowB);
  }
  addBox(group, obstacles, occluders, whiteTrim, -54.2, FLOOR + 0.08, 2.4, 27, 0.06, 0.08, false, false);
  // Full end cap so the corridor does not open onto the void. The red panel is the secured door.
  addBox(group, obstacles, occluders, white, HALL_WEST + 0.2, FLOOR + 2.15, 0, 0.36, 4.4, 7.3, true, true);
  const securedDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.15, 2.35), securedMat);
  securedDoor.position.set(HALL_WEST + 0.46, FLOOR + 1.9, 0);
  group.add(securedDoor);
  const secured = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), securedMat);
  secured.position.set(HALL_WEST + 0.52, FLOOR + 2.7, 0);
  secured.rotation.y = Math.PI / 2;
  group.add(secured);

  const deckLight = new THREE.PointLight(0x9aefff, 8, 18, 1.4);
  deckLight.position.set(-28, FLOOR + 3.4, 0);
  const deckLightB = new THREE.PointLight(0xd7f6ff, 5, 14, 1.5);
  deckLightB.position.set(-36, FLOOR + 3.1, 1.5);
  const hallLightA = new THREE.PointLight(0xf4f8ff, 7, 16, 1.2);
  hallLightA.position.set(-50, FLOOR + 3.5, 0);
  const hallLightB = new THREE.PointLight(0xf4f8ff, 6, 14, 1.2);
  hallLightB.position.set(-62, FLOOR + 3.5, 0);
  group.add(deckLight, deckLightB, hallLightA, hallLightB);

  let openT = 0;
  const step = (agents: { x: number; z: number }[], dt: number) => {
    let near = false;
    for (const agent of agents) {
      if (padHeight(agent.x, agent.z) < 2) continue;
      if (Math.hypot(agent.x - DOOR_X, agent.z) < 3.15) near = true;
    }
    openT = THREE.MathUtils.clamp(openT + (near ? 1 : -1) * dt * 2.15, 0, 1);
    const slide = openT * 1.45;
    leftPanel.position.z = -0.72 - slide;
    rightPanel.position.z = 0.72 + slide;
    const half = 0.71;
    const open = openT > 0.82;
    leftHit.minX = open ? 400 : DOOR_X - 0.2;
    leftHit.maxX = open ? 401 : DOOR_X + 0.2;
    rightHit.minX = leftHit.minX;
    rightHit.maxX = leftHit.maxX;
    leftHit.minZ = leftPanel.position.z - half;
    leftHit.maxZ = leftPanel.position.z + half;
    rightHit.minZ = rightPanel.position.z - half;
    rightHit.maxZ = rightPanel.position.z + half;
  };

  return { step, screens, specimens };
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
  const rampLen = Math.hypot(6.1, FLOOR);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.16, 4.2), trimMat);
  ramp.position.set(-15.15, FLOOR * 0.5, 0);
  ramp.rotation.z = -Math.atan2(FLOOR, 6.1);
  group.add(ramp);

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
    const wallAng = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(wallAng) < 0.34) continue;
    // West opening: the observation deck continues through the ring.
    if (Math.abs(Math.abs(wallAng) - Math.PI) < 0.55) continue;
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

  const wing = buildObservationWing(group, obstacles, occluders, pulse);

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
    routeTo: padRoute,
    stepFacility: wing.step,
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
      wing.specimens.forEach((specimen, i) => {
        specimen.position.y = FLOOR + 1.15 + Math.sin(time * 1.3 + i) * 0.35;
        specimen.rotation.y = time * 0.6;
      });
      for (const screen of wing.screens) {
        screen.position.y = FLOOR + 1.55 + Math.sin(time * 2 + screen.position.x) * 0.02;
      }
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
