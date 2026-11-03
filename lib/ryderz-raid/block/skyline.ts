import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paintTexture, seeded, textTexture } from '../render/surfaces';

/**
 * Downtown beyond the four playable blocks: a night sky with low cloud lit
 * from below, a skyline of towers with lit windows, a street grid of sodium
 * lamps between them, and rain. Nothing here is reachable, so none of it
 * carries collision; it exists to make the Block read as a city at night.
 */

/** Window module the facade textures are painted at: one cell is this wide and one floor tall. */
const WINDOW_W = 3.2;
const FLOOR_H = 3.6;
const CELLS = 8;
const TEX_W = WINDOW_W * CELLS;
const TEX_H = FLOOR_H * CELLS;

/** Nearest the skyline comes to the playable city. The 2×2 district pad ends at ±96. */
const SKYLINE_INNER = 104;
const SKYLINE_OUTER = 470;
const CELL = 28;

interface FacadeStyle {
  base: [number, number, number];
  pilaster?: [number, number, number];
  spandrel?: [number, number, number];
  window: { w: number; h: number };
  lit: number;
  warm: [number, number, number];
  cool: [number, number, number];
  coolShare: number;
  brick?: boolean;
}

const STYLES: FacadeStyle[] = [
  {
    base: [54, 46, 42],
    pilaster: [66, 58, 54],
    window: { w: 0.42, h: 0.62 },
    lit: 0.36,
    warm: [255, 206, 140],
    cool: [214, 228, 255],
    coolShare: 0.2,
  },
  {
    base: [16, 22, 36],
    spandrel: [12, 16, 26],
    window: { w: 0.88, h: 0.6 },
    lit: 0.48,
    warm: [255, 226, 180],
    cool: [182, 212, 255],
    coolShare: 0.7,
  },
  {
    base: [48, 36, 34],
    window: { w: 0.5, h: 0.55 },
    lit: 0.27,
    warm: [255, 176, 96],
    cool: [120, 176, 255],
    coolShare: 0.1,
    brick: true,
  },
];

function facadeMaps(style: FacadeStyle, seed: number) {
  const size = 1024;
  const cell = size / CELLS;
  const rand = seeded(seed);
  const lit: boolean[] = [];
  const tone: number[] = [];
  const cool: boolean[] = [];
  for (let i = 0; i < CELLS * CELLS; i += 1) {
    lit.push(rand() < style.lit);
    tone.push(0.55 + rand() * 0.45);
    cool.push(rand() < style.coolShare);
  }
  const paneRect = (cx: number, cy: number) => {
    const w = cell * style.window.w;
    const h = cell * style.window.h;
    return { x: cx * cell + (cell - w) / 2, y: cy * cell + (cell - h) / 2 + cell * 0.06, w, h };
  };
  const map = paintTexture(
    size,
    (ctx, s) => {
      ctx.fillStyle = `rgb(${style.base.join(',')})`;
      ctx.fillRect(0, 0, s, s);
      const grain = seeded(seed + 3);
      for (let i = 0; i < 9000; i += 1) {
        const d = Math.floor((grain() - 0.5) * 22);
        ctx.fillStyle = `rgb(${style.base[0] + d}, ${style.base[1] + d}, ${style.base[2] + d})`;
        ctx.fillRect(grain() * s, grain() * s, 1 + grain() * 3, 1 + grain() * 3);
      }
      if (style.brick) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        for (let y = 0; y < s; y += 7) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(s, y);
          ctx.stroke();
        }
      }
      if (style.pilaster) {
        ctx.fillStyle = `rgb(${style.pilaster.join(',')})`;
        for (let x = 0; x < CELLS; x += 1) ctx.fillRect(x * cell, 0, cell * 0.12, s);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        for (let x = 0; x < CELLS; x += 1) ctx.fillRect(x * cell + cell * 0.12, 0, 3, s);
      }
      if (style.spandrel) {
        ctx.fillStyle = `rgb(${style.spandrel.join(',')})`;
        for (let y = 0; y < CELLS; y += 1) ctx.fillRect(0, y * cell, s, cell * 0.22);
        ctx.fillStyle = 'rgba(120,140,170,0.18)';
        for (let y = 0; y < CELLS; y += 1) ctx.fillRect(0, y * cell + cell * 0.22, s, 2);
      }
      for (let cy = 0; cy < CELLS; cy += 1) {
        for (let cx = 0; cx < CELLS; cx += 1) {
          const i = cy * CELLS + cx;
          const r = paneRect(cx, cy);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
          if (lit[i]) {
            const c = cool[i] ? style.cool : style.warm;
            const t = tone[i];
            ctx.fillStyle = `rgb(${Math.round(c[0] * t)}, ${Math.round(c[1] * t)}, ${Math.round(c[2] * t)})`;
          } else {
            ctx.fillStyle = `rgb(${18 + Math.round(tone[i] * 14)}, ${22 + Math.round(tone[i] * 14)}, ${34 + Math.round(tone[i] * 16)})`;
          }
          ctx.fillRect(r.x, r.y, r.w, r.h);
          // A sill catches the light below every window.
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(r.x - 2, r.y + r.h, r.w + 4, 2);
        }
      }
    },
    { seed, srgb: true },
  );
  const emissiveMap = paintTexture(
    size,
    (ctx, s) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, s, s);
      for (let cy = 0; cy < CELLS; cy += 1) {
        for (let cx = 0; cx < CELLS; cx += 1) {
          const i = cy * CELLS + cx;
          if (!lit[i]) continue;
          const r = paneRect(cx, cy);
          const c = cool[i] ? style.cool : style.warm;
          const t = tone[i];
          ctx.fillStyle = `rgb(${Math.round(c[0] * t)}, ${Math.round(c[1] * t)}, ${Math.round(c[2] * t)})`;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          // Blinds: a dark band across some lit windows.
          if (t < 0.68) {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(r.x, r.y, r.w, r.h * 0.45);
          }
        }
      }
    },
    { seed: seed + 1, srgb: true },
  );
  return { map, emissiveMap };
}

/** Box with facade UVs in window units and a dark roof, ready to merge. */
function towerBox(w: number, h: number, d: number, x: number, y: number, z: number, uOff: number, vOff: number, tint: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const uSpanX = w / TEX_W;
  const uSpanZ = d / TEX_W;
  const vSpan = h / TEX_H;
  // Face order: +x, -x, +y, -y, +z, -z. Four vertices each: (0,1) (1,1) (0,0) (1,0).
  for (let face = 0; face < 6; face += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      const su = v === 1 || v === 3 ? 1 : 0;
      const sv = v === 0 || v === 1 ? 1 : 0;
      if (face === 2 || face === 3) {
        uv.setXY(i, 0.002, 0.002);
        continue;
      }
      const span = face < 2 ? uSpanZ : uSpanX;
      uv.setXY(i, uOff + su * span, vOff + sv * vSpan);
    }
  }
  const colors = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 1) colors[i] = tint;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(x, y, z);
  return geo;
}

interface TowerSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  style: number;
  tiers: number;
  tint: number;
  waterTower: boolean;
  antenna: number;
  seed: number;
}

function planTowers() {
  const rand = seeded(4242);
  const towers: TowerSpec[] = [];
  for (let gx = -SKYLINE_OUTER; gx <= SKYLINE_OUTER; gx += CELL) {
    for (let gz = -SKYLINE_OUTER; gz <= SKYLINE_OUTER; gz += CELL) {
      const ring = Math.max(Math.abs(gx), Math.abs(gz));
      if (ring < SKYLINE_INNER) continue;
      if (rand() < 0.16) continue;
      const x = gx + (rand() - 0.5) * 6;
      const z = gz + (rand() - 0.5) * 6;
      const w = 11 + rand() * 12;
      const d = 11 + rand() * 12;
      const far = Math.min(1, (ring - SKYLINE_INNER) / (SKYLINE_OUTER - SKYLINE_INNER));
      // Mid-rises hug the playable blocks; the towers climb with distance so every ring shows above the last.
      let h = 18 + rand() * 26 + far * 95 + rand() * rand() * 70;
      if (ring < SKYLINE_INNER + CELL * 1.5) h = Math.min(h, 42);
      h = Math.min(h, 215);
      const style = Math.floor(rand() * STYLES.length);
      const tiers = h > 140 ? 3 : h > 80 ? 2 : 1;
      towers.push({
        x,
        z,
        w,
        d,
        h,
        style,
        tiers,
        tint: 0.72 + rand() * 0.4,
        waterTower: h < 70 && rand() < 0.45,
        antenna: h > 110 && rand() < 0.5 ? 8 + rand() * 18 : 0,
        seed: Math.floor(rand() * 1000),
      });
    }
  }
  return towers;
}

export interface Skyline {
  group: THREE.Group;
  animate: (time: number) => void;
  dispose: () => void;
}

export function buildSkyline(): Skyline {
  const group = new THREE.Group();
  group.name = 'skyline';
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const towers = planTowers();
  const byStyle: THREE.BufferGeometry[][] = STYLES.map(() => []);
  const roofParts: THREE.BufferGeometry[] = [];
  const beaconParts: THREE.BufferGeometry[] = [];

  for (const t of towers) {
    const rand = seeded(t.seed);
    let w = t.w;
    let d = t.d;
    let y0 = 0;
    for (let tier = 0; tier < t.tiers; tier += 1) {
      const share = t.tiers === 1 ? 1 : tier === 0 ? 0.55 : tier === 1 ? 0.3 : 0.15;
      const h = Math.max(FLOOR_H * 2, Math.round((t.h * share) / FLOOR_H) * FLOOR_H);
      const uOff = Math.floor(rand() * CELLS) / CELLS;
      const vOff = Math.floor(rand() * CELLS) / CELLS;
      byStyle[t.style].push(towerBox(w, h, d, t.x, y0 + h / 2, t.z, uOff, vOff, t.tint));
      // Parapet lip so each tier top reads as a roof edge.
      const lip = new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6);
      lip.translate(t.x, y0 + h + 0.2, t.z);
      roofParts.push(lip);
      y0 += h;
      w *= 0.72;
      d *= 0.72;
    }
    if (t.waterTower) {
      const px = t.x + (rand() - 0.5) * t.w * 0.4;
      const pz = t.z + (rand() - 0.5) * t.d * 0.4;
      const tank = new THREE.CylinderGeometry(1.7, 1.9, 3.2, 10);
      tank.translate(px, y0 + 3.4, pz);
      const lid = new THREE.ConeGeometry(1.9, 1.1, 10);
      lid.translate(px, y0 + 5.55, pz);
      const legs = new THREE.CylinderGeometry(0.9, 1.4, 1.8, 6, 1, true);
      legs.translate(px, y0 + 0.9, pz);
      roofParts.push(tank, lid, legs);
    }
    // Rooftop plant.
    const units = 1 + Math.floor(rand() * 3);
    for (let u = 0; u < units; u += 1) {
      const box = new THREE.BoxGeometry(1.6 + rand() * 2, 1.2 + rand() * 1.4, 1.6 + rand() * 2);
      box.translate(t.x + (rand() - 0.5) * w * 0.8, y0 + 0.9, t.z + (rand() - 0.5) * d * 0.8);
      roofParts.push(box);
    }
    if (t.antenna > 0) {
      const mast = new THREE.CylinderGeometry(0.12, 0.3, t.antenna, 6);
      mast.translate(t.x, y0 + t.antenna / 2, t.z);
      roofParts.push(mast);
      const light = new THREE.SphereGeometry(0.55, 8, 6);
      light.translate(t.x, y0 + t.antenna + 0.3, t.z);
      beaconParts.push(light);
    } else if (t.h > 60) {
      const light = new THREE.SphereGeometry(0.45, 8, 6);
      light.translate(t.x + w / 2 - 0.6, y0 + 0.6, t.z - d / 2 + 0.6);
      beaconParts.push(light);
    }
  }

  const styleMaterials: THREE.Material[] = [];
  STYLES.forEach((style, i) => {
    const maps = facadeMaps(style, 900 + i * 17);
    if (maps.map) textures.push(maps.map);
    if (maps.emissiveMap) textures.push(maps.emissiveMap);
    const material = new THREE.MeshStandardMaterial({
      map: maps.map,
      emissiveMap: maps.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      vertexColors: true,
      roughness: style.spandrel ? 0.35 : 0.78,
      metalness: style.spandrel ? 0.35 : 0.05,
      envMapIntensity: 0.6,
    });
    materials.push(material);
    styleMaterials.push(material);
    if (!byStyle[i].length) return;
    const merged = mergeGeometries(byStyle[i], false);
    byStyle[i].forEach((g) => g.dispose());
    if (!merged) return;
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1b1a21, roughness: 0.85, metalness: 0.15 });
  materials.push(roofMat);
  const roofGeo = mergeGeometries(roofParts, false);
  roofParts.forEach((g) => g.dispose());
  if (roofGeo) {
    geometries.push(roofGeo);
    const roofs = new THREE.Mesh(roofGeo, roofMat);
    roofs.frustumCulled = false;
    group.add(roofs);
  }

  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(2.2) });
  materials.push(beaconMat);
  const beaconGeo = mergeGeometries(beaconParts, false);
  beaconParts.forEach((g) => g.dispose());
  if (beaconGeo) {
    geometries.push(beaconGeo);
    const beacons = new THREE.Mesh(beaconGeo, beaconMat);
    beacons.frustumCulled = false;
    group.add(beacons);
  }

  // --- Hero towers ----------------------------------------------------------
  const hero = new THREE.MeshStandardMaterial({
    color: 0x2a2630,
    roughness: 0.4,
    metalness: 0.5,
    envMapIntensity: 1.2,
  });
  materials.push(hero);
  // Art-deco spire to the north-west, crowned in the Ryderz signal green.
  {
    const base = { x: -330, z: -360 };
    const spireParts: THREE.BufferGeometry[] = [];
    const steps = [
      [46, 46, 70],
      [38, 38, 60],
      [30, 30, 50],
      [22, 22, 40],
      [14, 14, 30],
    ];
    let y = 0;
    const styleGeo: THREE.BufferGeometry[] = [];
    steps.forEach(([w, d, h], i) => {
      styleGeo.push(towerBox(w, h, d, base.x, y + h / 2, base.z, (i * 3) / CELLS, 0, 0.9));
      const lip = new THREE.BoxGeometry(w + 1, 0.8, d + 1);
      lip.translate(base.x, y + h + 0.3, base.z);
      spireParts.push(lip);
      y += h;
    });
    const spire = new THREE.ConeGeometry(6, 36, 8);
    spire.translate(base.x, y + 18, base.z);
    spireParts.push(spire);
    const mergedSteps = mergeGeometries(styleGeo, false);
    styleGeo.forEach((g) => g.dispose());
    if (mergedSteps) {
      geometries.push(mergedSteps);
      const mesh = new THREE.Mesh(mergedSteps, styleMaterials[0] ?? hero);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    const mergedSpire = mergeGeometries(spireParts, false);
    spireParts.forEach((g) => g.dispose());
    if (mergedSpire) {
      geometries.push(mergedSpire);
      const mesh = new THREE.Mesh(mergedSpire, hero);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    const crownMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6dff9e).multiplyScalar(2.6) });
    materials.push(crownMat);
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.TorusGeometry(7.5 - i * 1.8, 0.35, 6, 32);
      ring.rotateX(Math.PI / 2);
      ring.translate(base.x, y + 4 + i * 9, base.z);
      geometries.push(ring);
      const mesh = new THREE.Mesh(ring, crownMat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    const tip = new THREE.SphereGeometry(1.4, 10, 8);
    tip.translate(base.x, y + 36.5, base.z);
    geometries.push(tip);
    group.add(new THREE.Mesh(tip, crownMat));
  }
  // Billboard tower to the south-east, carrying the brand across the skyline.
  {
    const base = { x: 290, z: 330 };
    const body = towerBox(42, 126, 34, base.x, 63, base.z, 0, 0, 1);
    geometries.push(body);
    const mesh = new THREE.Mesh(body, styleMaterials[1] ?? hero);
    mesh.frustumCulled = false;
    group.add(mesh);
    const sign = textTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#07040c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#6dff9e';
      ctx.font = 'bold 150px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('THOSE RYDERZ', w / 2, h / 2 + 8);
      ctx.strokeStyle = '#ff5f9e';
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, w - 28, h - 28);
    });
    if (sign) {
      textures.push(sign);
      const signMat = new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(0xffffff).multiplyScalar(1.9) });
      materials.push(signMat);
      const plane = new THREE.PlaneGeometry(52, 13);
      geometries.push(plane);
      const board = new THREE.Mesh(plane, signMat);
      board.position.set(base.x, 134, base.z);
      board.rotation.y = Math.atan2(-base.x, -base.z);
      board.frustumCulled = false;
      group.add(board);
      const frame = new THREE.BoxGeometry(54, 15, 1.2);
      geometries.push(frame);
      const frameMesh = new THREE.Mesh(frame, roofMat);
      frameMesh.position.copy(board.position);
      frameMesh.rotation.y = board.rotation.y;
      frameMesh.translateZ(-0.8);
      group.add(frameMesh);
    }
  }

  // --- Street grid of sodium lamps between the towers --------------------------
  {
    const spots: THREE.Vector3[] = [];
    const rand = seeded(99);
    for (let line = -SKYLINE_OUTER - CELL / 2; line <= SKYLINE_OUTER + CELL / 2; line += CELL) {
      for (let along = -SKYLINE_OUTER; along <= SKYLINE_OUTER; along += 14) {
        if (rand() < 0.35) continue;
        if (Math.max(Math.abs(line), Math.abs(along)) < SKYLINE_INNER - CELL / 2) continue;
        spots.push(new THREE.Vector3(line, 7.5, along));
        spots.push(new THREE.Vector3(along, 7.5, line));
      }
    }
    const lampGeo = new THREE.SphereGeometry(0.45, 6, 5);
    geometries.push(lampGeo);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(2.4) });
    materials.push(lampMat);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
    });
    lamps.instanceMatrix.needsUpdate = true;
    lamps.frustumCulled = false;
    group.add(lamps);
  }

  // Outer ground: dark wet asphalt out to the horizon so the districts never float.
  const outerGeo = new THREE.PlaneGeometry(SKYLINE_OUTER * 2.4, SKYLINE_OUTER * 2.4);
  outerGeo.rotateX(-Math.PI / 2);
  geometries.push(outerGeo);
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x14131a, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.8 });
  materials.push(outerMat);
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.y = -0.06;
  outer.receiveShadow = true;
  group.add(outer);

  const animate = (time: number) => {
    const blink = Math.sin(time * 2.4) > 0.55 ? 2.6 : 0.5;
    beaconMat.color.setHex(0xff2a2a).multiplyScalar(blink);
  };

  return {
    group,
    animate,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

export function buildNightSky(radius = 950) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      time: { value: 0 },
      zenith: { value: new THREE.Color(0x05050f) },
      mid: { value: new THREE.Color(0x151430) },
      glow: { value: new THREE.Color(0x6a3a4c) },
      haze: { value: new THREE.Color(0x3a2440) },
      moonDir: { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 zenith;
      uniform vec3 mid;
      uniform vec3 glow;
      uniform vec3 haze;
      uniform vec3 moonDir;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(mid, zenith, smoothstep(0.05, 0.75, y));
        // Light pollution from the city below washes the horizon warm.
        float pollution = pow(1.0 - clamp(y, 0.0, 1.0), 7.0);
        col = mix(col, glow, pollution * 0.9);
        col = mix(col, haze, smoothstep(0.0, -0.25, y));
        // Stars behind the cloud deck.
        vec2 cell = floor(d.xz / max(y, 0.05) * 90.0);
        float star = step(0.995, hash(cell)) * smoothstep(0.12, 0.5, y);
        // Low cloud deck, lit from beneath by the streets.
        vec2 sky = d.xz / (y + 0.18);
        float cloud = fbm(sky * 1.6 + vec2(time * 0.012, time * 0.006));
        float deck = smoothstep(0.42, 0.72, cloud) * smoothstep(0.0, 0.18, y);
        vec3 cloudCol = mix(glow * 1.15, mid * 0.6, smoothstep(0.1, 0.6, y));
        col = mix(col, cloudCol, deck * 0.85);
        col += vec3(0.9, 0.92, 1.0) * star * (1.0 - deck) * 0.7;
        // Moon with a soft halo.
        float m = dot(d, moonDir);
        float disc = smoothstep(0.9975, 0.9985, m);
        float halo = pow(max(m, 0.0), 180.0) * 0.55 + pow(max(m, 0.0), 24.0) * 0.12;
        col += vec3(0.78, 0.86, 1.0) * (disc * 2.4 + halo) * (1.0 - deck * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return {
    mesh,
    animate: (time: number) => {
      material.uniforms.time.value = time;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Rain
// ---------------------------------------------------------------------------

export function buildRain(count = 5200, half = 135, height = 58) {
  const rand = seeded(31);
  const positions = new Float32Array(count * 2 * 3);
  const tips = new Float32Array(count * 2);
  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const x = (rand() - 0.5) * half * 2;
    const z = (rand() - 0.5) * half * 2;
    const y = rand() * height;
    const s = rand();
    for (let v = 0; v < 2; v += 1) {
      const j = i * 2 + v;
      positions[j * 3] = x;
      positions[j * 3 + 1] = y;
      positions[j * 3 + 2] = z;
      tips[j] = v;
      seeds[j] = s;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('tip', new THREE.BufferAttribute(tips, 1));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), Math.hypot(half, half, height));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, height: { value: height } },
    vertexShader: `
      attribute float tip;
      attribute float seed;
      uniform float time;
      uniform float height;
      varying float vFade;
      void main() {
        float speed = 19.0 + seed * 9.0;
        float fall = mod(position.y - time * speed, height);
        // Wind leans every streak the same way; the lean grows with the drop.
        float lean = (height - fall) * 0.07;
        vec3 p = vec3(position.x + lean, fall + tip * (0.8 + seed * 0.5), position.z + lean * 0.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        vFade = exp(-dist * 0.035) * (0.35 + 0.65 * tip);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        gl_FragColor = vec4(0.72, 0.8, 0.95, vFade * 0.42);
      }
    `,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  return {
    mesh,
    animate: (time: number) => {
      material.uniforms.time.value = time;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
