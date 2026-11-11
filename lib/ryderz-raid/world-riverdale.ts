import * as THREE from 'three';
import { NavGrid, sealCrevices } from './nav-grid';
import { surfaceMaterial } from './render/surfaces';
import {
  ENTRANCE_TRAIL,
  RIVERDALE,
  RIVERDALE_CACHES,
  RIVERDALE_HALF_X,
  RIVERDALE_HALF_Z,
  SPAWN_CLEAR,
  SPAWN_ZONES,
  STORY_TRIGGERS,
  type RiverdaleTime,
} from './riverdale/config';
import { createKit, keep, keepGeo, seededRandom, type BuildKit } from './riverdale/kit';
import { buildParty } from './riverdale/party';
import { StoryTriggerSet } from './riverdale/story';
import { buildStructure } from './riverdale/structure';
import { forestFloor } from './riverdale/surfaces';
import { MUD_HOLLOWS, riverdaleCeiling, riverdaleDirt, riverdaleRoof, riverdaleGround, riverdaleObstacles, trailDistance, underStructure } from './riverdale/terrain';
import { buildVegetation } from './riverdale/vegetation';
import type { Obstacle, World } from './world';

/**
 * THE RIVERDALE PARTY: a secret party under an abandoned concrete structure
 * deep in a Bronx park. The builders live in `riverdale/`; this file joins
 * them into a World and adds what spans the whole arena: ground, sky, drifting
 * dust and fireflies, the hidden caches, navigation and the debug overlay.
 */

const GROUND_X = 104;
const GROUND_Z0 = -62;
const GROUND_Z1 = 104;
const CHUNKS = 4;

const SKY: Record<RiverdaleTime, { zenith: number; mid: number; horizon: number; glow: number }> = {
  day: { zenith: 0x4f7fc4, mid: 0x8cb2d8, horizon: 0xcdd8d4, glow: 0xfff4dc },
  dusk: { zenith: 0x141a3e, mid: 0x4a3466, horizon: 0xd87a4e, glow: 0xffb070 },
  night: { zenith: 0x04050c, mid: 0x0c0e22, horizon: 0x262238, glow: 0x4a4a6a },
};

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mudAt(x: number, z: number) {
  let m = 0;
  for (const h of MUD_HOLLOWS) m = Math.max(m, 1 - smooth(h.r * 0.6, h.r * 1.25, Math.hypot(x - h.x, z - h.z)));
  return m;
}

/** Ground in chunks so the camera culls what is behind it. Colour carries the dirt, trail, mud and moss. */
function buildGround(kit: BuildKit) {
  const maps = forestFloor();
  kit.textures.push(...maps.textures);
  const material = keep(kit, surfaceMaterial(maps, { vertexColors: true, roughness: 0.96, normalAmount: 0.9 }));
  const spanX = (GROUND_X * 2) / CHUNKS;
  const spanZ = (GROUND_Z1 - GROUND_Z0) / CHUNKS;
  const color = new THREE.Color();
  const dry = new THREE.Color(0.98, 0.9, 0.8);
  const forest = new THREE.Color(0.6, 0.62, 0.46);
  const trail = new THREE.Color(1.08, 0.97, 0.82);
  const mud = new THREE.Color(0.42, 0.34, 0.27);
  const moss = new THREE.Color(0.56, 0.66, 0.42);
  for (let cx = 0; cx < CHUNKS; cx += 1) {
    for (let cz = 0; cz < CHUNKS; cz += 1) {
      const x0 = -GROUND_X + cx * spanX;
      const z0 = GROUND_Z0 + cz * spanZ;
      const segX = Math.round(spanX);
      const segZ = Math.round(spanZ);
      const geo = new THREE.PlaneGeometry(spanX, spanZ, segX, segZ);
      geo.rotateX(-Math.PI / 2);
      geo.translate(x0 + spanX / 2, 0, z0 + spanZ / 2);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, riverdaleDirt(x, z));
        uv.setXY(i, x / 5, z / 5);
        const inside = underStructure(x, z, -1) ? 1 : 1 - smooth(0, 6, Math.max(Math.abs(x) - RIVERDALE_HALF_X, z - RIVERDALE_HALF_Z));
        color.copy(forest).lerp(dry, inside);
        // Moss and ivy creep in along the open side and the ends.
        const edge = smooth(RIVERDALE_HALF_Z - 6, RIVERDALE_HALF_Z + 2, z) * inside;
        color.lerp(moss, edge * 0.45);
        const path = 1 - smooth(0.7, 2.2, trailDistance(x, z));
        color.lerp(trail, path * 0.75);
        color.lerp(mud, mudAt(x, z) * 0.85);
        const n = 0.92 + Math.sin(x * 1.7 + z * 0.9) * 0.04 + Math.sin(x * 0.31 - z * 0.47) * 0.06;
        colors[i * 3] = color.r * n;
        colors[i * 3 + 1] = color.g * n;
        colors[i * 3 + 2] = color.b * n;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(keepGeo(kit, geo), material);
      mesh.name = 'riverdale-ground';
      mesh.receiveShadow = true;
      kit.group.add(mesh);
    }
  }
}

function buildSky(kit: BuildKit, time: RiverdaleTime) {
  const spec = SKY[time];
  const material = keep(
    kit,
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(spec.zenith) },
        mid: { value: new THREE.Color(spec.mid) },
        horizon: { value: new THREE.Color(spec.horizon) },
        glow: { value: new THREE.Color(spec.glow) },
        sun: { value: new THREE.Vector3(-0.6, 0.12, 0.78).normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 mid;
        uniform vec3 horizon;
        uniform vec3 glow;
        uniform vec3 sun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, y));
          col = mix(col, zenith, smoothstep(0.18, 0.75, y));
          float toward = max(dot(d, sun), 0.0);
          col += glow * pow(toward, 12.0) * 0.6 * (1.0 - smoothstep(0.0, 0.4, y));
          if (d.y < 0.0) col = mix(horizon, horizon * 0.25, smoothstep(0.0, 0.2, -d.y));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const dome = new THREE.Mesh(keepGeo(kit, new THREE.SphereGeometry(480, 32, 16)), material);
  dome.name = 'riverdale-sky';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  kit.group.add(dome);
  return dome;
}

function softDot() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dust hanging in the light under the slab, and fireflies in the woods once the sun is down. */
function buildMotes(kit: BuildKit, time: RiverdaleTime) {
  const dot = softDot();
  kit.textures.push(dot);
  const rand = seededRandom(613);
  const dustCount = 260;
  const dustBase = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const x = (rand() - 0.5) * RIVERDALE.length * 0.9;
    const z = (rand() - 0.5) * RIVERDALE.width * 0.9;
    dustBase.set([x, riverdaleGround(x, z) + 0.6 + rand() * 4.5, z], i * 3);
  }
  const dustGeo = keepGeo(kit, new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
  const dust = new THREE.Points(
    dustGeo,
    keep(kit, new THREE.PointsMaterial({ map: dot, color: time === 'day' ? 0xfff2d8 : 0xffd2b0, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })),
  );
  dust.name = 'riverdale-dust';
  dust.frustumCulled = false;
  kit.group.add(dust);

  const flyCount = time === 'day' ? 0 : 150;
  const flyBase = new Float32Array(flyCount * 3);
  for (let i = 0; i < flyCount; i += 1) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      x = (rand() - 0.5) * 120;
      z = RIVERDALE_HALF_Z + 2 + rand() * 50;
      if (!underStructure(x, z, 1)) break;
    }
    flyBase.set([x, riverdaleGround(x, z) + 0.4 + rand() * 2.2, z], i * 3);
  }
  const flyGeo = keepGeo(kit, new THREE.BufferGeometry());
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyBase.slice(), 3));
  const flyMat = keep(kit, new THREE.PointsMaterial({ map: dot, color: new THREE.Color(0xd8ff7a).multiplyScalar(2.2), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.name = 'riverdale-fireflies';
  flies.frustumCulled = false;
  flies.visible = flyCount > 0;
  kit.group.add(flies);

  return (t: number) => {
    const dp = dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dustCount; i += 1) {
      const k = i * 3;
      dp.setXYZ(i, dustBase[k] + Math.sin(t * 0.13 + i) * 0.6, dustBase[k + 1] + Math.sin(t * 0.21 + i * 1.7) * 0.35, dustBase[k + 2] + Math.cos(t * 0.11 + i * 0.6) * 0.6);
    }
    dp.needsUpdate = true;
    if (!flyCount) return;
    const fp = flyGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < flyCount; i += 1) {
      const k = i * 3;
      fp.setXYZ(i, flyBase[k] + Math.sin(t * 0.5 + i * 2.1) * 1.2, flyBase[k + 1] + Math.sin(t * 0.9 + i) * 0.4, flyBase[k + 2] + Math.cos(t * 0.4 + i * 1.3) * 1.2);
    }
    fp.needsUpdate = true;
    flyMat.opacity = 0.65 + Math.sin(t * 2.3) * 0.25;
  };
}

/** Hidden supply caches: a scuffed ammo box with a faint signal glint. */
function buildCaches(kit: BuildKit) {
  const boxMat = keep(kit, new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7, metalness: 0.3 }));
  const lidMat = keep(kit, new THREE.MeshStandardMaterial({ color: 0x3c4430, roughness: 0.65, metalness: 0.35 }));
  const glintMat = keep(kit, new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color(0x7ad8ff).multiplyScalar(1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  kit.textures.push(glintMat.map);
  const body = keepGeo(kit, new THREE.BoxGeometry(0.6, 0.32, 0.34));
  const lidGeo = keepGeo(kit, new THREE.BoxGeometry(0.62, 0.06, 0.36));
  lidGeo.translate(0, 0, 0.18);
  const caches = RIVERDALE_CACHES.map((c) => {
    const y = riverdaleGround(c.x, c.z);
    const root = new THREE.Group();
    root.name = `riverdale-cache-${c.id}`;
    root.position.set(c.x, y, c.z);
    root.rotation.y = (c.x * 13 + c.z * 7) % 6.28;
    const box = new THREE.Mesh(body, boxMat);
    box.position.y = 0.16;
    box.castShadow = true;
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.set(0, 0.35, -0.18);
    const glint = new THREE.Sprite(glintMat);
    glint.position.y = 0.55;
    glint.scale.setScalar(0.5);
    root.add(box, lid, glint);
    kit.group.add(root);
    return { ...c, y, lid, glint, claimed: false };
  });
  const animate = (t: number) => {
    glintMat.opacity = 0.35 + 0.35 * Math.max(0, Math.sin(t * 2.4));
  };
  const claim = (id: string) => {
    const cache = caches.find((c) => c.id === id);
    if (!cache || cache.claimed) return;
    cache.claimed = true;
    cache.glint.visible = false;
    cache.lid.rotation.x = -1.9;
  };
  const reset = () => {
    for (const c of caches) {
      c.claimed = false;
      c.glint.visible = true;
      c.lid.rotation.x = 0;
    }
  };
  return { caches, animate, claim, reset };
}

function buildDebugOverlay(kit: BuildKit) {
  const root = new THREE.Group();
  root.name = 'riverdale-debug';
  root.visible = false;
  const ring = (x: number, z: number, r: number, color: number) => {
    const mesh = new THREE.Mesh(
      keepGeo(kit, new THREE.RingGeometry(Math.max(0.05, r - 0.15), r, 40)),
      keep(kit, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, riverdaleGround(x, z) + 0.12, z);
    root.add(mesh);
  };
  const rect = (x: number, z: number, hx: number, hz: number, color: number) => {
    const pts = [
      [x - hx, z - hz],
      [x + hx, z - hz],
      [x + hx, z + hz],
      [x - hx, z + hz],
      [x - hx, z - hz],
    ].map(([px, pz]) => new THREE.Vector3(px, riverdaleGround(px, pz) + 0.15, pz));
    root.add(new THREE.Line(keepGeo(kit, new THREE.BufferGeometry().setFromPoints(pts)), keep(kit, new THREE.LineBasicMaterial({ color }))));
  };
  for (const zone of SPAWN_ZONES) ring(zone.x, zone.z, zone.spread, 0x4cff7a);
  for (const cache of RIVERDALE_CACHES) ring(cache.x, cache.z, 1.2, 0xffd040);
  for (const t of STORY_TRIGGERS) {
    if (t.r !== undefined) ring(t.x, t.z, t.r, 0xff4fd8);
    else rect(t.x, t.z, t.halfX ?? 0, t.halfZ ?? 0, 0xff4fd8);
  }
  const trail = ENTRANCE_TRAIL.map((p) => new THREE.Vector3(p.x, riverdaleGround(p.x, p.z) + 0.2, p.z));
  root.add(new THREE.Line(keepGeo(kit, new THREE.BufferGeometry().setFromPoints(trail)), keep(kit, new THREE.LineBasicMaterial({ color: 0x66ccff }))));
  kit.group.add(root);
  return (on: boolean) => {
    root.visible = on;
  };
}

/** Entry points across each zone, slid onto open ground where a trunk or rock sits on the planned spot. */
function spawnAlleys(obstacles: readonly Obstacle[]) {
  const blocked = (x: number, z: number) =>
    obstacles.some((o) =>
      o.kind === 'box'
        ? x > o.minX - 0.8 && x < o.maxX + 0.8 && z > o.minZ - 0.8 && z < o.maxZ + 0.8
        : Math.hypot(x - o.x, z - o.z) < o.r + 0.8,
    );
  const clear = (x: number, z: number) => {
    if (!blocked(x, z)) return { x, z };
    for (let r = 0.5; r <= 4; r += 0.5) {
      for (let a = 0; a < 12; a += 1) {
        const px = x + Math.cos((a / 12) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / 12) * Math.PI * 2) * r;
        if (!blocked(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const out: World['alleys'] = [];
  for (const zone of SPAWN_ZONES) {
    const inward = new THREE.Vector3(zone.toward.x, 0, zone.toward.z).normalize();
    const side = new THREE.Vector3(-inward.z, 0, inward.x);
    for (const k of [-1, 0, 1]) {
      const { x, z } = clear(zone.x + side.x * zone.spread * 0.6 * k, zone.z + side.z * zone.spread * 0.6 * k);
      out.push({ position: new THREE.Vector3(x, riverdaleGround(x, z), z), inward: inward.clone() });
    }
  }
  return out;
}

export function buildRiverdaleWorld(): World {
  const group = new THREE.Group();
  group.name = 'riverdale';
  const kit = createKit(group);
  const obstacles = riverdaleObstacles();
  let disposed = false;
  const time = RIVERDALE.timeOfDay;

  buildGround(kit);
  buildStructure(kit);
  buildVegetation(kit, obstacles, () => disposed);
  const party = buildParty(kit);
  buildSky(kit, time);
  const motes = buildMotes(kit, time);
  const caches = buildCaches(kit);
  const setDebugOverlay = buildDebugOverlay(kit);

  // Narrow gaps between trunks, stumps and rocks that a body could be knocked into but not walk out of.
  obstacles.push(...sealCrevices(obstacles, RIVERDALE.bounds, { open: 1.1 }));
  let nav: NavGrid | null = null;
  const story = new StoryTriggerSet();

  let last = 0;
  const animate = (t: number) => {
    if (disposed) return;
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    party.animate(t, dt);
    motes(t);
    caches.animate(t);
  };

  const dispose = () => {
    disposed = true;
    story.dispose();
    const geometries = new Set<THREE.BufferGeometry>(kit.geometries);
    const materials = new Set<THREE.Material>(kit.materials);
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry) return;
      geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((m) => m && materials.add(m));
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      for (const value of Object.values(m)) if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
      m.dispose();
    });
    kit.textures.forEach((t) => t?.dispose());
  };

  return {
    group,
    obstacles,
    occluders: kit.occluders,
    alleys: spawnAlleys(obstacles),
    alleyNodes: [],
    bounds: RIVERDALE.bounds,
    spawnReach: 60,
    spawnClear: SPAWN_CLEAR,
    heightAt: riverdaleGround,
    ceilingAt: riverdaleCeiling,
    roofAt: riverdaleRoof,
    routeTo: (fromX, fromZ, toX, toZ, radius) => {
      nav ??= new NavGrid(obstacles, RIVERDALE.bounds);
      return nav.routeTo(fromX, fromZ, toX, toZ, radius);
    },
    openSpot: (x, z, radius) => {
      nav ??= new NavGrid(obstacles, RIVERDALE.bounds);
      return nav.openSpot(x, z, radius);
    },
    throwSpots: party.throwSpots,
    caches: caches.caches,
    claimCache: caches.claim,
    resetCaches: () => {
      caches.reset();
      party.reset();
    },
    impact: party.impact,
    storyTriggers: story,
    ambience: { kind: 'party', x: party.dj.x, y: riverdaleGround(party.dj.x, party.dj.z) + 1.4, z: party.dj.z },
    setDebugOverlay,
    animate,
    dispose,
  };
}
