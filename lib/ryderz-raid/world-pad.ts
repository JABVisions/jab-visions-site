import * as THREE from 'three';
import type { Obstacle, World } from './world';
import {
  blotches,
  makeSurface,
  paintTexture,
  speckle,
  surfaceMaterial,
  textTexture,
  tiles,
  type SurfaceMaps,
} from './render/surfaces';

/**
 * Training P.A.D. — the Paranormal Activity Division's test facility, built
 * the first time the arena is selected so the city block does not load it.
 *
 * Walkable height is a single surface: the chamber floor, three stair ramps,
 * a mezzanine ring, the observation deck and the laboratory hall. Nothing
 * stacks a floor on top of another walkable cell, which is what the raid's
 * height field can carry.
 *
 * Layout (metres, +X east, +Z south, angles from +X toward +Z):
 *   - Test chamber: a round pit, radius 15.9, floor at 0, walled to the mezzanine.
 *   - Mezzanine: ring 16.15–25.7 at FLOOR, open toward the east loading apron.
 *   - Ring wall at 26.2 encloses the hall, with doors east (corridor) and west (deck).
 *   - East: a corridor at floor level into Containment Bay 02.
 *   - West: stairs up to the observation deck, then a sliding door into the lab hall.
 */

const FLOOR = 4.4;
const CEILING = 10.6;
const CORE_R = 2.35;
const STAIR_HALF = 2.15;
const CHAMBER_R = 15.9;
const MEZZ_IN = 16.15;
const MEZZ_OUT = 25.7;
const WALL_R = 26.2;
/** Half-angle of the east loading apron, where the mezzanine stops. */
const APRON = 0.62;
/** Half-angle of the east corridor mouth in the ring wall. */
const EAST_GAP = Math.asin(3.4 / WALL_R);
/** Half-angle of the west doorway; it matches the observation deck walls. */
const WEST_GAP = Math.asin(8.85 / WALL_R);

interface Barrier {
  obstacle: Obstacle;
  mesh: THREE.Object3D;
}

/** Observation deck meets the west stair at full height. The hall continues west of the door. */
const DECK_EAST = -17.35;
const DECK_WEST = -40.6;
const DECK_HALF_Z = 8.7;
const HALL_EAST = -40.15;
const HALL_WEST = -68.2;
const HALL_HALF_Z = 3.55;
const DOOR_X = -40.4;

/** 0 on the chamber floor, rising through the stairs, FLOOR on the mezzanine, deck, and lab hall. */
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
  if (r >= MEZZ_IN && r <= MEZZ_OUT && Math.abs(Math.atan2(z, x)) > APRON) return FLOOR;
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

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** Polished epoxy floor tile. One texture covers 8 m × 8 m. */
function tileSurface(): SurfaceMaps {
  return makeSurface({
    size: 1024,
    seed: 61,
    normalStrength: 1.6,
    albedo: (ctx, s, rand) => {
      tiles(ctx, s, 8, (r) => {
        const d = Math.floor((r() - 0.5) * 10);
        return `rgb(${150 + d}, ${156 + d}, ${164 + d})`;
      }, '#3e444c', 6, rand);
      speckle(ctx, s, 5000, [142, 148, 156], 24, rand, 1.5);
      blotches(ctx, s, 10, (r) => `rgba(120, 130, 140, ${0.08 + r() * 0.1})`, [80, 240], rand);
    },
    height: (ctx, s, rand) => {
      tiles(ctx, s, 8, () => '#9a9a9a', '#404040', 8, rand);
      speckle(ctx, s, 4000, [154, 154, 154], 14, rand, 1.5);
    },
    roughness: (ctx, s, rand) => {
      tiles(ctx, s, 8, (r) => `rgb(${64 + Math.floor(r() * 18)}, ${64}, ${64})`, '#c8c8c8', 8, rand);
      blotches(ctx, s, 8, (r) => `rgba(150, 150, 150, ${0.2 + r() * 0.3})`, [60, 200], rand);
    },
  });
}

/** Painted steel wall panel. 8 m × 8 m, four panels across with recessed seams. */
function wallSurface(): SurfaceMaps {
  return makeSurface({
    size: 1024,
    seed: 73,
    normalStrength: 2.4,
    albedo: (ctx, s, rand) => {
      tiles(ctx, s, 4, (r) => {
        const d = Math.floor((r() - 0.5) * 8);
        return `rgb(${168 + d}, ${176 + d}, ${186 + d})`;
      }, '#2e353e', 10, rand);
      speckle(ctx, s, 3000, [164, 172, 182], 16, rand, 1.5);
      blotches(ctx, s, 6, (r) => `rgba(90, 100, 110, ${0.06 + r() * 0.08})`, [100, 300], rand);
      // Rivets along each seam.
      ctx.fillStyle = 'rgba(70, 78, 88, 0.9)';
      const pitch = s / 4;
      for (let i = 0; i <= 4; i += 1) {
        for (let k = 0; k < s; k += 48) {
          ctx.beginPath();
          ctx.arc(i * pitch, k + 24, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(k + 24, i * pitch, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    height: (ctx, s, rand) => {
      tiles(ctx, s, 4, () => '#a0a0a0', '#303030', 12, rand);
    },
    roughness: (ctx, s, rand) => {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, 0, s, s);
      blotches(ctx, s, 8, (r) => `rgba(120, 120, 120, ${0.3 + r() * 0.3})`, [80, 240], rand);
    },
  });
}

/** Poured concrete for the plinths and the chamber pit wall. */
function concreteSurface(): SurfaceMaps {
  return makeSurface({
    size: 512,
    seed: 89,
    normalStrength: 1.4,
    albedo: (ctx, s, rand) => {
      ctx.fillStyle = '#7d8086';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 6000, [125, 128, 134], 36, rand, 2);
      blotches(ctx, s, 10, (r) => `rgba(60, 62, 68, ${0.12 + r() * 0.2})`, [40, 160], rand);
      ctx.strokeStyle = 'rgba(40, 42, 48, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, s / 2);
      ctx.lineTo(s, s / 2);
      ctx.stroke();
    },
    height: (ctx, s, rand) => {
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 9000, [140, 140, 140], 60, rand, 2);
      ctx.strokeStyle = '#303030';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, s / 2);
      ctx.lineTo(s, s / 2);
      ctx.stroke();
    },
    roughness: (ctx, s) => {
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(0, 0, s, s);
    },
  });
}

/** Acoustic ceiling grid. 8 m × 8 m. */
function ceilingSurface(): SurfaceMaps {
  return makeSurface({
    size: 512,
    seed: 97,
    normalStrength: 1.8,
    albedo: (ctx, s, rand) => {
      tiles(ctx, s, 8, (r) => {
        const d = Math.floor((r() - 0.5) * 6);
        return `rgb(${64 + d}, ${70 + d}, ${78 + d})`;
      }, '#262c34', 5, rand);
      speckle(ctx, s, 2500, [66, 72, 80], 12, rand, 1.2);
    },
    height: (ctx, s, rand) => {
      tiles(ctx, s, 8, () => '#909090', '#404040', 6, rand);
    },
    roughness: (ctx, s) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, 0, s, s);
    },
  });
}

function tiled(maps: SurfaceMaps, repeat: [number, number], params: THREE.MeshStandardMaterialParameters & { normalAmount?: number } = {}) {
  const copy = (t: THREE.Texture | null) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const set: SurfaceMaps = {
    map: copy(maps.map),
    normalMap: copy(maps.normalMap),
    roughnessMap: copy(maps.roughnessMap),
    textures: [],
  };
  set.textures = [set.map, set.normalMap, set.roughnessMap].filter((t): t is THREE.Texture => Boolean(t));
  const material = surfaceMaterial(set, {
    color: set.map ? 0xffffff : 0x9aa0a8,
    roughness: set.roughnessMap ? 1 : 0.6,
    metalness: 0.05,
    envMapIntensity: 1.1,
    ...params,
  });
  return { material, textures: set.textures };
}

function metal(color: number, emissive = 0x000000, intensity = 0, roughness = 0.38) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.72,
    roughness,
    envMapIntensity: 1.2,
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

function glassMaterial(tint = 0xcfe9f5, opacity = 0.22) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    transparent: true,
    opacity,
    roughness: 0.04,
    metalness: 0.1,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function emissive(color: number, intensity: number, base = 0xf7fbff) {
  return new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 });
}

// ---------------------------------------------------------------------------
// Screens and signage
// ---------------------------------------------------------------------------

type Screen = 'telemetry' | 'vitals' | 'chart' | 'warning';

function screenTexture(kind: Screen, seed: number) {
  return textTexture(512, 288, (ctx, w, h) => {
    const rand = (() => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    ctx.fillStyle = kind === 'warning' ? '#2a0608' : '#04111a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = kind === 'warning' ? 'rgba(255,80,90,0.25)' : 'rgba(57,231,255,0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = kind === 'warning' ? '#ff5a66' : '#9fefff';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textBaseline = 'top';
    const titles: Record<Screen, string> = {
      telemetry: 'SIGNAL TELEMETRY  //  LIVE',
      vitals: 'SPECIMEN VITALS  //  TANK 03',
      chart: 'P.A.D. FACILITY  //  FLOOR 1',
      warning: '!! CONTAINMENT ACTIVE !!',
    };
    ctx.fillText(titles[kind], 16, 12);
    ctx.fillStyle = kind === 'warning' ? 'rgba(255,90,100,0.9)' : 'rgba(57,231,255,0.9)';
    ctx.fillRect(16, 42, w - 32, 2);
    if (kind === 'telemetry') {
      ctx.strokeStyle = '#39e7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w - 32; x += 6) {
        const y = 170 + Math.sin(x * 0.05) * 40 * Math.sin(x * 0.011) + (rand() - 0.5) * 20;
        if (x === 0) ctx.moveTo(16 + x, y);
        else ctx.lineTo(16 + x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ff5f9e';
      ctx.beginPath();
      for (let x = 0; x <= w - 32; x += 6) {
        const y = 200 + Math.cos(x * 0.03) * 30 + (rand() - 0.5) * 12;
        if (x === 0) ctx.moveTo(16 + x, y);
        else ctx.lineTo(16 + x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#9fefff';
      ctx.font = '16px "Courier New", monospace';
      ['AURA 0.84  |  PHASE LOCK', 'HOST ECHO 12.3 Hz', 'DRIFT +0.02'].forEach((line, i) => ctx.fillText(line, 16, 60 + i * 22));
    } else if (kind === 'vitals') {
      ctx.font = '16px "Courier New", monospace';
      const rows = ['PULSE   —   112 bpm', 'TEMP    —   36.1 C', 'RESONANCE  0.67', 'SEDATION   ACTIVE', 'FIELD   STABLE'];
      rows.forEach((row, i) => {
        ctx.fillStyle = i === 3 ? '#8dff6a' : '#9fefff';
        ctx.fillText(row, 16, 60 + i * 26);
      });
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = 'rgba(57,231,255,0.25)';
        ctx.fillRect(300, 62 + i * 26, 190, 14);
        ctx.fillStyle = '#39e7ff';
        ctx.fillRect(300, 62 + i * 26, 60 + rand() * 120, 14);
      }
    } else if (kind === 'chart') {
      ctx.strokeStyle = '#39e7ff';
      ctx.lineWidth = 2;
      const cx = w / 2;
      const cy = h / 2 + 20;
      [26, 44, 70, 86].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(cx - 86, cy);
      ctx.lineTo(cx - 180, cy);
      ctx.moveTo(cx + 86, cy);
      ctx.lineTo(cx + 150, cy);
      ctx.stroke();
      ctx.fillStyle = '#ff5f9e';
      ctx.beginPath();
      ctx.arc(cx + 30 + rand() * 20, cy - 20, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9fefff';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('CHAMBER', cx - 30, cy - 8);
      ctx.fillText('DECK', cx - 170, cy - 20);
      ctx.fillText('BAY 02', cx + 100, cy - 20);
    } else {
      ctx.fillStyle = '#ff5a66';
      ctx.font = 'bold 40px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKDOWN', w / 2, 96);
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText('SPECIMEN 02 — DO NOT APPROACH', w / 2, 160);
      ctx.textAlign = 'left';
    }
  });
}

function signTexture(lines: string[], color: string, bg: string, width = 1024, height = 256) {
  return textTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.min(h / (lines.length + 0.6), (w * 1.6) / Math.max(...lines.map((l) => l.length)));
    ctx.font = `bold ${size}px "Arial Narrow", Impact, sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1)));
  });
}

function hazardTexture() {
  return paintTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#15161a';
      for (let i = -s; i < s * 2; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 32, 0);
        ctx.lineTo(i + 32 + s, s);
        ctx.lineTo(i + s, s);
        ctx.closePath();
        ctx.fill();
      }
    },
    { seed: 1, srgb: true },
  );
}

function sealTexture() {
  return textTexture(1024, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = 'rgba(57, 231, 255, 0.85)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 470, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 380, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(57, 231, 255, 0.9)';
    ctx.font = 'bold 72px "Arial Narrow", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = 'PARANORMAL ACTIVITY DIVISION • UNITED STATES • ';
    for (let i = 0; i < words.length; i += 1) {
      const a = (i / words.length) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * 425, cy + Math.sin(a) * 425);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(words[i], 0, 0);
      ctx.restore();
    }
    ctx.font = 'bold 260px Impact, "Arial Black", sans-serif';
    ctx.fillStyle = 'rgba(215, 246, 255, 0.92)';
    ctx.fillText('P.A.D.', cx, cy + 10);
    ctx.font = 'bold 54px "Courier New", monospace';
    ctx.fillStyle = 'rgba(57, 231, 255, 0.85)';
    ctx.fillText('TEST CHAMBER 01', cx, cy + 190);
    ctx.fillText('RESTRICTED', cx, cy - 190);
  });
}

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------

interface Build {
  group: THREE.Group;
  obstacles: Obstacle[];
  occluders: THREE.Object3D[];
  textures: THREE.Texture[];
  materials: THREE.Material[];
  pulse: THREE.Material[];
  tile: SurfaceMaps;
  wall: SurfaceMaps;
  concrete: SurfaceMaps;
  ceiling: SurfaceMaps;
  screens: Record<Screen, THREE.Material>;
}

function keep(b: Build, material: THREE.Material) {
  b.materials.push(material);
  return material;
}

function addBox(
  b: Build,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  options: { block?: boolean; occlude?: boolean; cast?: boolean; yaw?: number } = {},
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (options.yaw) mesh.rotation.y = options.yaw;
  mesh.castShadow = options.cast ?? false;
  mesh.receiveShadow = true;
  b.group.add(mesh);
  if (options.block ?? true) {
    const c = Math.abs(Math.cos(options.yaw ?? 0));
    const s = Math.abs(Math.sin(options.yaw ?? 0));
    const ex = (c * w + s * d) / 2;
    const ez = (s * w + c * d) / 2;
    b.obstacles.push({ kind: 'box', minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez });
  }
  if (options.occlude) b.occluders.push(mesh);
  return mesh;
}

/** Flat tiled floor. Tiles are one metre; the texture covers eight. */
function floorPlane(b: Build, maps: SurfaceMaps, w: number, d: number, x: number, y: number, z: number, params?: THREE.MeshStandardMaterialParameters) {
  const { material, textures } = tiled(maps, [w / 8, d / 8], params);
  b.textures.push(...textures);
  keep(b, material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  b.group.add(mesh);
  return mesh;
}

/** Ring of floor between two radii over world angles [a0, a1]. */
function ringFloor(b: Build, maps: SurfaceMaps, rIn: number, rOut: number, a0: number, a1: number, y: number) {
  const { material, textures } = tiled(maps, [(rOut * 2) / 8, (rOut * 2) / 8]);
  b.textures.push(...textures);
  keep(b, material);
  const geo = new THREE.RingGeometry(rIn, rOut, 96, 1, -a1, a1 - a0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  b.group.add(mesh);
  return mesh;
}

/**
 * Curved wall over world angles [a0, a1]. Panels tile every 8 m. When
 * `block` is set, a chain of round footprints keeps bodies off the face.
 */
function arcWall(b: Build, maps: SurfaceMaps, r: number, y0: number, y1: number, a0: number, a1: number, options: { block?: boolean; occlude?: boolean; color?: number } = {}) {
  const length = r * (a1 - a0);
  const { material, textures } = tiled(maps, [length / 8, (y1 - y0) / 8], { side: THREE.DoubleSide, color: options.color ?? 0xffffff });
  b.textures.push(...textures);
  keep(b, material);
  const geo = new THREE.CylinderGeometry(r, r, y1 - y0, Math.max(8, Math.ceil(length / 1.2)), 1, true, Math.PI / 2 - a1, a1 - a0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = (y0 + y1) / 2;
  mesh.receiveShadow = true;
  b.group.add(mesh);
  if (options.occlude) b.occluders.push(mesh);
  if (options.block) {
    const step = 1.3 / r;
    for (let a = a0 + step / 2; a < a1; a += step) {
      b.obstacles.push({ kind: 'circle', x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.75 });
    }
  }
  return mesh;
}

/** Thin glowing band following a wall. */
function arcStrip(b: Build, material: THREE.Material, r: number, y: number, a0: number, a1: number, height = 0.12, depth = 0.08) {
  const length = r * (a1 - a0);
  const geo = new THREE.CylinderGeometry(r + depth, r + depth, height, Math.max(8, Math.ceil(length / 1.2)), 1, true, Math.PI / 2 - a1, a1 - a0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  b.group.add(mesh);
  return mesh;
}

/** Glass balustrade along an arc with steel posts; round footprints keep bodies behind it. */
function glassRail(b: Build, glass: THREE.Material, post: THREE.Material, r: number, y: number, a0: number, a1: number, block = true) {
  const length = r * (a1 - a0);
  const panels = Math.max(1, Math.round(length / 1.6));
  const step = (a1 - a0) / panels;
  for (let i = 0; i < panels; i += 1) {
    const a = a0 + step * (i + 0.5);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(r * step - 0.12, 1.0, 0.04), glass);
    panel.position.set(Math.cos(a) * r, y + 0.62, Math.sin(a) * r);
    panel.rotation.y = -a + Math.PI / 2;
    b.group.add(panel);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.12, 8), post);
    const pa = a0 + step * i;
    p.position.set(Math.cos(pa) * r, y + 0.56, Math.sin(pa) * r);
    p.castShadow = true;
    b.group.add(p);
    if (block) b.obstacles.push({ kind: 'circle', x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.62 });
  }
  const cap = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, Math.max(8, Math.ceil(length / 0.6)), a1 - a0), post);
  cap.rotation.x = Math.PI / 2;
  cap.rotation.z = -a1;
  cap.position.y = y + 1.14;
  b.group.add(cap);
}

function monitor(b: Build, screen: THREE.Material, x: number, y: number, z: number, yaw: number, w = 0.62, h = 0.36) {
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.035), keep(b, metal(0x15181d, 0, 0, 0.45)));
  bezel.position.set(x, y, z);
  bezel.rotation.y = yaw;
  bezel.castShadow = true;
  b.group.add(bezel);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen);
  face.position.z = 0.02;
  bezel.add(face);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.6, 0.1), (bezel.material as THREE.Material));
  stand.position.set(0, -h * 0.75, -0.05);
  bezel.add(stand);
  return bezel;
}

/** Workstation: a white bench with two monitors, a keyboard, and a task chair. */
function workstation(b: Build, x: number, y: number, z: number, yaw: number, kinds: [Screen, Screen]) {
  const top = keep(b, new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.3, metalness: 0.05, envMapIntensity: 1 }));
  const frame = keep(b, metal(0x3a4048, 0, 0, 0.5));
  const bench = addBox(b, top, x, y + 0.86, z, 2.4, 0.06, 0.9, { yaw, cast: true });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.78, 0.1), frame);
  legs.position.set(0, -0.42, -0.3);
  legs.castShadow = true;
  bench.add(legs);
  [-0.65, 0.65].forEach((dx, i) => {
    const m = new THREE.Object3D();
    m.position.set(dx, 0.36, -0.22);
    m.rotation.y = (i === 0 ? 0.18 : -0.18) + Math.PI;
    bench.add(m);
    const mon = monitor(b, b.screens[kinds[i]], 0, 0, 0, 0);
    m.add(mon);
  });
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.18), frame);
  keyboard.position.set(0, 0.045, 0.16);
  bench.add(keyboard);
  const chairSeat = keep(b, new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.7 }));
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), chairSeat);
  seat.position.y = 0.5;
  seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.06), chairSeat);
  back.position.set(0, 0.8, 0.24);
  back.castShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), frame);
  stem.position.y = 0.25;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 10), frame);
  base.position.y = 0.03;
  chair.add(seat, back, stem, base);
  const cx = x + Math.sin(yaw) * 0.95;
  const cz = z + Math.cos(yaw) * 0.95;
  chair.position.set(cx, y, cz);
  chair.rotation.y = yaw;
  b.group.add(chair);
  b.obstacles.push({ kind: 'circle', x: cx, z: cz, r: 0.3 });
}

/** Server cabinet with rows of status LEDs. */
function serverRack(b: Build, x: number, y: number, z: number, yaw: number, leds: THREE.Material) {
  const shell = keep(b, metal(0x171a1f, 0, 0, 0.42));
  const cabinet = addBox(b, shell, x, y + 1.1, z, 0.8, 2.2, 1.0, { yaw, cast: true, occlude: true });
  const doorMat = keep(b, metal(0x2a2f36, 0x0b1a22, 0.2, 0.3));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.76, 2.1, 0.03), doorMat);
  door.position.set(0, 0, 0.5);
  cabinet.add(door);
  for (let row = 0; row < 12; row += 1) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.035), leds);
    strip.position.set(0, -0.95 + row * 0.17, 0.52);
    cabinet.add(strip);
  }
  const vents = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), keep(b, new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 })));
  vents.position.set(0, 0.95, 0.52);
  cabinet.add(vents);
}

function sign(b: Build, texture: THREE.Texture | null, w: number, h: number, x: number, y: number, z: number, yaw: number, lit = 1.15) {
  if (!texture) return;
  b.textures.push(texture);
  const material = keep(b, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0xffffff).multiplyScalar(lit) }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  b.group.add(mesh);
}

function lightPanel(b: Build, material: THREE.Material, x: number, y: number, z: number, w: number, d: number, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  b.group.add(mesh);
  return mesh;
}

/** Steel stair with a yellow nosing on every tread and a handrail each side. */
function stair(b: Build, axis: 'x' | 'z', sign: 1 | -1, tread: THREE.Material, nosing: THREE.Material, rail: THREE.Material, blockRails: boolean) {
  const steps = 10;
  const run = 5.3;
  const width = STAIR_HALF * 2 - 0.2;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const along = 12.1 + ((t0 + t1) / 2) * run;
    const y = t1 * FLOOR;
    const depth = run / steps;
    const riser = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? depth : width, FLOOR / steps, axis === 'z' ? depth : width), tread);
    riser.position.set(axis === 'x' ? sign * along : 0, y - FLOOR / steps / 2, axis === 'z' ? sign * along : 0);
    riser.castShadow = true;
    riser.receiveShadow = true;
    b.group.add(riser);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.08 : width, 0.02, axis === 'z' ? 0.08 : width), nosing);
    const edge = 12.1 + t0 * run + 0.04;
    lip.position.set(axis === 'x' ? sign * edge : 0, y + 0.012, axis === 'z' ? sign * edge : 0);
    b.group.add(lip);
  }
  const pitch = Math.atan2(FLOOR, run);
  const length = Math.hypot(FLOOR, run) + 0.4;
  for (const side of [-1, 1]) {
    const offset = side * (STAIR_HALF + 0.12);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, length, 8), rail);
    const mid = 12.1 + run / 2;
    bar.position.set(axis === 'x' ? sign * mid : offset, FLOOR / 2 + 1.0, axis === 'z' ? sign * mid : offset);
    if (axis === 'x') bar.rotation.z = sign * pitch + Math.PI / 2;
    else bar.rotation.x = -sign * pitch + Math.PI / 2;
    b.group.add(bar);
    for (let k = 0; k <= 2; k += 1) {
      const t = k / 2;
      const along = 12.3 + t * (run - 0.4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), rail);
      post.position.set(axis === 'x' ? sign * along : offset, t * FLOOR + 0.5 + (FLOOR / steps) * 0.5, axis === 'z' ? sign * along : offset);
      b.group.add(post);
    }
    if (blockRails) {
      for (let along = 12.4; along < 17.4; along += 0.9) {
        b.obstacles.push({ kind: 'circle', x: axis === 'x' ? sign * along : offset, z: axis === 'z' ? sign * along : offset, r: 0.22 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Observation deck and laboratory hall
// ---------------------------------------------------------------------------

function buildObservationWing(b: Build) {
  const glass = keep(b, glassMaterial(0xb9f6ff, 0.2));
  const tubeGlass = keep(b, glassMaterial(0xd7fbff, 0.3));
  const railMat = keep(b, metal(0xb8c4cc, 0x39e7ff, 0.25, 0.3));
  const trim = keep(b, emissive(0x39e7ff, 1.4, 0x9fdfff));
  const led = keep(b, emissive(0xf4fbff, 1.3));
  const white = keep(b, new THREE.MeshStandardMaterial({ color: 0xf3f6f8, metalness: 0.05, roughness: 0.4, envMapIntensity: 0.9 }));
  const securedMat = keep(b, new THREE.MeshStandardMaterial({ color: 0xc8d0d6, emissive: 0xff3355, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.35 }));
  const dark = keep(b, metal(0x1a2028, 0x061a22, 0.15, 0.45));

  // Deck floor and the porch where the west stair lands.
  floorPlane(b, b.tile, 23.3, 17.4, -28.95, FLOOR + 0.02, 0);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 5.4), railMat);
  porch.position.set(-17.2, FLOOR - 0.02, 0);
  b.group.add(porch);

  // Deck shell: panelled walls, a ceiling with light troughs, and a glass rail over the chamber.
  const wallN = arcWallFlat(b, -29, FLOOR, FLOOR + 4.3, -8.85, 22.6, 'z');
  const wallS = arcWallFlat(b, -29, FLOOR, FLOOR + 4.3, 8.85, 22.6, 'z');
  b.occluders.push(wallN, wallS);
  b.obstacles.push({ kind: 'box', minX: -40.3, maxX: -17.7, minZ: -9.0, maxZ: -8.7 });
  b.obstacles.push({ kind: 'box', minX: -40.3, maxX: -17.7, minZ: 8.7, maxZ: 9.0 });
  const deckCeiling = tiled(b.ceiling, [22.2 / 8, 17.2 / 8]);
  b.textures.push(...deckCeiling.textures);
  keep(b, deckCeiling.material);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(22.2, 17.2), deckCeiling.material);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(-29.4, FLOOR + 4.35, 0);
  b.group.add(ceiling);
  b.occluders.push(ceiling);
  for (let i = 0; i < 4; i += 1) {
    lightPanel(b, led, -22.4 - i * 4.4, FLOOR + 4.25, -3.2, 3.6, 0.5);
    lightPanel(b, led, -22.4 - i * 4.4, FLOOR + 4.25, 3.2, 3.6, 0.5);
  }
  // Glass rail along the open east face, either side of the stair porch.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 5.6), glass);
    rail.position.set(-18.15, FLOOR + 0.62, side * 5.6);
    b.group.add(rail);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 5.7), railMat);
    cap.position.set(-18.15, FLOOR + 1.16, side * 5.6);
    b.group.add(cap);
    b.obstacles.push({ kind: 'box', minX: -18.3, maxX: -18.0, minZ: side > 0 ? 2.8 : -8.4, maxZ: side > 0 ? 8.4 : -2.8 });
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 6.2), glass);
    pane.position.set(-18.15, FLOOR + 2.6, side * 5.4);
    b.group.add(pane);
  }
  // Steel mullions frame the window wall.
  [-8.5, -2.8, 2.8, 8.5].forEach((z) => {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.3, 0.14), dark);
    mullion.position.set(-18.15, FLOOR + 2.15, z);
    b.group.add(mullion);
  });

  // Consoles: three operator desks facing the chamber and the big board.
  const screens: THREE.Mesh[] = [];
  for (const spot of [
    { x: -24.5, z: 6.4, rot: 0, kinds: ['telemetry', 'chart'] as [Screen, Screen] },
    { x: -33.5, z: -6.4, rot: Math.PI, kinds: ['vitals', 'telemetry'] as [Screen, Screen] },
    { x: -37.2, z: 6.55, rot: Math.PI, kinds: ['chart', 'vitals'] as [Screen, Screen] },
  ]) {
    workstation(b, spot.x, FLOOR, spot.z, spot.rot, spot.kinds);
  }
  // Wall board on the north wall: the facility chart.
  const board = monitor(b, b.screens.chart, -29, FLOOR + 2.4, -8.6, 0, 5.2, 2.9);
  screens.push(board);
  const boardB = monitor(b, b.screens.telemetry, -29, FLOOR + 2.4, 8.6, Math.PI, 5.2, 2.9);
  screens.push(boardB);
  sign(b, signTexture(['OBSERVATION DECK', 'LEVEL 1 — AUTHORIZED PERSONNEL'], '#9fefff', '#0b1a22'), 5.4, 1.1, -22.5, FLOOR + 3.6, -8.6, 0);

  const specimens: THREE.Mesh[] = [];
  const tubeColors = [0x7d5cff, 0x3de7ff, 0xff4d8d, 0x8dff6a, 0xffe28a];
  for (const [index, spot] of [
    { x: -24, z: 5.1 },
    { x: -30, z: 5.3 },
    { x: -36, z: 4.8 },
    { x: -27, z: -5.2 },
    { x: -34, z: -5.0 },
  ].entries()) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.3, 16), dark);
    base.position.set(spot.x, FLOOR + 0.15, spot.z);
    base.castShadow = true;
    b.group.add(base);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.5, 20, 1, true), tubeGlass);
    tube.position.set(spot.x, FLOOR + 1.55, spot.z);
    b.group.add(tube);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 16), railMat);
    cap.position.set(spot.x, FLOOR + 2.85, spot.z);
    b.group.add(cap);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 8, 24), trim);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.set(spot.x, FLOOR + 0.32, spot.z);
    b.group.add(glowRing);
    const specimen = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      keep(b, new THREE.MeshStandardMaterial({ color: tubeColors[index % tubeColors.length], emissive: tubeColors[index % tubeColors.length], emissiveIntensity: 1.6, roughness: 0.3 })),
    );
    specimen.position.set(spot.x, FLOOR + 1.3, spot.z);
    b.group.add(specimen);
    specimens.push(specimen);
    b.obstacles.push({ kind: 'circle', x: spot.x, z: spot.z, r: 0.6 });
  }

  // Sliding door on the rear (west) wall. Panels move apart; collision follows them.
  const doorMat = keep(b, metal(0xd5dee6, 0x9fefff, 0.3, 0.3));
  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.35, 1.42), doorMat);
  const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.35, 1.42), doorMat);
  leftPanel.position.set(DOOR_X, FLOOR + 1.7, -0.72);
  rightPanel.position.set(DOOR_X, FLOOR + 1.7, 0.72);
  leftPanel.castShadow = true;
  rightPanel.castShadow = true;
  b.group.add(leftPanel, rightPanel);
  const frameMat = keep(b, metal(0x9fd8e4, 0x39e7ff, 0.8));
  const rearWall = tiled(b.wall, [7 / 8, 4.3 / 8]);
  b.textures.push(...rearWall.textures);
  keep(b, rearWall.material);
  addBox(b, rearWall.material, DOOR_X, FLOOR + 2.15, -5.2, 0.28, 4.3, 7.0, { occlude: true });
  addBox(b, rearWall.material, DOOR_X, FLOOR + 2.15, 5.2, 0.28, 4.3, 7.0, { occlude: true });
  addBox(b, frameMat, DOOR_X, FLOOR + 3.5, 0, 0.22, 0.16, 3.3, { block: false });
  addBox(b, frameMat, DOOR_X, FLOOR + 1.7, -1.7, 0.22, 3.4, 0.16);
  addBox(b, frameMat, DOOR_X, FLOOR + 1.7, 1.7, 0.22, 3.4, 0.16);
  sign(b, signTexture(['LABORATORY WING', 'KEYCARD ACCESS'], '#9fefff', '#0b1a22'), 2.6, 0.6, DOOR_X + 0.16, FLOOR + 3.95, 0, Math.PI / 2);
  const leftHit: Obstacle = { kind: 'box', minX: DOOR_X - 0.2, maxX: DOOR_X + 0.2, minZ: -1.43, maxZ: -0.01 };
  const rightHit: Obstacle = { kind: 'box', minX: DOOR_X - 0.2, maxX: DOOR_X + 0.2, minZ: 0.01, maxZ: 1.43 };
  b.obstacles.push(leftHit, rightHit);

  // White laboratory hall, square in section, ending at a secured door.
  floorPlane(b, b.tile, 28.2, 7.1, -54.2, FLOOR + 0.02, 0, { color: 0xf4f6f8 });
  addBox(b, white, -54.2, FLOOR + 2.05, 3.65, 27.6, 4.1, 0.22, { occlude: true });
  addBox(b, white, -54.2, FLOOR + 2.05, -3.65, 27.6, 4.1, 0.22, { occlude: true });
  const hallCeiling = addBox(b, white, -54.2, FLOOR + 4.15, 0, 27.6, 0.18, 7.1, { block: false, occlude: true });
  hallCeiling.receiveShadow = false;
  for (let i = 0; i < 6; i += 1) {
    lightPanel(b, led, -45.5 - i * 3.6, FLOOR + 4.03, 0, 3.2, 1.1);
  }
  // Lab rooms behind glass: counters, racks and monitors seen through each window.
  for (const [i, spot] of [-48, -56, -63].entries()) {
    for (const side of [-1, 1]) {
      addBox(b, keep(b, metal(0xd5dee6, 0x9fdfff, 0.12, 0.3)), spot, FLOOR + 1.7, side * 3.4, 1.6, 2.6, 0.18);
      const window = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), glass);
      window.position.set(spot, FLOOR + 2.3, side * 3.5);
      window.rotation.y = side > 0 ? Math.PI : 0;
      b.group.add(window);
      // A lit room behind the glass.
      const room = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), b.screens[i % 2 === 0 ? 'vitals' : 'telemetry']);
      room.position.set(spot, FLOOR + 2.3, side * 3.6);
      room.rotation.y = side > 0 ? 0 : Math.PI;
      b.group.add(room);
      sign(b, signTexture([`LAB ${i + 1}${side > 0 ? 'A' : 'B'}`], '#1a2a33', '#dfe8ee', 256, 96), 0.7, 0.26, spot, FLOOR + 3.25, side * 3.5, side > 0 ? Math.PI : 0, 1);
    }
  }
  sign(b, signTexture(['AUTHORIZED PERSONNEL ONLY', 'BIOHAZARD LEVEL 3 BEYOND THIS POINT'], '#ffd23c', '#1a1a1a'), 4.2, 1.0, -44, FLOOR + 3.4, -3.5, 0);
  addBox(b, keep(b, metal(0x8fa0aa, 0x39e7ff, 0.5)), -54.2, FLOOR + 0.08, 2.4, 27, 0.06, 0.08, { block: false });
  // Full end cap so the corridor does not open onto the void. The red panel is the secured door.
  addBox(b, white, HALL_WEST + 0.2, FLOOR + 2.15, 0, 0.36, 4.4, 7.3, { occlude: true });
  const securedDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.15, 2.35), securedMat);
  securedDoor.position.set(HALL_WEST + 0.46, FLOOR + 1.9, 0);
  b.group.add(securedDoor);
  sign(b, signTexture(['SECURED', 'CONTAINMENT LEVEL 4'], '#ff5a66', '#2a0608'), 1.8, 0.45, HALL_WEST + 0.52, FLOOR + 3.7, 0, Math.PI / 2);
  const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.14), keep(b, emissive(0xff3355, 0.9, 0x331015)));
  keypad.position.set(HALL_WEST + 0.5, FLOOR + 1.45, 1.5);
  b.group.add(keypad);

  const deckLight = new THREE.PointLight(0xdaf3ff, 12, 22, 1.6);
  deckLight.position.set(-28, FLOOR + 3.6, 0);
  const deckLightB = new THREE.PointLight(0xffffff, 7, 18, 1.6);
  deckLightB.position.set(-36, FLOOR + 3.4, 1.5);
  const hallLightA = new THREE.PointLight(0xf4f8ff, 9, 18, 1.4);
  hallLightA.position.set(-50, FLOOR + 3.6, 0);
  const hallLightB = new THREE.PointLight(0xf4f8ff, 8, 16, 1.4);
  hallLightB.position.set(-62, FLOOR + 3.6, 0);
  b.group.add(deckLight, deckLightB, hallLightA, hallLightB);

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

/** Straight panelled wall. `axis` is the direction the wall runs along. */
function arcWallFlat(b: Build, cx: number, y0: number, y1: number, cz: number, length: number, axis: 'x' | 'z') {
  const { material, textures } = tiled(b.wall, [length / 8, (y1 - y0) / 8], { side: THREE.DoubleSide });
  b.textures.push(...textures);
  keep(b, material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, y1 - y0), material);
  mesh.position.set(cx, (y0 + y1) / 2, cz);
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  mesh.receiveShadow = true;
  b.group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export function buildPadWorld(): World {
  const group = new THREE.Group();
  group.name = 'TrainingPAD';
  const tile = tileSurface();
  const wall = wallSurface();
  const concrete = concreteSurface();
  const ceiling = ceilingSurface();
  const b: Build = {
    group,
    obstacles: [],
    occluders: [],
    textures: [...tile.textures, ...wall.textures, ...concrete.textures, ...ceiling.textures],
    materials: [],
    pulse: [],
    tile,
    wall,
    concrete,
    ceiling,
    screens: {} as Record<Screen, THREE.Material>,
  };
  (['telemetry', 'vitals', 'chart', 'warning'] as Screen[]).forEach((kind, i) => {
    const texture = screenTexture(kind, 300 + i * 11);
    if (texture) b.textures.push(texture);
    b.screens[kind] = keep(
      b,
      new THREE.MeshBasicMaterial({ map: texture, color: texture ? new THREE.Color(0xffffff).multiplyScalar(1.25) : 0x39e7ff }),
    );
  });
  const { obstacles, occluders, pulse } = b;

  const trimMat = keep(b, emissive(0x39e7ff, 1.5, 0x9fdfff));
  const led = keep(b, emissive(0xf4fbff, 1.35));
  const warmLed = keep(b, emissive(0xfff1dc, 1.8));
  const darkMetal = keep(b, metal(0x1a1f26, 0x0a1a22, 0.1, 0.45));
  const steel = keep(b, metal(0x9aa4ad, 0, 0, 0.28));
  const railGlass = keep(b, glassMaterial(0xb9f6ff, 0.22));
  const barrierMat = keep(b, holo(0x67f0ff, 0.42));
  const hologram = keep(b, holo(0x9aefff, 0.16));
  const ledRows = keep(b, emissive(0x6dff9e, 1.6, 0x1a3a2a));
  pulse.push(hologram, barrierMat);

  // --- Floors -----------------------------------------------------------------
  // One tiled disc covers the chamber, the east apron and the space under the mezzanine.
  {
    const { material, textures } = tiled(tile, [(WALL_R * 2) / 8, (WALL_R * 2) / 8]);
    b.textures.push(...textures);
    keep(b, material);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(WALL_R, 96), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0;
    disc.receiveShadow = true;
    group.add(disc);
    occluders.push(disc);
  }
  // Mezzanine ring at FLOOR, stopping at the east apron.
  ringFloor(b, tile, CHAMBER_R - 0.2, MEZZ_OUT + 0.05, APRON, Math.PI * 2 - APRON, FLOOR);
  // Mezzanine slab edge and its underside.
  {
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(CHAMBER_R, CHAMBER_R, 0.36, 96, 1, true, Math.PI / 2 - (Math.PI * 2 - APRON), Math.PI * 2 - APRON * 2),
      darkMetal,
    );
    slab.position.y = FLOOR - 0.18;
    group.add(slab);
  }

  // Seal and hazard ring on the chamber floor.
  {
    const seal = sealTexture();
    if (seal) {
      b.textures.push(seal);
      const sealMat = keep(b, new THREE.MeshBasicMaterial({ map: seal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), sealMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      group.add(mesh);
    }
    const hazard = hazardTexture();
    if (hazard) {
      b.textures.push(hazard);
      hazard.repeat.set(40, 1);
      const hazardMat = keep(b, new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(CHAMBER_R - 1.1, CHAMBER_R - 0.25, 96), hazardMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.018;
      group.add(ring);
      // Hazard edge along the mezzanine too.
      const upper = new THREE.Mesh(new THREE.RingGeometry(MEZZ_IN, MEZZ_IN + 0.5, 96, 1, -(Math.PI * 2 - APRON), Math.PI * 2 - APRON * 2), hazardMat);
      upper.rotation.x = -Math.PI / 2;
      upper.position.y = FLOOR + 0.03;
      group.add(upper);
    }
    // Floor LED lanes to each stair and to the corridor.
    const lane = (axis: 'x' | 'z', sign: 1 | -1) => {
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 9.2 : 0.08, 0.02, axis === 'z' ? 9.2 : 0.08), trimMat);
        strip.position.set(axis === 'x' ? sign * 7.5 : side * (STAIR_HALF + 0.3), 0.03, axis === 'z' ? sign * 7.5 : side * (STAIR_HALF + 0.3));
        group.add(strip);
      }
    };
    lane('x', -1);
    lane('z', 1);
    lane('z', -1);
    lane('x', 1);
  }

  // --- Chamber pit wall, with openings for the three stairs and the east apron ----
  {
    const g = Math.asin((STAIR_HALF + 0.3) / CHAMBER_R);
    const arcs: [number, number][] = [
      [APRON, Math.PI / 2 - g],
      [Math.PI / 2 + g, Math.PI - g],
      [Math.PI + g, (3 * Math.PI) / 2 - g],
      [(3 * Math.PI) / 2 + g, Math.PI * 2 - APRON],
    ];
    for (const [a0, a1] of arcs) {
      arcWall(b, concrete, CHAMBER_R, 0, FLOOR - 0.36, a0, a1, { block: true, occlude: true, color: 0xb9bec6 });
      arcStrip(b, trimMat, CHAMBER_R, 3.1, a0, a1, 0.08, -0.02);
      // Plinth and wall numbers.
      arcWall(b, concrete, CHAMBER_R + 0.02, 0, 0.9, a0, a1, { color: 0x5a6068 });
    }
    // The apron ends: walls under the mezzanine edge at ±APRON, from the pit wall out to the ring wall.
    for (const s of [-1, 1]) {
      const a = s * APRON;
      const len = MEZZ_OUT - CHAMBER_R + 0.4;
      const mid = (CHAMBER_R + MEZZ_OUT) / 2;
      const { material, textures } = tiled(wall, [len / 8, FLOOR / 8], { side: THREE.DoubleSide });
      b.textures.push(...textures);
      keep(b, material);
      const end = new THREE.Mesh(new THREE.PlaneGeometry(len, FLOOR - 0.36), material);
      end.position.set(Math.cos(a) * mid, (FLOOR - 0.36) / 2, Math.sin(a) * mid);
      end.rotation.y = -a;
      group.add(end);
      occluders.push(end);
      for (let r = CHAMBER_R + 0.3; r < MEZZ_OUT; r += 0.9) {
        obstacles.push({ kind: 'circle', x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.5 });
      }
      // Upper rail at the mezzanine ends.
      const upper = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.04), railGlass);
      upper.position.set(Math.cos(a) * mid, FLOOR + 0.62, Math.sin(a) * mid);
      upper.rotation.y = -a;
      group.add(upper);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.08), steel);
      cap.position.set(Math.cos(a) * mid, FLOOR + 1.16, Math.sin(a) * mid);
      cap.rotation.y = -a;
      group.add(cap);
    }
    // Hazard markings and a bay number on the apron.
    sign(b, signTexture(['LOADING APRON', 'KEEP CLEAR'], '#f2c230', '#15161a'), 4.4, 1.1, Math.cos(APRON + 0.02) * 21, 2.6, Math.sin(APRON + 0.02) * 21 - 0.1, -APRON + Math.PI / 2);
  }

  // --- Stairs -----------------------------------------------------------------
  const treadMat = keep(b, metal(0x6e7680, 0, 0, 0.5));
  const nosingMat = keep(b, emissive(0xffd23c, 0.6, 0xf2c230));
  stair(b, 'x', -1, treadMat, nosingMat, steel, true);
  stair(b, 'z', 1, treadMat, nosingMat, steel, false);
  stair(b, 'z', -1, treadMat, nosingMat, steel, false);

  // --- Core: the specimen column ---------------------------------------------------
  obstacles.push({ kind: 'circle', x: 0, z: 0, r: CORE_R });
  const core = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R + 0.2, CORE_R + 0.4, 0.5, 32), darkMetal);
  plinth.position.y = 0.25;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  occluders.push(plinth);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R - 0.25, CORE_R - 0.25, CEILING - 0.9, 40, 1, true), keep(b, glassMaterial(0xcfefff, 0.14)));
  column.position.y = 0.5 + (CEILING - 0.9) / 2;
  group.add(column);
  for (const y of [0.55, 3.2, 6.4, CEILING - 0.6]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(CORE_R - 0.2, 0.12, 10, 48), steel);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    group.add(collar);
    const band = new THREE.Mesh(new THREE.TorusGeometry(CORE_R - 0.05, 0.03, 8, 48), trimMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y + 0.2;
    group.add(band);
  }
  const coreOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 2), keep(b, new THREE.MeshStandardMaterial({ color: 0xd8f4ff, emissive: 0x9fefff, emissiveIntensity: 1.1, roughness: 0.2 })));
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.05, 8, 48), trimMat);
  coreRing.rotation.x = Math.PI / 2;
  const coreRingB = coreRing.clone();
  coreRingB.rotation.x = 0.4;
  core.add(coreOrb, coreRing, coreRingB);
  core.position.y = 2.6;
  group.add(core);
  const coreLight = new THREE.PointLight(0x9fefff, 9, 20, 1.8);
  coreLight.position.set(0, 2.6, 0);
  group.add(coreLight);

  // --- Ring wall, trim, cameras and ceiling -----------------------------------------
  {
    const arcs: [number, number][] = [
      [EAST_GAP, Math.PI - WEST_GAP],
      [Math.PI + WEST_GAP, Math.PI * 2 - EAST_GAP],
    ];
    for (const [a0, a1] of arcs) {
      arcWall(b, wall, WALL_R, 0, CEILING, a0, a1, { block: true, occlude: true });
      // Dark plinth where the wall meets the mezzanine floor, and the lit trim bands.
      arcWall(b, concrete, WALL_R - 0.02, FLOOR, FLOOR + 1.0, a0, a1, { color: 0x4a515a });
      arcStrip(b, trimMat, WALL_R, FLOOR + 1.05, a0, a1, 0.1, -0.06);
      arcStrip(b, trimMat, WALL_R, CEILING - 0.5, a0, a1, 0.1, -0.06);
      // Conduit runs along the top of the wall.
      arcStrip(b, steel, WALL_R, CEILING - 1.1, a0, a1, 0.22, -0.22);
      arcStrip(b, steel, WALL_R, CEILING - 1.5, a0, a1, 0.22, -0.22);
    }
    // Lettering around the hall.
    sign(b, signTexture(['PARANORMAL ACTIVITY DIVISION'], '#0f1a22', '#dfe8ee', 2048, 256), 14, 1.75, Math.cos(Math.PI / 2 + 0.95) * (WALL_R - 0.2), CEILING - 2.6, Math.sin(Math.PI / 2 + 0.95) * (WALL_R - 0.2), -(Math.PI / 2 + 0.95) - Math.PI / 2, 1);
    sign(b, signTexture(['TEST CHAMBER 01'], '#9fefff', '#0b1a22', 1024, 200), 7, 1.4, Math.cos(-Math.PI / 2 - 0.95) * (WALL_R - 0.2), CEILING - 2.6, Math.sin(-Math.PI / 2 - 0.95) * (WALL_R - 0.2), -(-Math.PI / 2 - 0.95) - Math.PI / 2, 1);
    sign(b, signTexture(['RESTRICTED AREA', 'SURVEILLANCE IN OPERATION'], '#ffd23c', '#1a1a1a'), 4.4, 1.1, Math.cos(0.95) * (WALL_R - 0.2), FLOOR + 3.0, Math.sin(0.95) * (WALL_R - 0.2), -0.95 - Math.PI / 2, 1);
    sign(b, signTexture(['CONTAINMENT BAY 02 →'], '#ffd23c', '#1a1a1a'), 4.2, 1.0, Math.cos(-0.5) * (WALL_R - 0.2), 3.0, Math.sin(-0.5) * (WALL_R - 0.2), 0.5 - Math.PI / 2, 1);
    // Security cameras on the wall.
    for (const a of [0.9, 2.3, -0.9, -2.3]) {
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), darkMetal);
      cam.position.set(Math.cos(a) * (WALL_R - 0.35), CEILING - 1.0, Math.sin(a) * (WALL_R - 0.35));
      cam.rotation.y = -a + Math.PI;
      cam.rotation.x = 0.4;
      group.add(cam);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), keep(b, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2.2) })));
      eye.position.set(Math.cos(a) * (WALL_R - 0.55), CEILING - 1.05, Math.sin(a) * (WALL_R - 0.55));
      group.add(eye);
    }
    // Ceiling disc with a central ring light, duct runs and rings of panels.
    const { material, textures } = tiled(ceiling, [(WALL_R * 2 + 1) / 8, (WALL_R * 2 + 1) / 8]);
    b.textures.push(...textures);
    keep(b, material);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(WALL_R + 0.5, 96), material);
    lid.rotation.x = Math.PI / 2;
    lid.position.y = CEILING;
    group.add(lid);
    occluders.push(lid);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 10, 64), led);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = CEILING - 0.3;
    group.add(halo);
    for (const [r, count] of [
      [9.5, 10],
      [15, 16],
      [21, 22],
    ]) {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + (r === 15 ? 0.1 : 0);
        lightPanel(b, led, Math.cos(a) * r, CEILING - 0.05, Math.sin(a) * r, 1.8, 0.55, -a);
      }
    }
    for (const a of [0.35, 1.25, 1.95, 2.85, -0.35, -1.25, -1.95, -2.85]) {
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, WALL_R - 4.5, 12), steel);
      duct.rotation.z = Math.PI / 2;
      duct.rotation.y = -a;
      duct.position.set(Math.cos(a) * ((WALL_R + 4.2) / 2), CEILING - 0.95, Math.sin(a) * ((WALL_R + 4.2) / 2));
      group.add(duct);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.2, 40), darkMetal);
    hub.position.y = CEILING - 0.6;
    group.add(hub);
    const keyA = new THREE.PointLight(0xf4f8ff, 22, 48, 1.5);
    keyA.position.set(0, CEILING - 1.4, 0);
    group.add(keyA);
    for (const a of [0.8, 2.4, -0.8, -2.4]) {
      const fill = new THREE.PointLight(0xeaf4ff, 11, 30, 1.6);
      fill.position.set(Math.cos(a) * 18, CEILING - 1.4, Math.sin(a) * 18);
      group.add(fill);
    }
  }

  // --- Mezzanine: rail, workstations, racks -------------------------------------------
  {
    const g = 0.2;
    const arcs: [number, number][] = [
      [APRON, Math.PI / 2 - g],
      [Math.PI / 2 + g, Math.PI - g],
      [Math.PI + g, (3 * Math.PI) / 2 - g],
      [(3 * Math.PI) / 2 + g, Math.PI * 2 - APRON],
    ];
    for (const [a0, a1] of arcs) glassRail(b, railGlass, steel, MEZZ_IN + 0.4, FLOOR, a0, a1);
    for (const a of [1.05, 2.15, 2.7, -1.05, -2.15, -2.7]) {
      const r = 20.6;
      workstation(b, Math.cos(a) * r, FLOOR, Math.sin(a) * r, -a - Math.PI / 2, a > 0 ? ['telemetry', 'vitals'] : ['chart', 'telemetry']);
    }
    for (const a of [1.3, 1.85, 2.45, -1.3, -1.85, -2.45, 0.85, -0.85]) {
      const r = MEZZ_OUT - 0.65;
      serverRack(b, Math.cos(a) * r, FLOOR, Math.sin(a) * r, -a - Math.PI / 2, ledRows);
    }
    // Wall screens above the racks.
    for (const a of [1.6, 2.95, -1.6, -2.95]) {
      monitor(b, b.screens[a > 0 ? 'telemetry' : 'chart'], Math.cos(a) * (WALL_R - 0.3), FLOOR + 3.3, Math.sin(a) * (WALL_R - 0.3), -a - Math.PI / 2, 3.2, 1.8);
    }
    // Lockers and a first-aid station.
    const lockerMat = keep(b, new THREE.MeshStandardMaterial({ color: 0x5c6f7a, roughness: 0.5, metalness: 0.4 }));
    for (let i = 0; i < 4; i += 1) {
      const a = 0.72 + i * 0.03;
      addBox(b, lockerMat, Math.cos(a) * (MEZZ_OUT - 0.4), FLOOR + 0.95, Math.sin(a) * (MEZZ_OUT - 0.4) + i * 0.0, 0.5, 1.9, 0.55, { yaw: -a - Math.PI / 2, cast: true });
    }
  }

  // --- East corridor and Containment Bay 02 -------------------------------------------
  {
    const corridorWall = tiled(wall, [4.5 / 8, 4.8 / 8], { side: THREE.DoubleSide });
    b.textures.push(...corridorWall.textures);
    keep(b, corridorWall.material);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.8), corridorWall.material);
      w.position.set(27.9, 2.4, s * 3.4);
      w.receiveShadow = true;
      group.add(w);
      occluders.push(w);
      obstacles.push({ kind: 'box', minX: 25.6, maxX: 30.2, minZ: s * 3.4 - 0.15, maxZ: s * 3.4 + 0.15 });
      // Returns from the corridor to the bay walls.
      addBox(b, corridorWall.material, 30, 2.4, s * 5.3, 0.3, 4.8, 3.8, { occlude: true });
    }
    const corridorLid = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 6.8), keep(b, new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.8 })));
    corridorLid.rotation.x = Math.PI / 2;
    corridorLid.position.set(27.9, 4.8, 0);
    group.add(corridorLid);
    lightPanel(b, led, 27.9, 4.74, 0, 2.6, 0.5);
    sign(b, signTexture(['CONTAINMENT BAY 02'], '#ffd23c', '#1a1a1a'), 3.4, 0.8, 27.9, 4.1, -3.3, 0);

    // The bay itself.
    const bayWall = tiled(wall, [16 / 8, 5.2 / 8], { side: THREE.DoubleSide });
    b.textures.push(...bayWall.textures);
    keep(b, bayWall.material);
    addBox(b, bayWall.material, 38, 2.6, -7.2, 16, 5.2, 0.4, { occlude: true });
    addBox(b, bayWall.material, 38, 2.6, 7.2, 16, 5.2, 0.4, { occlude: true });
    addBox(b, bayWall.material, 46, 2.6, 0, 0.4, 5.2, 14.8, { occlude: true });
    const bayLid = tiled(ceiling, [16 / 8, 14.8 / 8]);
    b.textures.push(...bayLid.textures);
    keep(b, bayLid.material);
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(16, 14.8), bayLid.material);
    lid.rotation.x = Math.PI / 2;
    lid.position.set(38, 5.2, 0);
    group.add(lid);
    occluders.push(lid);
    for (const x of [32.5, 38, 43.5]) {
      lightPanel(b, warmLed, x, 5.14, -3.6, 2.6, 0.55);
      lightPanel(b, warmLed, x, 5.14, 3.6, 2.6, 0.55);
    }
    const bayLight = new THREE.PointLight(0xfff1dc, 13, 24, 1.6);
    bayLight.position.set(38, 4.6, 0);
    group.add(bayLight);
    // Containment cell: a glass cylinder on a steel ring base with a restrained specimen.
    const cellBase = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.4, 32), darkMetal);
    cellBase.position.set(38, 0.2, 0);
    cellBase.castShadow = true;
    group.add(cellBase);
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.6, 32, 1, true), keep(b, glassMaterial(0xd7bfff, 0.22)));
    cell.position.set(38, 2.2, 0);
    group.add(cell);
    pulse.push(cell.material as THREE.Material);
    const cellCap = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.5, 0.5, 32), darkMetal);
    cellCap.position.set(38, 4.25, 0);
    group.add(cellCap);
    const cellRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 48), keep(b, emissive(0xb388ff, 1.8, 0x3a2a55)));
    cellRing.rotation.x = Math.PI / 2;
    cellRing.position.set(38, 0.45, 0);
    group.add(cellRing);
    const specimenCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), keep(b, new THREE.MeshStandardMaterial({ color: 0xb388ff, emissive: 0xb388ff, emissiveIntensity: 2.2, roughness: 0.3 })));
    specimenCore.position.set(38, 2.0, 0);
    group.add(specimenCore);
    obstacles.push({ kind: 'circle', x: 38, z: 0, r: 1.95 });
    // Warning beacon over the cell and the consoles watching it.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12), keep(b, emissive(0xff3355, 2.4, 0x551015)));
    beacon.position.set(38, 4.65, 0);
    group.add(beacon);
    workstation(b, 34, 0, 3.6, Math.PI, ['warning', 'vitals']);
    workstation(b, 34, 0, -3.6, 0, ['vitals', 'warning']);
    for (const z of [-5.6, -4.4, 4.4, 5.6]) serverRack(b, 45.2, 0, z, Math.PI / 2, ledRows);
    monitor(b, b.screens.warning, 45.7, 3.4, 0, -Math.PI / 2, 4.4, 2.5);
    sign(b, signTexture(['DANGER', 'SPECIMEN 02 — PHASE-SHIFTING ENTITY'], '#ff5a66', '#2a0608'), 4.4, 1.1, 42, 4.2, -6.95, 0);
    // Hazard floor ring around the cell.
    const hazard = hazardTexture();
    if (hazard) {
      b.textures.push(hazard);
      hazard.repeat.set(10, 1);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 48), keep(b, new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(38, 0.02, 0);
      group.add(ring);
    }
  }

  // --- Chamber floor consoles and the sim station -------------------------------------
  for (const spot of [
    { x: 7.2, z: -6.2, kind: 'telemetry' as Screen },
    { x: -6.4, z: 7.4, kind: 'chart' as Screen },
  ]) {
    const console = addBox(b, darkMetal, spot.x, 0.6, spot.z, 1.4, 1.1, 0.7, { cast: true });
    const slope = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.6), darkMetal);
    slope.position.set(0, 0.56, 0.05);
    slope.rotation.x = -0.5;
    console.add(slope);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.5), b.screens[spot.kind]);
    screen.position.set(0, 0.62, 0.3);
    screen.rotation.x = -0.5;
    console.add(screen);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.03), trimMat);
    strip.position.set(0, -0.3, 0.36);
    console.add(strip);
  }

  const wing = buildObservationWing(b);

  // --- Holographic barriers the sim console toggles -------------------------------------
  const barriers: Barrier[] = [];
  for (const spot of [
    { x: 4.2, z: 3.4, w: 3.2, d: 0.18 },
    { x: -3.6, z: -4.2, w: 0.18, d: 3.4 },
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spot.w, 2.2, spot.d), barrierMat);
    mesh.position.set(spot.x, 1.2, spot.z);
    group.add(mesh);
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(spot.w + 0.1, 0.08, spot.d + 0.1), trimMat);
    emitter.position.set(spot.x, 0.05, spot.z);
    group.add(emitter);
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

  // Observation drones circling the chamber.
  const drones: THREE.Mesh[] = [];
  const droneMat = keep(b, new THREE.MeshStandardMaterial({ color: 0xf7fdff, emissive: 0x9fefff, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 }));
  for (let i = 0; i < 3; i += 1) {
    const drone = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), droneMat);
    drone.castShadow = true;
    group.add(drone);
    drones.push(drone);
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
      core.position.y = 2.6 + Math.sin(time * 1.4) * 0.12;
      coreLight.intensity = 16 + Math.sin(time * 2.2) * 4;
      const glowPulse = 0.28 + Math.sin(time * 2.2) * 0.1;
      for (const material of pulse) {
        if ('opacity' in material) material.opacity = material === barrierMat ? (barriersUp ? 0.34 + glowPulse * 0.3 : 0.15) : glowPulse * 0.5 + 0.12;
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
    },
    dispose: () => {
      b.textures.forEach((texture) => texture.dispose());
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
      });
      b.materials.forEach((material) => material.dispose());
    },
  };
}
