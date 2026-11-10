import * as THREE from 'three';
import { mergeStatic } from '../render/instancing';
import type { ThrowSpot } from '../throwables';
import { RIVERDALE } from './config';
import { keep, keepGeo, placeMatrix, scatter, seededRandom, type BuildKit } from './kit';
import { fabric } from './surfaces';
import { riverdaleGround } from './terrain';

/**
 * The party the teenagers carried in: a DJ table on milk crates, two speaker
 * stacks, thrift-store couches, folding tables with cups, pallets, backpacks
 * and trash bags, string lights between the columns and battery LEDs on the
 * floor. Nothing here is installed; it all sits on the dirt.
 *
 * Coloured point lights are ordinary scene lights. The render pipeline's light
 * pool hands its few real lights to whichever of them are nearest the fighter.
 */

export interface PartyLight {
  light: THREE.PointLight;
  base: number;
  pulse: number;
  phase: number;
}

interface Led {
  x: number;
  z: number;
  cap: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  color: THREE.Color;
  out: boolean;
}

interface Strand {
  mesh: THREE.InstancedMesh;
  start: number;
  points: THREE.Vector3[];
  mid: THREE.Vector3;
  wobble: number;
}

const PINK = 0xff3fa8;
const PURPLE = 0x9a4dff;
const BLUE = 0x3d7dff;
const AMBER = 0xffb868;

export function buildParty(kit: BuildKit) {
  const root = new THREE.Group();
  root.name = 'riverdale-party';
  kit.group.add(root);
  const rand = seededRandom(3307);
  const y = (x: number, z: number) => riverdaleGround(x, z);

  const mat = (color: number, rough = 0.8, metal = 0) => keep(kit, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  const wood = mat(0x8a6a44, 0.9);
  const darkWood = mat(0x5e452c, 0.92);
  const plastic = mat(0x2a2a2e, 0.55);
  const metal = mat(0x8a8c90, 0.45, 0.6);
  const speakerBox = mat(0x161618, 0.7);
  const cone = mat(0x0c0c0e, 0.5);

  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, by: number, z: number, yaw = 0, shadow = true) => {
    const mesh = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, by + h / 2, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // --- DJ table -------------------------------------------------------------------------
  const djZ = -9.3;
  const djY = y(0, djZ);
  for (const cx of [-1.7, 1.7]) {
    box(0.42, 0.34, 0.42, mat(cx < 0 ? 0x2050a8 : 0xc83a2a, 0.6), cx, djY, djZ);
    box(0.42, 0.34, 0.42, mat(0x2a8a40, 0.6), cx, djY + 0.34, djZ);
  }
  box(4.2, 0.06, 1.2, wood, 0, djY + 0.7, djZ);
  for (const dx of [-0.95, 0.95]) {
    box(0.72, 0.1, 0.52, plastic, dx, djY + 0.76, djZ);
    const platter = new THREE.Mesh(keepGeo(kit, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20)), keep(kit, new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE).multiplyScalar(1.6) })));
    platter.position.set(dx, djY + 0.87, djZ);
    platter.userData.glow = true;
    root.add(platter);
  }
  box(0.36, 0.02, 0.26, metal, 0, djY + 0.77, djZ - 0.1);
  const screen = new THREE.Mesh(keepGeo(kit, new THREE.PlaneGeometry(0.34, 0.22)), keep(kit, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff).multiplyScalar(1.3) })));
  screen.position.set(0, djY + 0.9, djZ - 0.22);
  screen.rotation.x = -0.25;
  screen.userData.glow = true;
  root.add(screen);

  // --- Speaker stacks -------------------------------------------------------------------
  const ringGeo = keepGeo(kit, new THREE.RingGeometry(0.26, 0.31, 24));
  const ringMat = keep(kit, new THREE.MeshBasicMaterial({ color: new THREE.Color(PINK).multiplyScalar(1.4), side: THREE.DoubleSide }));
  for (const sx of [-4.6, 4.6]) {
    const sy = y(sx, -9.4);
    for (let level = 0; level < 2; level += 1) {
      box(1.5, 1.1, 1.5, speakerBox, sx, sy + level * 1.1, -9.4, sx < 0 ? 0.2 : -0.2);
      const woofer = new THREE.Mesh(keepGeo(kit, new THREE.CircleGeometry(0.34, 24)), cone);
      woofer.position.set(sx + (sx < 0 ? 0.15 : -0.15), sy + level * 1.1 + 0.55, -9.4 + 0.76);
      woofer.rotation.y = sx < 0 ? 0.2 : -0.2;
      root.add(woofer);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(woofer.position).add(new THREE.Vector3(0, 0, 0.01));
      ring.rotation.y = woofer.rotation.y;
      ring.userData.glow = true;
      root.add(ring);
    }
  }

  // --- Couches --------------------------------------------------------------------------
  const couch = (x: number, z: number, yaw: number, color: string, seed: number) => {
    const map = fabric(color, seed);
    kit.textures.push(map);
    const cloth = keep(kit, new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
    const g = new THREE.Group();
    g.position.set(x, y(x, z), z);
    g.rotation.y = yaw;
    const part = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(w, h, d)), cloth);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    part(4.2, 0.45, 1.5, 0, 0.3, 0);
    part(4.2, 0.75, 0.32, 0, 0.75, -0.6);
    part(0.32, 0.6, 1.5, -2, 0.55, 0);
    part(0.32, 0.6, 1.5, 2, 0.55, 0);
    root.add(g);
  };
  couch(-17.7, -2, Math.PI / 2, '#5a4038', 11);
  couch(17.7, 3.7, -Math.PI / 2, '#2e4a5a', 12);
  couch(-7.5, -12.1, 0, '#6a5a3a', 13);

  // --- Folding tables with cups ----------------------------------------------------------
  const cupGeo = new THREE.CylinderGeometry(0.045, 0.034, 0.12, 8);
  cupGeo.translate(0, 0.06, 0);
  const cupMat = keep(kit, new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.45 }));
  const cups: THREE.Matrix4[] = [];
  const table = (x: number, z: number) => {
    const ty = y(x, z);
    box(2.8, 0.05, 1.2, keep(kit, new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 })), x, ty + 0.72, z);
    for (const lx of [-1.2, 1.2]) box(0.05, 0.72, 1.0, metal, x + lx, ty, z, 0, false);
    for (let i = 0; i < 9; i += 1) cups.push(placeMatrix(x + (rand() - 0.5) * 2.4, ty + 0.77, z + (rand() - 0.5) * 0.9, 0));
  };
  table(-12, -6.4);
  table(12, 10);
  // Cups and cans dropped on the dirt across the floor.
  for (let i = 0; i < 70; i += 1) {
    const x = (rand() - 0.5) * 40;
    const z = -12 + rand() * 25;
    const lying = rand() < 0.6;
    cups.push(placeMatrix(x, y(x, z) + (lying ? 0.045 : 0), z, rand() * 6.28, 1, lying ? [Math.PI / 2, 0] : [0, 0]));
  }
  scatter(kit, cupGeo, cupMat, cups, { name: 'riverdale-cups' });
  const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8).rotateZ(Math.PI / 2);
  const cans: THREE.Matrix4[] = [];
  for (let i = 0; i < 36; i += 1) {
    const x = (rand() - 0.5) * 46;
    const z = -13 + rand() * 28;
    cans.push(placeMatrix(x, y(x, z) + 0.033, z, rand() * 6.28));
  }
  scatter(kit, canGeo, metal, cans, { name: 'riverdale-cans' });

  // --- Crate stack hiding the supply cache ---------------------------------------------
  const crateMat = mat(0x8a6a3a, 0.9);
  for (let i = 0; i < 5; i += 1) {
    const x = 17.6 + i * 0.95;
    const cy = y(x, -11.1);
    box(0.9, 0.7, 1.3, crateMat, x, cy, -11.1, (rand() - 0.5) * 0.1);
    if (i % 2 === 0) box(0.9, 0.7, 1.3, crateMat, x + 0.1, cy + 0.7, -11.1, (rand() - 0.5) * 0.2);
    if (i === 2) box(0.9, 0.7, 1.3, crateMat, x, cy + 1.4, -11.1, 0.15);
  }

  // --- Pallets, benches, backpacks, trash bags, coolers --------------------------------
  const pallet = (x: number, z: number, yaw: number, stack = 1, lean = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y(x, z), z);
    g.rotation.set(lean, yaw, 0);
    for (let s = 0; s < stack; s += 1) {
      for (let k = 0; k < 5; k += 1) {
        const slat = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(1.2, 0.03, 0.16)), wood);
        slat.position.set(0, 0.13 + s * 0.15, -0.4 + k * 0.2);
        slat.castShadow = true;
        g.add(slat);
      }
      for (const bz of [-0.4, 0, 0.4]) {
        const block = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(1.2, 0.1, 0.1)), darkWood);
        block.position.set(0, 0.06 + s * 0.15, bz);
        g.add(block);
      }
    }
    root.add(g);
  };
  pallet(-20, -12.5, 0.3, 3);
  pallet(-21.2, -11.2, 1.2, 2);
  pallet(8.5, -12.8, 0, 1, -1.2);
  pallet(-3.2, 12.4, 0.1, 1);
  pallet(6.2, 12.2, -0.2, 1);
  // Plank benches on cinder blocks along the open side.
  const cinder = mat(0x8c8a84, 0.95);
  for (const [bx, bz] of [[-3.2, 12.4], [6.2, 12.2]] as const) {
    const by = y(bx, bz) + 0.25;
    box(2.6, 0.05, 0.3, darkWood, bx, by + 0.18, bz - 0.2);
    for (const off of [-1.1, 1.1]) box(0.38, 0.2, 0.2, cinder, bx + off, by, bz - 0.2);
  }
  const bagGeo = new THREE.SphereGeometry(0.42, 10, 8);
  const bags: THREE.Matrix4[] = [];
  for (const [bx, bz] of [[-13.6, -12.6], [-12.8, -12.9], [4.8, -13], [22, 12.6], [21.3, 13.1], [-22.4, 12.8], [-30, -12.5], [30.6, -12.8]] as const) {
    bags.push(placeMatrix(bx, y(bx, bz) + 0.25, bz, rand() * 6, [1, 0.7 + rand() * 0.3, 0.9]));
  }
  scatter(kit, bagGeo, keep(kit, new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.3, metalness: 0.1 })), bags, { shadow: true, name: 'riverdale-trash-bags' });
  const packGeo = new THREE.BoxGeometry(0.34, 0.44, 0.22);
  packGeo.translate(0, 0.22, 0);
  const packs: THREE.Matrix4[] = [];
  const packColors: THREE.Color[] = [];
  for (const [px, pz] of [[-16.6, -3.6], [-16.7, 0.6], [16.6, 2], [-6.2, -11], [-9.6, -11.1], [10.4, 9], [-1.8, -8.3]] as const) {
    packs.push(placeMatrix(px, y(px, pz), pz, rand() * 6.28, 1, [rand() < 0.4 ? 1.2 : 0, 0]));
    packColors.push(new THREE.Color().setHSL(rand(), 0.5, 0.35));
  }
  scatter(kit, packGeo, keep(kit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })), packs, { colors: packColors, name: 'riverdale-backpacks' });
  box(0.7, 0.42, 0.42, mat(0x2f6fb0, 0.4), -14.8, y(-14.8, -6.2), -6.2, 0.4);
  box(0.7, 0.42, 0.42, mat(0xc8382a, 0.4), 13.8, y(13.8, 8.6), 8.6, -0.3);

  // Folding chairs set out and knocked over (these stay; the loose ones are throwables).
  const chairMetal = mat(0x3a3c42, 0.5, 0.5);
  const chair = (x: number, z: number, yaw: number, fallen: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, y(x, z) + (fallen ? 0.22 : 0), z);
    g.rotation.set(fallen ? Math.PI / 2 : 0, yaw, 0);
    const seat = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(0.44, 0.04, 0.42)), chairMetal);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(0.44, 0.36, 0.04)), chairMetal);
    back.position.set(0, 0.75, -0.21);
    g.add(seat, back);
    for (const lx of [-0.2, 0.2]) {
      for (const lz of [-0.19, 0.19]) {
        const leg = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(0.025, 0.45, 0.025)), chairMetal);
        leg.position.set(lx, 0.225, lz);
        g.add(leg);
      }
    }
    root.add(g);
  };
  chair(-15.2, -7.8, 0.4, false);
  chair(-10.4, -8, -0.3, false);
  chair(14.4, 11.6, 2.8, false);
  chair(9.8, 11.4, 3.3, true);
  chair(-4.6, 6.2, 1.2, true);

  // --- Floor glow under the coloured lights ---------------------------------------------
  const glowTexture = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  kit.textures.push(glowTexture);
  const floorGlow = (x: number, z: number, color: number, r: number, strength: number) => {
    const m = keep(kit, new THREE.MeshBasicMaterial({ map: glowTexture, color: new THREE.Color(color).multiplyScalar(strength), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
    const plane = new THREE.Mesh(keepGeo(kit, new THREE.PlaneGeometry(r * 2, r * 2)), m);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, y(x, z) + 0.04, z);
    plane.renderOrder = 1;
    plane.userData.glow = true;
    root.add(plane);
    return m;
  };

  // --- Coloured lights --------------------------------------------------------------------
  const lights: PartyLight[] = [];
  const addLight = (x: number, h: number, z: number, color: number, intensity: number, distance: number, pulse: number) => {
    const light = new THREE.PointLight(color, intensity, distance, 1.7);
    light.position.set(x, y(x, z) + h, z);
    root.add(light);
    lights.push({ light, base: intensity, pulse, phase: rand() * 6.28 });
  };
  addLight(0, 2.6, -7.4, PINK, 34, 17, 0.18);
  addLight(-12, 2.4, -1.6, PURPLE, 26, 15, 0.14);
  addLight(12, 2.4, 3.8, BLUE, 26, 15, 0.14);
  addLight(-7, 5.0, 5, AMBER, 15, 15, 0);
  addLight(7, 5.0, -4, AMBER, 15, 15, 0);
  addLight(0, 4.8, 11, AMBER, 12, 14, 0);
  addLight(-26, 3.2, -8, PURPLE, 14, 14, 0.1);
  const glows = [
    floorGlow(0, -6.8, PINK, 4.5, 0.55),
    floorGlow(-11.5, -1.4, PURPLE, 3.8, 0.5),
    floorGlow(11.5, 3.6, BLUE, 3.8, 0.5),
  ];

  // --- String lights -----------------------------------------------------------------------
  const bulbGeo = keepGeo(kit, new THREE.SphereGeometry(0.055, 6, 4));
  const bulbMat = keep(kit, new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(2.2) }));
  const wireMat = keep(kit, new THREE.LineBasicMaterial({ color: 0x141210 }));
  const strands: Strand[] = [];
  const top = RIVERDALE.strutY - 0.45;
  const runs: [number, number, number, number][] = [
    [-13.5, -13.5, -4.5, 13.5],
    [-4.5, -13.5, 4.5, 13.5],
    [4.5, -13.5, 13.5, 13.5],
    [13.5, -13.5, -13.5, 13.5],
    [-22.5, 4.5, 22.5, 4.5],
    [-22.5, -4.5, 22.5, -4.5],
  ];
  const wire: number[] = [];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(8, Math.round(len / 0.8));
    const sag = 0.5 + len * 0.03;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      points.push(new THREE.Vector3(ax + (bx - ax) * t, top - Math.sin(Math.PI * t) * sag, az + (bz - az) * t));
    }
    for (let i = 0; i < points.length - 1; i += 1) wire.push(points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z);
    const mesh = new THREE.InstancedMesh(bulbGeo, bulbMat, points.length);
    points.forEach((p, i) => mesh.setMatrixAt(i, placeMatrix(p.x, p.y - 0.06, p.z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'riverdale-string-lights';
    root.add(mesh);
    strands.push({ mesh, start: 0, points, mid: points[Math.floor(points.length / 2)].clone(), wobble: 0 });
  }
  const wireGeo = keepGeo(kit, new THREE.BufferGeometry());
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  root.add(new THREE.LineSegments(wireGeo, wireMat));

  // --- Battery LEDs ----------------------------------------------------------------------
  const leds: Led[] = [];
  const ledBody = keepGeo(kit, new THREE.CylinderGeometry(0.07, 0.08, 0.16, 10));
  const ledCap = keepGeo(kit, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10));
  const addLed = (x: number, z: number, color: number, lift = 0) => {
    const by = y(x, z) + lift;
    const body = new THREE.Mesh(ledBody, plastic);
    body.position.set(x, by + 0.08, z);
    body.userData.led = true;
    const material = keep(kit, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4) }));
    const cap = new THREE.Mesh(ledCap, material);
    cap.position.set(x, by + 0.185, z);
    cap.userData.led = true;
    root.add(body, cap);
    leds.push({ x, z, cap, material, color: material.color.clone(), out: false });
  };
  addLed(-11.2, -6.4, PINK, 0.75);
  addLed(12.8, 10, BLUE, 0.75);
  addLed(-1.6, -9.3, PURPLE, 0.73);
  addLed(1.6, -9.3, PINK, 0.73);
  addLed(-16.4, -4.6, PURPLE);
  addLed(16.4, 6.4, BLUE);
  addLed(-6.4, 11.6, AMBER);
  addLed(7.4, 11.4, PINK);
  addLed(-21.6, -12.2, BLUE);
  addLed(20.6, -9.6, PURPLE);

  // Batch what never moves so the whole party is a few draw calls.
  kit.geometries.push(...mergeStatic(root, new Set()));

  const throwSpots: ThrowSpot[] = [
    { kind: 'chair', x: -14.2, z: -7.2 },
    { kind: 'chair', x: -9.6, z: -7.4 },
    { kind: 'chair', x: 13.2, z: 11.4 },
    { kind: 'chair', x: 15.6, z: 0.8 },
    { kind: 'chair', x: -15.6, z: 2.4 },
    { kind: 'chair', x: 3.4, z: 9 },
    { kind: 'bottle', x: -12.6, z: -5.2 },
    { kind: 'bottle', x: 11.4, z: 8.8 },
    { kind: 'bottle', x: -2.6, z: -8 },
    { kind: 'bottle', x: 2.8, z: -7.8 },
    { kind: 'bottle', x: -6, z: 3 },
    { kind: 'bottle', x: 8, z: -1 },
    { kind: 'bottle', x: -18.6, z: 6 },
    { kind: 'bottle', x: 19.2, z: -4 },
    { kind: 'plank', x: -20.6, z: -9.6 },
    { kind: 'plank', x: 9.6, z: -11.8 },
    { kind: 'plank', x: -28, z: 8 },
    { kind: 'plank', x: 27, z: 6 },
    { kind: 'crate', x: 15.8, z: -11.2 },
    { kind: 'crate', x: -24, z: -2 },
    { kind: 'crate', x: 24.5, z: -1 },
    { kind: 'can', x: -22.2, z: 11.8 },
    { kind: 'can', x: 23, z: 11.6 },
  ];

  const animate = (time: number, dt: number) => {
    for (const p of lights) {
      if (p.pulse > 0) p.light.intensity = p.base * (1 + Math.sin(time * 3.6 + p.phase) * p.pulse);
    }
    const beat = 0.5 + 0.5 * Math.sin(time * 3.6);
    glows.forEach((g, i) => g.opacity = 0.75 + 0.25 * Math.sin(time * 3.6 + i * 1.7));
    ringMat.color.setHex(PINK).multiplyScalar(1 + beat * 0.8);
    for (const s of strands) {
      if (s.wobble <= 0.001) continue;
      s.wobble = Math.max(0, s.wobble - dt * 0.6);
      const n = s.points.length;
      s.points.forEach((p, i) => {
        const along = Math.sin((Math.PI * i) / (n - 1));
        const sway = Math.sin(time * 7 + i * 0.3) * s.wobble * along;
        s.mesh.setMatrixAt(i, placeMatrix(p.x + sway * 0.4, p.y - 0.06 + Math.abs(sway) * 0.15, p.z + sway * 0.3));
      });
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  /** Combat nearby: battery lights get knocked out, string lights swing. */
  const impact = (x: number, z: number, radius: number) => {
    for (const led of leds) {
      if (led.out || (led.x - x) ** 2 + (led.z - z) ** 2 > (radius + 0.6) ** 2) continue;
      led.out = true;
      led.material.color.setRGB(0.04, 0.04, 0.05);
    }
    for (const s of strands) {
      const d = s.points.reduce((best, p) => Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2), Infinity);
      if (d < (radius + 3) ** 2) s.wobble = Math.min(1, s.wobble + 0.5);
    }
  };

  const reset = () => {
    for (const led of leds) {
      led.out = false;
      led.material.color.copy(led.color);
    }
  };

  return { throwSpots, animate, impact, reset, lights, dj: { x: 0, z: djZ } };
}
