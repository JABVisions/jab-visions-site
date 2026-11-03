import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obstacle, World } from './world';
import {
  ISLAND_CAVE,
  ISLAND_FALLS,
  ISLAND_GROTTO,
  ISLAND_HALF,
  ISLAND_SPAN,
  islandAlleys,
  islandFloor,
  islandSurface,
  rainforestMask,
  sampleIsland,
} from './island/terrain';
import { disposeTextures, makeSurface, paintTexture, seeded, speckle, surfaceMaterial, type SurfaceMaps } from './render/surfaces';

/**
 * Island Paradise, drawn like a storybook beach: saturated sand and sea, big
 * cumulus clouds, leaning palms with real fronds, a wooden pier off the spawn
 * beach, a thatched resort, tiki torches and beach grass. The terrain is a
 * lit PBR material whose colour is still computed from the height field, so
 * the gameplay surface (islandFloor / islandSurface) and the picture agree.
 *
 * Terrain is sixteen chunks so the camera can cull what is behind it. Palms,
 * rainforest trees, rocks, grass and bushes are instanced; their sway runs in
 * the vertex shader so no instance matrix is rewritten per frame.
 */

const CHUNK = 4;
const SEGMENT = 4;
const SUN_DIR = new THREE.Vector3(-42, 78, 30).normalize();

let clock = 0;

const trails = [0, 1, 2, 3].map(() => new THREE.Vector2(8000, 8000));
let trailWrite = 0;

/** The pier off the south beach. Two steps up from the sand, a long deck, a square platform over the water. */
const PIER = { x: -56, half: 2.0, z0: 257.5, stepZ: 260, z1: 298, deck: 1.35, step: 0.75, endHalf: 4.2, endZ0: 296, endZ1: 304 };
/** Veranda deck around the resort lodge. */
const LODGE = { x: 118, z: 96, floor: 1.65, deck: 2.1, halfX: 14, halfZ: 10 };
const SHACK = { x: -98, z: 238, base: 1.0 };

function pierHeight(x: number, z: number): number | null {
  if (Math.abs(x - PIER.x) <= PIER.endHalf && z >= PIER.endZ0 && z <= PIER.endZ1) return PIER.deck;
  if (Math.abs(x - PIER.x) <= PIER.half && z >= PIER.z0 && z <= PIER.z1) return z < PIER.stepZ ? PIER.step : PIER.deck;
  return null;
}

function lodgeHeight(x: number, z: number): number | null {
  if (Math.abs(x - LODGE.x) <= LODGE.halfX && Math.abs(z - LODGE.z) <= LODGE.halfZ) return LODGE.deck;
  return null;
}

// ---------------------------------------------------------------------------
// GLSL helpers shared by the terrain and the sky
// ---------------------------------------------------------------------------

const NOISE_GLSL = `
  float ihash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float inoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ihash(i), ihash(i + vec2(1.0, 0.0)), f.x), mix(ihash(i + vec2(0.0, 1.0)), ihash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float ifbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * inoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

interface SwayUniforms {
  time: { value: number };
}

/** Bend a material's vertices with the wind. Tip-weighted, phased by instance position. */
function swaying(material: THREE.Material, uniforms: SwayUniforms, height: number, amplitude: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = uniforms.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float time;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            float swayPhase = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.53;
          #else
            float swayPhase = 0.0;
          #endif
          float swayK = clamp(transformed.y / ${height.toFixed(2)}, 0.0, 1.0);
          swayK *= swayK;
          transformed.x += sin(time * 1.1 + swayPhase) * ${amplitude.toFixed(3)} * swayK;
          transformed.z += cos(time * 0.8 + swayPhase * 1.3) * ${(amplitude * 0.7).toFixed(3)} * swayK;
        }`,
      );
  };
  material.customProgramCacheKey = () => `sway-${height}-${amplitude}`;
  return material;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function terrainMaterial(uniforms: { time: { value: number }; trails: { value: THREE.Vector2[] } }) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = uniforms.time;
    shader.uniforms.trails = uniforms.trails;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform float time;
        uniform vec2 trails[4];
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float islandWet = 0.0;
        {
          vec3 p = vWorldPos;
          float h = p.y;
          float grain = ihash(floor(p.xz * 6.0));
          float mote = inoise(p.xz * 0.6 + 4.0);
          float fine = inoise(p.xz * 2.3);
          float broad = ifbm(p.xz * 0.05);
          vec3 sand = vec3(0.87, 0.76, 0.51);
          sand = mix(sand * 0.84, sand, grain * 0.4 + fine * 0.6);
          vec3 wetSand = vec3(0.58, 0.49, 0.34);
          vec3 grass = mix(vec3(0.26, 0.68, 0.22), vec3(0.14, 0.48, 0.15), mote * 0.6 + broad * 0.4);
          vec3 soil = vec3(0.44, 0.31, 0.17);
          vec3 rock = vec3(0.54, 0.50, 0.46);
          vec3 abyss = vec3(0.04, 0.20, 0.30);
          islandWet = 1.0 - smoothstep(0.05, 0.95, h);
          vec3 col = mix(wetSand, sand, smoothstep(0.05, 1.05, h));
          float wash = smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.35, 0.9, h));
          col = mix(col, vec3(0.82, 0.74, 0.54), wash * 0.35);
          if (grain > 0.93 && h > 0.4 && h < 2.2) col = mix(col, vec3(0.99, 0.97, 0.9), 0.6);
          col = mix(col, soil, smoothstep(1.15, 2.2, h) * 0.4);
          col = mix(col, grass, smoothstep(2.0, 7.0, h));
          float gust = 0.5 + 0.5 * sin(p.x * 0.15 + p.z * 0.11 + time * 1.4);
          col = mix(col, col * vec3(0.9, 1.1, 0.92), smoothstep(2.2, 6.0, h) * (1.0 - smoothstep(16.0, 26.0, h)) * gust * 0.22);
          vec2 fc = p.xz * 0.85;
          float flower = ihash(floor(fc));
          float spot = 1.0 - smoothstep(0.1, 0.19, length(fract(fc) - 0.5));
          if (flower > 0.86 && h > 3.0 && h < 14.0) {
            col = mix(col, flower > 0.93 ? vec3(0.99, 0.84, 0.3) : vec3(0.96, 0.38, 0.56), 0.85 * spot);
          }
          float basinX = (p.x + 48.0) / 155.0;
          float basinZ = (p.z - 125.0) / 78.0;
          float basin = clamp(1.0 - (basinX * basinX + basinZ * basinZ), 0.0, 1.0);
          float canopy = basin * smoothstep(2.2, 5.0, h) * (1.0 - smoothstep(14.0, 22.0, h));
          col = mix(col, vec3(0.05, 0.28, 0.09), canopy * 0.85);
          float vx = (p.x - 46.0) / 34.0;
          float vz = (p.z - 4.0) / 26.0;
          float valley = 1.0 - clamp(vx * vx + vz * vz, 0.0, 1.0);
          col = mix(col, vec3(0.40, 0.70, 0.26), valley * smoothstep(4.0, 8.0, h) * (1.0 - smoothstep(14.0, 18.0, h)));
          col = mix(col, rock, smoothstep(16.0, 34.0, h));
          col = mix(col, vec3(0.70, 0.68, 0.64), smoothstep(58.0, 96.0, h));
          float slope = 1.0 - clamp(vWorldNormal.y, 0.0, 1.0);
          float strata = 0.85 + 0.15 * sin(h * 2.6 + inoise(p.xz * 0.4) * 3.0);
          col = mix(col, rock * strata, smoothstep(0.26, 0.6, slope));
          float scuff = 0.0;
          for (int i = 0; i < 4; i++) {
            scuff = max(scuff, 1.0 - smoothstep(0.28, 1.15, length(p.xz - trails[i])));
          }
          col = mix(col, col * vec3(0.72, 0.66, 0.5), scuff * (h < 2.4 ? 0.8 : 0.35));
          float grotto = 0.0;
          if (p.x > 28.0 && p.x < 58.0 && p.z < -70.0 && p.z > -132.0 && p.y < 13.0) grotto = 1.0;
          if (p.x > -32.0 && p.x < -6.0 && p.z < -124.0 && p.z > -152.0 && p.y < 14.0) grotto = 1.0;
          col *= mix(1.0, 0.2, grotto);
          if (h < 0.15) {
            float depth = clamp(-h / 16.0, 0.0, 1.0);
            col = mix(col, abyss, depth);
            float band = sin(p.x * 0.55 + time * 1.3) * sin(p.z * 0.48 - time * 1.1);
            col += vec3(0.08, 0.26, 0.26) * band * band * (1.0 - depth) * step(h, 0.0);
          }
          diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * mix(1.0, 0.28, islandWet);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          vec3 p = vWorldPos;
          float beach = smoothstep(-0.5, 0.3, p.y) * (1.0 - smoothstep(1.8, 2.8, p.y));
          float ripple = cos(p.x * 2.2 + sin(p.z * 0.45) * 2.4 + inoise(p.xz * 0.7) * 3.0);
          float rocky = smoothstep(0.26, 0.6, 1.0 - clamp(vWorldNormal.y, 0.0, 1.0)) + smoothstep(16.0, 30.0, p.y);
          float grainN = inoise(p.xz * 1.9) - 0.5;
          float grainM = inoise(p.zx * 1.7 + 11.0) - 0.5;
          vec3 bump = vec3(ripple * 0.18 * beach + grainN * 0.5 * rocky, 0.0, grainM * 0.5 * rocky);
          normal = normalize(normal + mat3(viewMatrix) * bump);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'island-terrain';
  return material;
}

function waterMaterial(depthMap: THREE.DataTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time: { value: 0 },
      depthMap: { value: depthMap },
      sunDir: { value: SUN_DIR.clone() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float time;
      uniform sampler2D depthMap;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        vec3 pos = position;
        vec2 uv = pos.xz / ${ISLAND_SPAN.toFixed(1)} + 0.5;
        float depth = texture2D(depthMap, uv).r;
        float amp = 0.08 + depth * 0.55;
        float wave = sin(pos.x * 0.045 + time * 1.15) * amp + sin(pos.z * 0.07 - time * 0.82) * amp * 0.65;
        pos.y += wave;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        float dx = cos(pos.x * 0.045 + time * 1.15) * 0.045 * amp;
        float dz = cos(pos.z * 0.07 - time * 0.82) * 0.07 * amp * 0.65;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        vDepth = depth;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float time;
      uniform vec3 sunDir;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      ${NOISE_GLSL}
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        // Small-scale ripples on top of the big swell.
        vec2 r1 = vWorld.xz * 0.35 + vec2(time * 0.35, -time * 0.22);
        vec2 r2 = vWorld.xz * 0.6 - vec2(time * 0.28, time * 0.31);
        vec3 n = normalize(vNormal + vec3(inoise(r1) - 0.5, 0.0, inoise(r2) - 0.5) * 0.22);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
        vec3 deep = vec3(0.03, 0.30, 0.52);
        vec3 shallow = vec3(0.26, 0.86, 0.78);
        vec3 col = mix(shallow, deep, smoothstep(0.02, 0.45, vDepth));
        vec3 sky = vec3(0.42, 0.74, 0.97);
        col = mix(col, sky, fres * 0.55);
        vec3 halfDir = normalize(sunDir + viewDir);
        float spec = pow(clamp(dot(n, halfDir), 0.0, 1.0), 64.0);
        float glint = pow(clamp(dot(normalize(n + vec3(inoise(vWorld.xz * 3.1 + time * 1.3) - 0.5, 0.0, inoise(vWorld.zx * 2.7 - time * 1.1) - 0.5) * 0.12), halfDir), 0.0, 1.0), 420.0);
        col += vec3(1.0, 0.95, 0.82) * (spec * (0.35 + fres) + glint * 1.6);
        float shore = smoothstep(0.16, 0.0, vDepth);
        float foam = shore * (0.55 + 0.45 * sin(vWorld.x * 0.55 + vWorld.z * 0.4 + time * 2.6));
        foam += shore * 0.35 * sin(vWorld.x * 1.3 - vWorld.z * 0.9 + time * 3.4);
        foam *= 0.6 + 0.4 * inoise(vWorld.xz * 0.9 + time * 0.4);
        col = mix(col, vec3(0.96, 0.99, 0.98), clamp(foam, 0.0, 1.0) * 0.9);
        float caustic = sin(vWorld.x * 0.42 + time * 1.4) * sin(vWorld.z * 0.33 - time * 1.1);
        col += vec3(0.35, 0.7, 0.62) * caustic * caustic * (1.0 - smoothstep(0.02, 0.4, vDepth)) * 0.28;
        float alpha = mix(0.5, 0.9, fres);
        alpha = mix(alpha, 0.4, shore);
        alpha = mix(alpha, 0.94, smoothstep(0.3, 0.8, vDepth) * (1.0 - fres) * 0.5);
        if (!gl_FrontFacing) {
          col = mix(col, vec3(0.03, 0.22, 0.32), 0.55);
          alpha = 0.72;
        }
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
  });
}

function depthTexture() {
  const n = 128;
  const data = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const x = -ISLAND_HALF + (ix / (n - 1)) * ISLAND_SPAN;
      const z = -ISLAND_HALF + (iz / (n - 1)) * ISLAND_SPAN;
      const depth = Math.max(0, -islandFloor(x, z));
      data[iz * n + ix] = Math.min(255, Math.floor((depth / 18) * 255));
    }
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function chunkGeometry(ox: number, oz: number, size: number) {
  const seg = Math.round(size / SEGMENT);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    pos.setXYZ(i, x, islandFloor(x, z), z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

function buildDaySky(radius = 1500) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      time: { value: 0 },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 sunDir;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 zenith = vec3(0.05, 0.27, 0.88);
        vec3 horizon = vec3(0.58, 0.82, 0.98);
        vec3 haze = vec3(0.98, 0.95, 0.88);
        vec3 sea = vec3(0.55, 0.8, 0.92);
        vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.62, y), 0.8));
        col = mix(col, haze, pow(1.0 - clamp(y, 0.0, 1.0), 10.0) * 0.7);
        col = mix(col, sea, smoothstep(0.0, -0.08, y));
        float m = dot(d, sunDir);
        float disc = smoothstep(0.9992, 0.9997, m);
        float glow = pow(max(m, 0.0), 48.0) * 0.4 + pow(max(m, 0.0), 6.0) * 0.14;
        vec3 sunCol = vec3(1.0, 0.95, 0.82);
        col += sunCol * (disc * 3.5 + glow);
        if (y > 0.0) {
          vec2 sky = d.xz / (y + 0.14);
          vec2 wind = vec2(time * 0.012, time * 0.005);
          float base = ifbm(sky * 5.5 + wind);
          float detail = ifbm(sky * 16.0 + wind * 1.6 + 3.1);
          float dens = base * 0.72 + detail * 0.28;
          float cover = smoothstep(0.55, 0.68, dens) * smoothstep(0.0, 0.14, y);
          float lit = ifbm((sky + sunDir.xz * 0.025) * 5.5 + wind);
          float shade = clamp((base - lit) * 3.5, -1.0, 1.0);
          vec3 cloudCol = mix(vec3(0.66, 0.72, 0.84), vec3(1.0, 0.99, 0.97), 0.55 + 0.45 * shade);
          cloudCol = mix(cloudCol, vec3(0.78, 0.82, 0.9), (1.0 - smoothstep(0.55, 0.8, dens)) * 0.4);
          col = mix(col, cloudCol, cover * 0.97);
          col += sunCol * cover * pow(max(m, 0.0), 10.0) * 0.3;
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return { mesh, material };
}

// ---------------------------------------------------------------------------
// Painted surfaces
// ---------------------------------------------------------------------------

/** Weathered deck planks. One texture is 4 m × 4 m, six boards across. */
function plankSurface(): SurfaceMaps {
  return makeSurface({
    size: 512,
    seed: 41,
    normalStrength: 2.2,
    albedo: (ctx, s, rand) => {
      ctx.fillStyle = '#4a3420';
      ctx.fillRect(0, 0, s, s);
      const boards = 6;
      const w = s / boards;
      for (let i = 0; i < boards; i += 1) {
        const tone = 150 + Math.floor((rand() - 0.5) * 50);
        ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.72)}, ${Math.floor(tone * 0.46)})`;
        ctx.fillRect(i * w + 3, 0, w - 6, s);
        for (let k = 0; k < 26; k += 1) {
          ctx.strokeStyle = `rgba(60, 38, 18, ${0.12 + rand() * 0.25})`;
          ctx.lineWidth = 1 + rand() * 2;
          ctx.beginPath();
          const x = i * w + 6 + rand() * (w - 12);
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(x + (rand() - 0.5) * 12, s * 0.3, x + (rand() - 0.5) * 12, s * 0.7, x + (rand() - 0.5) * 8, s);
          ctx.stroke();
        }
        // Nail heads.
        ctx.fillStyle = '#2a2420';
        for (const y of [18, s - 18]) {
          ctx.beginPath();
          ctx.arc(i * w + w * 0.3, y, 3, 0, Math.PI * 2);
          ctx.arc(i * w + w * 0.7, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      speckle(ctx, s, 1500, [130, 96, 60], 40, rand, 1.5);
    },
    height: (ctx, s, rand) => {
      ctx.fillStyle = '#303030';
      ctx.fillRect(0, 0, s, s);
      const w = s / 6;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = `rgb(${150 + Math.floor(rand() * 30)}, 160, 160)`;
        ctx.fillRect(i * w + 3, 0, w - 6, s);
      }
      speckle(ctx, s, 2500, [150, 150, 150], 50, rand, 2);
    },
    roughness: (ctx, s, rand) => {
      ctx.fillStyle = '#c4c4c4';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 1500, [180, 180, 180], 60, rand, 3);
    },
  });
}

/** Palm thatch, combed downward. */
function thatchSurface(): SurfaceMaps {
  return makeSurface({
    size: 512,
    seed: 53,
    normalStrength: 2.6,
    albedo: (ctx, s, rand) => {
      ctx.fillStyle = '#8a6a30';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i += 1) {
        const x = rand() * s;
        const y = rand() * s;
        const tone = 150 + Math.floor((rand() - 0.5) * 90);
        ctx.strokeStyle = `rgb(${tone + 30}, ${tone}, ${Math.floor(tone * 0.45)})`;
        ctx.lineWidth = 1.5 + rand() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 6, y + 14 + rand() * 26);
        ctx.stroke();
      }
      // Rows of binding.
      for (let y = 40; y < s; y += 96) {
        ctx.fillStyle = 'rgba(60, 40, 16, 0.55)';
        ctx.fillRect(0, y, s, 5);
      }
    },
    height: (ctx, s, rand) => {
      ctx.fillStyle = '#707070';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i += 1) {
        const x = rand() * s;
        const y = rand() * s;
        const v = 90 + Math.floor(rand() * 120);
        ctx.strokeStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.lineWidth = 1.5 + rand() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 6, y + 14 + rand() * 26);
        ctx.stroke();
      }
    },
    roughness: (ctx, s) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, s, s);
    },
  });
}

/** Palm bark: ringed leaf scars climbing the trunk. v runs along the trunk. */
function barkTexture() {
  return paintTexture(
    256,
    (ctx, s, rand) => {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 14) {
        const tone = 110 + Math.floor(rand() * 50);
        ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.72)}, ${Math.floor(tone * 0.48)})`;
        ctx.fillRect(0, y, s, 9);
        ctx.fillStyle = `rgba(40, 26, 12, ${0.5 + rand() * 0.3})`;
        ctx.fillRect(0, y + 9, s, 3);
        for (let x = 0; x < s; x += 18 + Math.floor(rand() * 10)) {
          ctx.fillStyle = `rgba(30, 20, 10, ${0.25 + rand() * 0.3})`;
          ctx.fillRect(x, y + 1, 3, 7);
        }
      }
      speckle(ctx, s, 600, [120, 90, 60], 50, rand, 1.5);
    },
    { seed: 17, repeat: [2, 1] },
  );
}

/** One palm frond: a rib with leaflets. Base at the top of the canvas, tip at the bottom. Alpha outside. */
function frondTexture() {
  return paintTexture(
    512,
    (ctx, s, rand) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2;
      ctx.lineCap = 'round';
      for (let y = 10; y < s - 8; y += 8) {
        const t = y / s;
        const reach = Math.sin(Math.PI * Math.min(1, t * 1.1)) * s * 0.46 * (1 - t * 0.3) + 8;
        const g = 150 + Math.floor(rand() * 50) - Math.floor(t * 40);
        ctx.strokeStyle = `rgb(${38 + Math.floor(rand() * 26)}, ${g}, ${40 + Math.floor(rand() * 20)})`;
        ctx.lineWidth = 6;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + side * reach, y + reach * 0.5);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = '#8a7a3a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, s * 0.97);
      ctx.stroke();
    },
    { seed: 5 },
  );
}

/** Beach grass tuft. Blades rise from the bottom of the canvas. */
function grassTexture() {
  return paintTexture(
    256,
    (ctx, s, rand) => {
      ctx.clearRect(0, 0, s, s);
      ctx.lineCap = 'round';
      for (let i = 0; i < 46; i += 1) {
        const x = s * 0.2 + rand() * s * 0.6;
        const lean = (rand() - 0.5) * 90;
        const h = s * (0.45 + rand() * 0.5);
        const g = 120 + Math.floor(rand() * 90);
        ctx.strokeStyle = `rgb(${g - 50 + Math.floor(rand() * 40)}, ${g}, ${50 + Math.floor(rand() * 30)})`;
        ctx.lineWidth = 3 + rand() * 3;
        ctx.beginPath();
        ctx.moveTo(x, s);
        ctx.quadraticCurveTo(x + lean * 0.3, s - h * 0.6, x + lean, s - h);
        ctx.stroke();
      }
    },
    { seed: 9 },
  );
}

/** Dense hibiscus bush: leaves with scattered blooms. */
function bushTexture() {
  return paintTexture(
    256,
    (ctx, s, rand) => {
      ctx.fillStyle = '#1e5a22';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i += 1) {
        const g = 90 + Math.floor(rand() * 110);
        ctx.fillStyle = `rgb(${g * 0.3}, ${g}, ${g * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(rand() * s, rand() * s, 6 + rand() * 8, 3 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 34; i += 1) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillStyle = rand() > 0.5 ? '#ff4f7d' : '#ff8b3a';
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 3.2, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffe36a';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { seed: 23 },
  );
}

function stripeTexture(a: string, b: string, seed: number) {
  return paintTexture(
    256,
    (ctx, s) => {
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = i % 2 ? a : b;
        ctx.fillRect((i * s) / 8, 0, s / 8, s);
      }
    },
    { seed },
  );
}

// ---------------------------------------------------------------------------
// Vegetation geometry
// ---------------------------------------------------------------------------

/** A leaning coconut palm trunk with a flared foot and a few coconuts under the crown. */
function palmTrunk(height: number, bend: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.16, height * 0.36, 0),
    new THREE.Vector3(bend * 0.55, height * 0.72, 0),
    new THREE.Vector3(bend, height, 0),
  ]);
  const segments = 9;
  const points = curve.getPoints(segments);
  const up = new THREE.Vector3(0, 1, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const cyl = new THREE.CylinderGeometry(0.3 - 0.13 * t1, 0.3 - 0.13 * t0, len * 1.08, 7, 1, true);
    const uv = cyl.attributes.uv;
    for (let k = 0; k < uv.count; k += 1) uv.setY(k, (t0 + uv.getY(k) * (t1 - t0)) * 4);
    cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    cyl.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(cyl);
  }
  const foot = new THREE.CylinderGeometry(0.32, 0.52, 0.5, 7, 1, true);
  foot.translate(0, 0.25, 0);
  parts.push(foot);
  const top = points[segments];
  for (let i = 0; i < 4; i += 1) {
    const nut = new THREE.SphereGeometry(0.17, 6, 5);
    const ang = i * 1.6 + 0.4;
    nut.translate(top.x + Math.cos(ang) * 0.3, top.y - 0.3, top.z + Math.sin(ang) * 0.3);
    parts.push(nut);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return { geometry: merged ?? new THREE.CylinderGeometry(0.2, 0.3, height, 7), top };
}

/** Drooping fronds radiating from the crown. Planes, alpha-tested. */
function palmFronds(top: THREE.Vector3, count: number, seed: number) {
  const rand = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = 3.2 + rand() * 1.0;
    const geo = new THREE.PlaneGeometry(1.25, length, 1, 6);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, length / 2);
    const pos = geo.attributes.position;
    const droop = 1.2 + rand() * 1.1;
    for (let k = 0; k < pos.count; k += 1) {
      const t = pos.getZ(k) / length;
      pos.setY(k, pos.getY(k) - t * t * droop + t * 0.5);
    }
    geo.rotateX(-0.25 + rand() * 0.35);
    geo.rotateY((i / count) * Math.PI * 2 + (rand() - 0.5) * 0.5);
    geo.translate(top.x, top.y, top.z);
    geo.computeVertexNormals();
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged ?? new THREE.PlaneGeometry(1, 1);
}

function placePalms() {
  const spots: THREE.Vector3[] = [];
  for (let x = -340; x <= 340 && spots.length < 640; x += 16) {
    for (let z = -300; z <= 280 && spots.length < 640; z += 16) {
      const jitterX = x + Math.sin(x * 0.17 + z) * 4;
      const jitterZ = z + Math.cos(z * 0.13 + x) * 4;
      const sample = sampleIsland(jitterX, jitterZ);
      if (sample.depth > 0.25 || sample.floor < 1.7 || sample.floor > 18) continue;
      if (Math.abs(jitterX - 128) < 46 && Math.abs(jitterZ - 96) < 38) continue;
      if (Math.hypot(jitterX - 8, jitterZ - 48) < 26) continue;
      if (Math.hypot(jitterX + 76, jitterZ - 248) < 18) continue;
      if (Math.hypot(jitterX - SHACK.x, jitterZ - SHACK.z) < 7) continue;
      const forest = rainforestMask(jitterX, jitterZ) > 0.35;
      if (!forest && ((x / 16) ^ (z / 16)) % 3 === 0) continue;
      spots.push(new THREE.Vector3(jitterX, sample.floor, jitterZ));
    }
  }
  return spots;
}

/** Noisy displacement for crowns and rocks. */
function roughen(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const pos = geo.attributes.position;
  const rand = seeded(seed);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const len = n.length() || 1;
    const k = 1 + (rand() - 0.5) * amount;
    pos.setXYZ(i, (n.x / len) * len * k, (n.y / len) * len * k, (n.z / len) * len * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Broadleaf rainforest tree: a thick trunk under three lumpy crowns. Vertex colours shade the underside. */
function canopyGeometry() {
  // Polyhedra are non-indexed, so the trunk must be too before they merge.
  const trunk = new THREE.CylinderGeometry(0.26, 0.46, 4.8, 7).toNonIndexed();
  trunk.translate(0, 2.4, 0);
  const parts: THREE.BufferGeometry[] = [trunk];
  const crowns: [number, number, number, number][] = [
    [0, 5.2, 0, 2.3],
    [1.3, 4.6, 0.6, 1.6],
    [-1.1, 4.9, -0.8, 1.7],
  ];
  for (const [x, y, z, r] of crowns) {
    const crown = roughen(new THREE.IcosahedronGeometry(r, 1), 0.35, Math.round(x * 10 + z * 7 + 3));
    crown.scale(1, 0.72, 1);
    crown.translate(x, y, z);
    parts.push(crown);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  const geo = merged ?? trunk;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < 3.2) {
      colors[i * 3] = 0.36;
      colors[i * 3 + 1] = 0.25;
      colors[i * 3 + 2] = 0.15;
    } else {
      const t = THREE.MathUtils.clamp((y - 3.4) / 3.6, 0, 1);
      colors[i * 3] = 0.08 + t * 0.2;
      colors[i * 3 + 1] = 0.3 + t * 0.42;
      colors[i * 3 + 2] = 0.08 + t * 0.12;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function placeCanopy() {
  const spots: THREE.Vector3[] = [];
  for (let x = -220; x <= 120 && spots.length < 520; x += 9) {
    for (let z = 40; z <= 210 && spots.length < 520; z += 9) {
      const jitterX = x + Math.sin(x * 0.21 + z * 0.07) * 2.4;
      const jitterZ = z + Math.cos(z * 0.19 + x * 0.05) * 2.4;
      if (rainforestMask(jitterX, jitterZ) < 0.28) continue;
      const sample = sampleIsland(jitterX, jitterZ);
      if (sample.depth > 0.2 || sample.floor < 2 || sample.floor > 16) continue;
      if (Math.hypot(jitterX - 8, jitterZ - 48) < 28) continue;
      if ((x + z) % 18 === 0) continue;
      spots.push(new THREE.Vector3(jitterX, sample.floor, jitterZ));
    }
  }
  return spots;
}

function rockGeometry() {
  const geo = roughen(new THREE.IcosahedronGeometry(1.1, 2), 0.42, 77);
  geo.scale(1.2, 0.85, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 1.4 + 0.5, 0, 1);
    const band = 0.5 + 0.5 * Math.sin(pos.getY(i) * 6 + pos.getX(i) * 2);
    colors[i * 3] = 0.42 + t * 0.26 + band * 0.05;
    colors[i * 3 + 1] = 0.39 + t * 0.24 + band * 0.04;
    colors[i * 3 + 2] = 0.36 + t * 0.2;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function placeRocks() {
  const spots: { pos: THREE.Vector3; scale: number; solid: boolean }[] = [];
  for (let i = 0; i < 180; i += 1) {
    const angle = i * 2.399;
    const radius = 40 + (i % 17) * 16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.9 - 20;
    const sample = sampleIsland(x, z);
    if (sample.floor < -8 || (sample.depth === 0 && sample.floor < 1.2)) continue;
    const scale = sample.depth > 1 ? 1.4 + (i % 5) * 0.35 : 0.8 + (i % 4) * 0.4;
    spots.push({ pos: new THREE.Vector3(x, sample.floor, z), scale, solid: scale > 1.5 && sample.floor > -1 });
  }
  const summits = [
    { x: -48, z: -178 },
    { x: 62, z: -88 },
    { x: -150, z: 40 },
  ];
  for (const summit of summits) {
    for (let i = 0; i < 26; i += 1) {
      const angle = i * 0.86 + summit.x;
      const radius = 26 + (i % 6) * 16;
      const x = summit.x + Math.cos(angle) * radius;
      const z = summit.z + Math.sin(angle) * radius * 0.85;
      const floor = islandFloor(x, z);
      if (floor < 16 || floor > 96) continue;
      spots.push({ pos: new THREE.Vector3(x, floor, z), scale: 2.2 + (i % 4) * 1.15, solid: false });
    }
  }
  return spots;
}

function grassGeometry() {
  const a = new THREE.PlaneGeometry(1.1, 0.9);
  a.translate(0, 0.45, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const c = a.clone();
  c.rotateY(Math.PI / 4);
  const merged = mergeGeometries([a, b, c], false);
  a.dispose();
  b.dispose();
  c.dispose();
  return merged ?? new THREE.PlaneGeometry(1, 1);
}

function placeGrass() {
  const spots: THREE.Vector3[] = [];
  const rand = seeded(311);
  for (let x = -330; x <= 330 && spots.length < 700; x += 7) {
    for (let z = -290; z <= 290 && spots.length < 700; z += 7) {
      const jx = x + (rand() - 0.5) * 6;
      const jz = z + (rand() - 0.5) * 6;
      const floor = islandFloor(jx, jz);
      if (floor < 1.1 || floor > 3.4) continue;
      if (rand() > 0.55) continue;
      if (pierHeight(jx, jz) !== null || lodgeHeight(jx, jz) !== null) continue;
      if (Math.hypot(jx - SHACK.x, jz - SHACK.z) < 5) continue;
      spots.push(new THREE.Vector3(jx, floor - 0.05, jz));
    }
  }
  return spots;
}

function placeBushes() {
  const spots: THREE.Vector3[] = [];
  const rand = seeded(433);
  for (let x = -330; x <= 330 && spots.length < 160; x += 15) {
    for (let z = -290; z <= 290 && spots.length < 160; z += 15) {
      const jx = x + (rand() - 0.5) * 10;
      const jz = z + (rand() - 0.5) * 10;
      const floor = islandFloor(jx, jz);
      if (floor < 2.4 || floor > 9) continue;
      if (rand() > 0.42) continue;
      if (lodgeHeight(jx, jz) !== null || Math.hypot(jx - 8, jz - 48) < 26) continue;
      spots.push(new THREE.Vector3(jx, floor, jz));
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export function buildIslandWorld(): World {
  const group = new THREE.Group();
  group.name = 'island-paradise';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: (THREE.Texture | null)[] = [];
  const obstacles: Obstacle[] = [];
  const occluders: THREE.Object3D[] = [];
  const dummy = new THREE.Object3D();
  const windUniforms = { time: { value: 0 } };
  const keepMaterial = <T extends THREE.Material>(m: T) => {
    materials.push(m);
    return m;
  };
  const keepGeometry = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g);
    return g;
  };

  // --- Terrain ---------------------------------------------------------------------------
  const terrainUniforms = { time: { value: 0 }, trails: { value: trails } };
  const groundMat = keepMaterial(terrainMaterial(terrainUniforms));
  const chunkSize = ISLAND_SPAN / CHUNK;
  for (let cx = 0; cx < CHUNK; cx += 1) {
    for (let cz = 0; cz < CHUNK; cz += 1) {
      const ox = -ISLAND_HALF + chunkSize * (cx + 0.5);
      const oz = -ISLAND_HALF + chunkSize * (cz + 0.5);
      const mesh = new THREE.Mesh(keepGeometry(chunkGeometry(ox, oz, chunkSize)), groundMat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // --- Ocean -----------------------------------------------------------------------------
  const depthMap = depthTexture();
  const oceanMat = keepMaterial(waterMaterial(depthMap));
  const oceanGeo = keepGeometry(new THREE.PlaneGeometry(ISLAND_SPAN, ISLAND_SPAN, 96, 96));
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.renderOrder = 2;
  group.add(ocean);

  // --- Sky -------------------------------------------------------------------------------
  const sky = buildDaySky();
  keepGeometry(sky.mesh.geometry);
  keepMaterial(sky.material);
  group.add(sky.mesh);

  // --- Palms: two leaning variants, trunks and fronds instanced separately ---------------
  const bark = barkTexture();
  const frond = frondTexture();
  textures.push(bark, frond);
  const barkMat = keepMaterial(
    swaying(new THREE.MeshStandardMaterial({ map: bark, color: bark ? 0xffffff : 0x8a6a48, roughness: 0.9 }), windUniforms, 7.5, 0.3),
  );
  const frondMat = keepMaterial(
    swaying(
      new THREE.MeshStandardMaterial({
        map: frond,
        color: frond ? 0xffffff : 0x3f9a3a,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.75,
        transparent: false,
      }),
      windUniforms,
      7.5,
      0.3,
    ),
  );
  const frondDepth = keepMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: frond, alphaTest: 0.5 }));
  const palms = placePalms();
  const variants = [
    { height: 6.6, bend: 1.4, fronds: 11, seed: 3 },
    { height: 7.8, bend: 2.4, fronds: 12, seed: 8 },
  ];
  const palmBatches: { count: number; items: THREE.Vector3[]; trunk: THREE.InstancedMesh; crown: THREE.InstancedMesh }[] = [];
  variants.forEach((variant, vi) => {
    const items = palms.filter((_, i) => i % variants.length === vi);
    const trunk = palmTrunk(variant.height, variant.bend);
    const trunkGeo = keepGeometry(trunk.geometry);
    const crownGeo = keepGeometry(palmFronds(trunk.top, variant.fronds, variant.seed));
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, barkMat, Math.max(1, items.length));
    const crownMesh = new THREE.InstancedMesh(crownGeo, frondMat, Math.max(1, items.length));
    trunkMesh.castShadow = true;
    crownMesh.castShadow = true;
    crownMesh.customDepthMaterial = frondDepth;
    items.forEach((spot, index) => {
      dummy.position.copy(spot);
      dummy.rotation.set(0, index * 0.7 + vi, 0);
      dummy.scale.setScalar(0.85 + (index % 5) * 0.08);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(index, dummy.matrix);
      crownMesh.setMatrixAt(index, dummy.matrix);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.count = items.length;
    crownMesh.count = items.length;
    group.add(trunkMesh, crownMesh);
    palmBatches.push({ count: items.length, items, trunk: trunkMesh, crown: crownMesh });
  });

  // --- Rainforest canopy -----------------------------------------------------------------
  const canopy = placeCanopy();
  const canopyGeo = keepGeometry(canopyGeometry());
  const canopyMat = keepMaterial(
    swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), windUniforms, 7, 0.12),
  );
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, Math.max(1, canopy.length));
  canopyMesh.castShadow = true;
  canopy.forEach((spot, index) => {
    dummy.position.copy(spot);
    dummy.rotation.set(0, index * 0.9, 0);
    const scale = 0.85 + (index % 5) * 0.16;
    dummy.scale.set(scale, scale * (0.9 + (index % 3) * 0.12), scale);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(index, dummy.matrix);
  });
  canopyMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.count = canopy.length;
  group.add(canopyMesh);

  // --- Rocks -----------------------------------------------------------------------------
  const rocks = placeRocks();
  const rockGeo = keepGeometry(rockGeometry());
  const rockMat = keepMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  rocks.forEach((rock, index) => {
    dummy.position.copy(rock.pos);
    dummy.position.y -= rock.scale * 0.2;
    dummy.rotation.set(index * 0.3, index * 0.4, 0);
    dummy.scale.setScalar(rock.scale);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(index, dummy.matrix);
    if (rock.solid) {
      obstacles.push({ kind: 'circle', x: rock.pos.x, z: rock.pos.z, r: rock.scale * 0.8 });
    }
  });
  rockMesh.instanceMatrix.needsUpdate = true;
  rockMesh.count = rocks.length;
  group.add(rockMesh);

  // --- Beach grass and flowering bushes --------------------------------------------------
  const grassTex = grassTexture();
  textures.push(grassTex);
  const grass = placeGrass();
  const grassGeo = keepGeometry(grassGeometry());
  const grassMat = keepMaterial(
    swaying(
      new THREE.MeshStandardMaterial({ map: grassTex, color: grassTex ? 0xffffff : 0x6aa84f, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
      windUniforms,
      0.9,
      0.12,
    ),
  );
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, Math.max(1, grass.length));
  grass.forEach((spot, index) => {
    dummy.position.copy(spot);
    dummy.rotation.set(0, index * 1.3, 0);
    const s = 0.8 + (index % 4) * 0.18;
    dummy.scale.set(s, s * (0.8 + (index % 3) * 0.2), s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(index, dummy.matrix);
  });
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.count = grass.length;
  group.add(grassMesh);

  const bushTex = bushTexture();
  textures.push(bushTex);
  const bushes = placeBushes();
  const bushGeo = keepGeometry(roughen(new THREE.SphereGeometry(1.05, 12, 8), 0.3, 91));
  bushGeo.scale(1, 0.72, 1);
  const bushMat = keepMaterial(new THREE.MeshStandardMaterial({ map: bushTex, color: bushTex ? 0xffffff : 0x2f7a2f, roughness: 0.9 }));
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(1, bushes.length));
  bushMesh.castShadow = true;
  bushes.forEach((spot, index) => {
    dummy.position.copy(spot);
    dummy.position.y += 0.4;
    dummy.rotation.set(0, index * 0.8, 0);
    const s = 0.9 + (index % 4) * 0.25;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(index, dummy.matrix);
    obstacles.push({ kind: 'circle', x: spot.x, z: spot.z, r: s * 0.7 });
  });
  bushMesh.instanceMatrix.needsUpdate = true;
  bushMesh.count = bushes.length;
  group.add(bushMesh);

  // --- Shared building materials ---------------------------------------------------------
  const planks = plankSurface();
  const thatch = thatchSurface();
  textures.push(...planks.textures, ...thatch.textures);
  const plankMat = keepMaterial(surfaceMaterial(planks, { color: planks.map ? 0xffffff : 0x9a6a3a, roughness: planks.roughnessMap ? 1 : 0.8, envMapIntensity: 0.6 }));
  const thatchMat = keepMaterial(surfaceMaterial(thatch, { color: thatch.map ? 0xffffff : 0xb08a40, roughness: 1, envMapIntensity: 0.4 }));
  const postMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 }));
  const ropeMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0xcdb98a, roughness: 1 }));
  const plasterMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0xf6f0dc, roughness: 0.8 }));
  const glassMat = keepMaterial(
    new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, envMapIntensity: 1.5 }),
  );
  const darkMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 }));

  const addBox = (
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    options: { block?: boolean; occlude?: boolean; cast?: boolean; yaw?: number } = {},
  ) => {
    const mesh = new THREE.Mesh(keepGeometry(new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    if (options.yaw) mesh.rotation.y = options.yaw;
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (options.block) obstacles.push({ kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (options.occlude) occluders.push(mesh);
    return mesh;
  };

  const addPost = (material: THREE.Material, x: number, y0: number, y1: number, z: number, r = 0.14) => {
    const mesh = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(r, r * 1.1, y1 - y0, 8)), material);
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  /** Four-sided thatched roof scaled onto a rectangle. */
  const addThatchRoof = (x: number, y: number, z: number, halfX: number, halfZ: number, height: number) => {
    const geo = keepGeometry(new THREE.ConeGeometry(1, 1, 4, 1, false));
    geo.rotateY(Math.PI / 4);
    const mesh = new THREE.Mesh(geo, thatchMat);
    mesh.scale.set(halfX / Math.SQRT1_2, height, halfZ / Math.SQRT1_2);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    group.add(mesh);
    const eave = new THREE.Mesh(keepGeometry(new THREE.BoxGeometry(halfX * 2 + 0.2, 0.22, halfZ * 2 + 0.2)), thatchMat);
    eave.position.set(x, y, z);
    group.add(eave);
    return mesh;
  };

  // --- Pier off the spawn beach ----------------------------------------------------------
  {
    const stepLen = PIER.stepZ - PIER.z0;
    addBox(plankMat, PIER.x, PIER.step - 0.12, (PIER.z0 + PIER.stepZ) / 2, PIER.half * 2 + 0.3, 0.24, stepLen, { cast: false });
    const deckLen = PIER.z1 - PIER.stepZ;
    const deck = addBox(plankMat, PIER.x, PIER.deck - 0.12, (PIER.stepZ + PIER.z1) / 2, PIER.half * 2 + 0.3, 0.24, deckLen, { cast: true });
    (deck.material as THREE.MeshStandardMaterial).map?.repeat.set(1, deckLen / 4);
    addBox(plankMat, PIER.x, PIER.deck - 0.12, (PIER.endZ0 + PIER.endZ1) / 2, PIER.endHalf * 2 + 0.3, 0.24, PIER.endZ1 - PIER.endZ0, { cast: true });
    // Posts down into the water, rails along the deck, open at the end for diving.
    for (let z = PIER.stepZ + 1; z <= PIER.endZ1 - 1; z += 4.5) {
      const half = z >= PIER.endZ0 ? PIER.endHalf : PIER.half;
      for (const side of [-1, 1]) {
        const x = PIER.x + side * (half + 0.05);
        const bottom = Math.min(islandFloor(x, z), PIER.deck) - 0.8;
        addPost(postMat, x, bottom, PIER.deck + 1.05, z, 0.13);
      }
    }
    for (const side of [-1, 1]) {
      const x = PIER.x + side * (PIER.half + 0.05);
      const railLen = PIER.endZ0 - PIER.stepZ - 1.5;
      const rail = addBox(postMat, x, PIER.deck + 1.0, PIER.stepZ + 1 + railLen / 2, 0.1, 0.1, railLen, { cast: false });
      rail.receiveShadow = false;
      obstacles.push({ kind: 'box', minX: x - 0.12, maxX: x + 0.12, minZ: PIER.stepZ + 1, maxZ: PIER.endZ0 });
      const xe = PIER.x + side * (PIER.endHalf + 0.05);
      addBox(postMat, xe, PIER.deck + 1.0, (PIER.endZ0 + PIER.endZ1) / 2, 0.1, 0.1, PIER.endZ1 - PIER.endZ0, { cast: false });
      obstacles.push({ kind: 'box', minX: xe - 0.12, maxX: xe + 0.12, minZ: PIER.endZ0, maxZ: PIER.endZ1 });
      // Short return where the deck widens.
      addBox(postMat, PIER.x + side * (PIER.half + PIER.endHalf) / 2 + side * 0.05, PIER.deck + 1.0, PIER.endZ0, PIER.endHalf - PIER.half, 0.1, 0.1, { cast: false });
      obstacles.push({ kind: 'box', minX: Math.min(x, xe), maxX: Math.max(x, xe), minZ: PIER.endZ0 - 0.12, maxZ: PIER.endZ0 + 0.12 });
    }
    // Lanterns on the end posts.
    const lanternMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffb050, emissiveIntensity: 0.9, roughness: 0.4 }));
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(keepGeometry(new THREE.OctahedronGeometry(0.22, 0)), lanternMat);
      l.position.set(PIER.x + side * (PIER.endHalf + 0.05), PIER.deck + 1.35, PIER.endZ1 - 1);
      group.add(l);
    }
    // A leaning paopu-style palm on a rock beside the platform.
    const islet = new THREE.Mesh(rockGeo, rockMat);
    islet.position.set(PIER.x - 10, -1.3, PIER.endZ1 - 1);
    islet.scale.set(4.2, 3.2, 3.6);
    islet.castShadow = true;
    group.add(islet);
    const lean = palmTrunk(5.8, 3.4);
    const leanTrunk = new THREE.Mesh(keepGeometry(lean.geometry), barkMat);
    const leanCrown = new THREE.Mesh(keepGeometry(palmFronds(lean.top, 12, 21)), frondMat);
    leanCrown.customDepthMaterial = frondDepth;
    for (const m of [leanTrunk, leanCrown]) {
      m.position.set(PIER.x - 10, 1.2, PIER.endZ1 - 1);
      m.rotation.y = -Math.PI / 2 - 0.4;
      m.castShadow = true;
      group.add(m);
    }
  }

  // --- Beach shack -----------------------------------------------------------------------
  {
    const { x, z, base } = SHACK;
    addBox(plankMat, x, base + 1.5, z, 5.2, 3.0, 4.4, { block: true, occlude: true });
    addThatchRoof(x, base + 3.05, z, 3.1, 2.7, 1.9);
    addBox(darkMat, x, base + 1.1, z + 2.25, 1.1, 2.2, 0.12, { cast: false });
    addBox(glassMat, x + 1.6, base + 1.8, z + 2.25, 1.0, 0.8, 0.08, { cast: false });
    addBox(glassMat, x + 2.65, base + 1.8, z - 0.4, 0.08, 0.8, 1.2, { cast: false });
    for (const [dx, dz] of [
      [-3.1, 1.4],
      [-3.4, 0.2],
    ]) {
      const barrel = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10)), postMat);
      barrel.position.set(x + dx, islandFloor(x + dx, z + dz) + 0.5, z + dz);
      barrel.castShadow = true;
      group.add(barrel);
      obstacles.push({ kind: 'circle', x: x + dx, z: z + dz, r: 0.5 });
    }
    // Surfboards against the wall.
    const boardMats = [0xff6b9d, 0x4fd2ff, 0xffe066].map((c) => keepMaterial(new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 })));
    boardMats.forEach((m, i) => {
      const board = new THREE.Mesh(keepGeometry(new THREE.CapsuleGeometry(0.28, 1.7, 4, 8)), m);
      board.scale.set(1, 1, 0.25);
      board.position.set(x + 2.75, base + 1.2, z + 1.2 - i * 0.7);
      board.rotation.set(0.18, Math.PI / 2, 0);
      board.castShadow = true;
      group.add(board);
    });
  }

  // --- Tiki torches around the spawn beach ----------------------------------------------
  const flameMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xff7a1c, emissiveIntensity: 2.2, roughness: 0.5 }));
  const flames: THREE.Mesh[] = [];
  for (const [tx, tz] of [
    [-86, 246],
    [-66, 246],
    [-50, 258],
    [-62, 258],
    [-104, 236],
    [-40, 246],
    [-90, 230],
  ]) {
    const floor = islandFloor(tx, tz);
    addPost(postMat, tx, floor - 0.2, floor + 2.1, tz, 0.07);
    const bowl = new THREE.Mesh(keepGeometry(new THREE.ConeGeometry(0.22, 0.4, 8, 1, true)), ropeMat);
    bowl.position.set(tx, floor + 2.25, tz);
    bowl.rotation.x = Math.PI;
    group.add(bowl);
    const flame = new THREE.Mesh(keepGeometry(new THREE.SphereGeometry(0.16, 7, 6)), flameMat);
    flame.position.set(tx, floor + 2.6, tz);
    flame.scale.set(1, 1.8, 1);
    group.add(flame);
    flames.push(flame);
    obstacles.push({ kind: 'circle', x: tx, z: tz, r: 0.25 });
  }

  // --- Driftwood -------------------------------------------------------------------------
  for (const [dx, dz, yaw] of [
    [-30, 252, 0.4],
    [18, 238, -0.8],
    [-120, 236, 1.1],
  ]) {
    const log = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(0.22, 0.3, 4.2, 7)), postMat);
    log.position.set(dx, islandFloor(dx, dz) + 0.2, dz);
    log.rotation.set(0, yaw, Math.PI / 2);
    log.castShadow = true;
    group.add(log);
    obstacles.push({ kind: 'circle', x: dx, z: dz, r: 1.2 });
  }

  // --- Resort: veranda deck, plaster lodge with glass, thatched hip roof, bungalows -------
  const lodge = addBox(plankMat, LODGE.x, (LODGE.floor + LODGE.deck) / 2, LODGE.z, LODGE.halfX * 2, LODGE.deck - LODGE.floor, LODGE.halfZ * 2, { cast: false });
  (lodge.material as THREE.MeshStandardMaterial).map?.repeat.set(LODGE.halfX / 2, LODGE.halfZ / 2);
  const lodgeBody = addBox(plasterMat, LODGE.x, LODGE.deck + 2.5, LODGE.z, 18, 5.0, 11, { block: true, occlude: true });
  addBox(plankMat, LODGE.x, LODGE.deck + 0.55, LODGE.z, 18.12, 1.1, 11.12, { cast: false });
  addBox(darkMat, LODGE.x, LODGE.deck + 4.9, LODGE.z, 18.16, 0.24, 11.16, { cast: false });
  obstacles.push({ kind: 'box', minX: LODGE.x - 9.2, maxX: LODGE.x + 9.2, minZ: LODGE.z - 5.7, maxZ: LODGE.z + 5.7 });
  for (const side of [-1, 1]) {
    for (const wx of [-5.5, 0, 5.5]) {
      // Dark room behind the pane, pane proud of the wall so the frame shows as a border.
      addBox(darkMat, LODGE.x + wx, LODGE.deck + 2.4, LODGE.z + side * 5.51, 3.8, 2.8, 0.06, { cast: false });
      addBox(glassMat, LODGE.x + wx, LODGE.deck + 2.4, LODGE.z + side * 5.57, 3.4, 2.4, 0.08, { cast: false });
    }
    addBox(glassMat, LODGE.x + side * 9.02, LODGE.deck + 2.4, LODGE.z, 0.1, 2.6, 4.4, { cast: false });
  }
  addBox(darkMat, LODGE.x, LODGE.deck + 1.3, LODGE.z + 5.6, 2.2, 2.6, 0.1, { cast: false });
  addThatchRoof(LODGE.x, LODGE.deck + 5.05, LODGE.z, 11, 7.6, 3.6);
  for (const [px, pz] of [
    [-13, -9],
    [13, -9],
    [-13, 9],
    [13, 9],
    [0, -9.4],
    [0, 9.4],
  ]) {
    addPost(postMat, LODGE.x + px, LODGE.deck, LODGE.deck + 4.6, LODGE.z + pz, 0.18);
  }
  // Veranda awning.
  addBox(thatchMat, LODGE.x, LODGE.deck + 4.7, LODGE.z + 8.4, 26, 0.2, 4.2, { cast: true });
  addBox(thatchMat, LODGE.x, LODGE.deck + 4.7, LODGE.z - 8.4, 26, 0.2, 4.2, { cast: true });
  // Lounge chairs and umbrellas on the lawn south-west of the lodge.
  const canvasA = stripeTexture('#ff5f7e', '#fff5e6', 61);
  const canvasB = stripeTexture('#2fb7ff', '#fff5e6', 62);
  textures.push(canvasA, canvasB);
  const umbMats = [canvasA, canvasB].map((t, i) =>
    keepMaterial(new THREE.MeshStandardMaterial({ map: t, color: t ? 0xffffff : i ? 0x2fb7ff : 0xff5f7e, roughness: 0.8, side: THREE.DoubleSide })),
  );
  const chairMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.7 }));
  for (const [ux, uz, i] of [
    [100, 112, 0],
    [106, 118, 1],
    [96, 106, 1],
    [140, 120, 0],
  ]) {
    const floor = islandFloor(ux, uz);
    addPost(postMat, ux, floor, floor + 2.6, uz, 0.05);
    const top = new THREE.Mesh(keepGeometry(new THREE.ConeGeometry(1.9, 0.75, 10, 1, true)), umbMats[i]);
    top.position.set(ux, floor + 2.6, uz);
    top.castShadow = true;
    group.add(top);
    obstacles.push({ kind: 'circle', x: ux, z: uz, r: 0.2 });
    const chair = addBox(chairMat, ux + 1.4, floor + 0.3, uz + 0.6, 0.8, 0.16, 2.0, { cast: true });
    chair.rotation.y = 0.2;
    const back = addBox(chairMat, ux + 1.4, floor + 0.75, uz - 0.3, 0.8, 0.7, 0.14, { cast: true });
    back.rotation.set(-0.5, 0.2, 0);
    obstacles.push({ kind: 'box', minX: ux + 0.9, maxX: ux + 1.9, minZ: uz - 0.5, maxZ: uz + 1.7 });
  }
  for (const cabin of [
    { x: 146, z: 78 },
    { x: 146, z: 112 },
  ]) {
    addBox(plankMat, cabin.x, LODGE.floor + 0.2, cabin.z, 8, 0.4, 7, { cast: false });
    addBox(plankMat, cabin.x, LODGE.floor + 0.4 + 1.5, cabin.z, 6.5, 3.0, 5.5, { block: true, occlude: true });
    addThatchRoof(cabin.x, LODGE.floor + 3.45, cabin.z, 3.9, 3.4, 2.0);
    addBox(darkMat, cabin.x - 3.3, LODGE.floor + 1.5, cabin.z, 0.1, 2.1, 1.0, { cast: false });
    addBox(glassMat, cabin.x, LODGE.floor + 2.1, cabin.z + 2.78, 1.6, 0.9, 0.08, { cast: false });
    addBox(glassMat, cabin.x, LODGE.floor + 2.1, cabin.z - 2.78, 1.6, 0.9, 0.08, { cast: false });
  }

  // --- Cave and grotto ceilings ----------------------------------------------------------
  const caveMat = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1 }));
  const caveLength = ISLAND_CAVE.maxZ - ISLAND_CAVE.minZ;
  const caveWidth = ISLAND_CAVE.maxX - ISLAND_CAVE.minX;
  const ceiling = new THREE.Mesh(keepGeometry(roughen(new THREE.BoxGeometry(caveWidth + 8, 8, caveLength - 8, 6, 2, 10), 0.08, 5)), caveMat);
  ceiling.position.set((ISLAND_CAVE.minX + ISLAND_CAVE.maxX) / 2, 10.4, (ISLAND_CAVE.minZ + ISLAND_CAVE.maxZ) / 2 - 4);
  ceiling.castShadow = true;
  group.add(ceiling);
  occluders.push(ceiling);
  const grotto = new THREE.Mesh(
    keepGeometry(roughen(new THREE.BoxGeometry(ISLAND_GROTTO.maxX - ISLAND_GROTTO.minX + 6, 9, ISLAND_GROTTO.maxZ - ISLAND_GROTTO.minZ + 4, 6, 2, 6), 0.08, 6)),
    caveMat,
  );
  grotto.position.set((ISLAND_GROTTO.minX + ISLAND_GROTTO.maxX) / 2, 9.6, (ISLAND_GROTTO.minZ + ISLAND_GROTTO.maxZ) / 2);
  grotto.castShadow = true;
  group.add(grotto);
  for (const side of [ISLAND_CAVE.minX + 1.5, ISLAND_CAVE.maxX - 1.5]) {
    const pillar = new THREE.Mesh(rockGeo, rockMat);
    pillar.position.set(side, ISLAND_CAVE.floor + 3.2, ISLAND_CAVE.maxZ + 1);
    pillar.scale.set(2.2, 4.2, 2.2);
    pillar.castShadow = true;
    group.add(pillar);
  }
  obstacles.push({ kind: 'box', minX: ISLAND_CAVE.minX - 2, maxX: ISLAND_CAVE.minX + 2, minZ: ISLAND_CAVE.minZ, maxZ: ISLAND_CAVE.maxZ });
  obstacles.push({ kind: 'box', minX: ISLAND_CAVE.maxX - 2, maxX: ISLAND_CAVE.maxX + 2, minZ: ISLAND_CAVE.minZ, maxZ: ISLAND_CAVE.maxZ });

  // --- Waterfalls ------------------------------------------------------------------------
  const fallMat = keepMaterial(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          float streak = 0.45 + 0.55 * sin(vUv.x * 26.0 + vUv.y * 48.0 - time * 7.0);
          float turbulence = inoise(vec2(vUv.x * 9.0, vUv.y * 14.0 - time * 2.2));
          float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          vec3 col = mix(vec3(0.66, 0.9, 0.98), vec3(0.98, 0.99, 1.0), streak * 0.6 + turbulence * 0.4);
          float mist = smoothstep(0.35, 0.0, vUv.y) * 0.4;
          gl_FragColor = vec4(col, (0.3 + streak * 0.4 + mist) * edge);
        }
      `,
    }),
  );
  const foamMat = keepMaterial(new THREE.MeshBasicMaterial({ color: 0xeefaff, transparent: true, opacity: 0.5, depthWrite: false }));
  for (const fall of ISLAND_FALLS) {
    const top = islandFloor(fall.lipX, fall.lipZ);
    const bottom = Math.min(0.35, islandFloor(fall.poolX, fall.poolZ));
    const drop = Math.max(8, top - bottom);
    const geo = keepGeometry(new THREE.PlaneGeometry(fall.halfWidth * 1.7, drop));
    const sheet = new THREE.Mesh(geo, fallMat);
    const dx = fall.poolX - fall.lipX;
    const dz = fall.poolZ - fall.lipZ;
    const yaw = Math.atan2(dx, dz);
    sheet.position.set((fall.lipX + fall.poolX) / 2, bottom + drop / 2, (fall.lipZ + fall.poolZ) / 2);
    sheet.rotation.y = yaw;
    group.add(sheet);
    const ribbon = new THREE.Mesh(geo, fallMat);
    ribbon.position.copy(sheet.position);
    ribbon.position.x += Math.cos(yaw) * 2.1;
    ribbon.position.z -= Math.sin(yaw) * 2.1;
    ribbon.rotation.y = yaw;
    ribbon.scale.set(0.45, 0.96, 1);
    group.add(ribbon);
    const foam = new THREE.Mesh(keepGeometry(new THREE.CircleGeometry(fall.halfWidth * 0.95, 14)), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(fall.poolX, Math.max(0.2, bottom + 0.35), fall.poolZ);
    group.add(foam);
  }

  // --- Alleys ----------------------------------------------------------------------------
  const alleys = islandAlleys().map((alley) => ({
    position: new THREE.Vector3(alley.x, islandFloor(alley.x, alley.z), alley.z),
    inward: new THREE.Vector3(alley.ix, 0, alley.iz).normalize(),
    aquatic: alley.aquatic,
  }));

  const disposed = { done: false };
  const animate = (time: number) => {
    if (disposed.done) return;
    clock = time;
    terrainUniforms.time.value = time;
    windUniforms.time.value = time;
    oceanMat.uniforms.time.value = time;
    fallMat.uniforms.time.value = time;
    sky.material.uniforms.time.value = time;
    for (let i = 0; i < flames.length; i += 1) {
      const f = flames[i];
      const flicker = 0.8 + 0.2 * Math.sin(time * 11 + i * 1.7) * Math.cos(time * 7.3 + i);
      f.scale.set(flicker, 1.6 + flicker * 0.5, flicker);
    }
    flameMat.emissiveIntensity = 2.0 + Math.sin(time * 9.1) * 0.35;
  };

  const dispose = () => {
    disposed.done = true;
    geometries.forEach((geo) => geo.dispose());
    materials.forEach((mat) => mat.dispose());
    disposeTextures(textures);
    depthMap.dispose();
  };

  return {
    group,
    obstacles,
    occluders: [lodgeBody, ceiling, ...occluders],
    alleys,
    alleyNodes: [],
    bounds: ISLAND_HALF - 6,
    spawnReach: 90,
    water: {
      surfaceAt: (x, z) => islandSurface(x, z, clock),
      // Decks stand clear of the wave, so nobody swims while standing on the pier.
      depthAt: (x, z) => {
        const deck = pierHeight(x, z) ?? lodgeHeight(x, z);
        if (deck !== null) return Math.max(0, islandSurface(x, z, clock) - deck);
        return sampleIsland(x, z, clock).depth;
      },
    },
    heightAt: (x, z) => pierHeight(x, z) ?? lodgeHeight(x, z) ?? islandFloor(x, z),
    stepTrail: (x, z) => {
      const last = trails[trailWrite];
      if (Math.hypot(last.x - x, last.y - z) < 0.85 && last.x < 4000) return;
      trailWrite = (trailWrite + 1) % trails.length;
      trails[trailWrite].set(x, z);
    },
    animate,
    dispose,
  };
}
