import * as THREE from 'three';

/**
 * Procedural PBR surfaces. Every arena paints its own albedo, height, and
 * roughness onto canvases at build time; the height canvas is turned into a
 * tangent-space normal map so flat planes catch light like real asphalt,
 * tile, or sand. Nothing here touches the DOM at import time, so the headless
 * checks can still build a world (they simply get untextured materials).
 */

export type Painter = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

export interface SurfaceMaps {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  textures: THREE.Texture[];
}

export interface SurfaceSpec {
  size?: number;
  seed?: number;
  albedo: Painter;
  /** Grey height field. Lighter is higher. */
  height?: Painter;
  /** Grey roughness. White is matte, black is a mirror. Green channel is sampled. */
  roughness?: Painter;
  normalStrength?: number;
  repeat?: [number, number];
  anisotropy?: number;
}

export function seeded(seed: number) {
  let state = (seed * 9301 + 49297) % 233280;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function hasCanvas() {
  return typeof document !== 'undefined';
}

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function finish(texture: THREE.Texture, srgb: boolean, repeat: [number, number] | undefined, anisotropy: number) {
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (repeat) texture.repeat.set(repeat[0], repeat[1]);
  texture.needsUpdate = true;
  return texture;
}

/** A single painted canvas texture. sRGB for colour, linear for data. */
export function paintTexture(
  size: number,
  paint: Painter,
  options: { seed?: number; srgb?: boolean; repeat?: [number, number]; anisotropy?: number } = {},
) {
  if (!hasCanvas()) return null;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx, size, seeded(options.seed ?? 1));
  return finish(new THREE.CanvasTexture(canvas), options.srgb ?? true, options.repeat, options.anisotropy ?? 8);
}

/** Sobel the luminance of a height canvas into an OpenGL-convention normal map. */
function normalFromHeight(height: HTMLCanvasElement, strength: number) {
  const size = height.width;
  const src = height.getContext('2d');
  if (!src) return null;
  const data = src.getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const h = (x: number, y: number) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    const i = (yy * size + xx) * 4;
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx =
        (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
      // Canvas rows run downward; tangent-space +V runs upward.
      const dy =
        (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1)) - (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1));
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

/** Albedo, normal, and roughness maps painted from one seed so they line up. */
export function makeSurface(spec: SurfaceSpec): SurfaceMaps {
  const empty: SurfaceMaps = { map: null, normalMap: null, roughnessMap: null, textures: [] };
  if (!hasCanvas()) return empty;
  const size = spec.size ?? 512;
  const anisotropy = spec.anisotropy ?? 8;
  const textures: THREE.Texture[] = [];

  const albedoCanvas = makeCanvas(size);
  const albedoCtx = albedoCanvas.getContext('2d');
  if (!albedoCtx) return empty;
  spec.albedo(albedoCtx, size, seeded(spec.seed ?? 1));
  const map = finish(new THREE.CanvasTexture(albedoCanvas), true, spec.repeat, anisotropy);
  textures.push(map);

  let normalMap: THREE.Texture | null = null;
  if (spec.height) {
    const heightCanvas = makeCanvas(size);
    const heightCtx = heightCanvas.getContext('2d');
    if (heightCtx) {
      spec.height(heightCtx, size, seeded((spec.seed ?? 1) + 7));
      const normalCanvas = normalFromHeight(heightCanvas, spec.normalStrength ?? 2);
      if (normalCanvas) {
        normalMap = finish(new THREE.CanvasTexture(normalCanvas), false, spec.repeat, anisotropy);
        textures.push(normalMap);
      }
    }
  }

  let roughnessMap: THREE.Texture | null = null;
  if (spec.roughness) {
    const roughCanvas = makeCanvas(size);
    const roughCtx = roughCanvas.getContext('2d');
    if (roughCtx) {
      spec.roughness(roughCtx, size, seeded((spec.seed ?? 1) + 13));
      roughnessMap = finish(new THREE.CanvasTexture(roughCanvas), false, spec.repeat, anisotropy);
      textures.push(roughnessMap);
    }
  }

  return { map, normalMap, roughnessMap, textures };
}

/** Standard material wired to a painted surface. Repeat applies to every map. */
export function surfaceMaterial(
  maps: SurfaceMaps,
  params: THREE.MeshStandardMaterialParameters & { normalScale?: number } = {},
) {
  const { normalScale, ...rest } = params;
  const material = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    ...rest,
  });
  if (maps.normalMap) material.normalScale.setScalar(normalScale ?? 1);
  return material;
}

/** Clone a surface's maps with a different tiling so one painting can cover several sizes. */
export function retile(maps: SurfaceMaps, repeat: [number, number]): SurfaceMaps {
  const copy = (t: THREE.Texture | null) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const map = copy(maps.map);
  const normalMap = copy(maps.normalMap);
  const roughnessMap = copy(maps.roughnessMap);
  return {
    map,
    normalMap,
    roughnessMap,
    textures: [map, normalMap, roughnessMap].filter((t): t is THREE.Texture => Boolean(t)),
  };
}

// ---------------------------------------------------------------------------
// Painting helpers shared by the arenas
// ---------------------------------------------------------------------------

export function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  rgb: [number, number, number],
  spread: number,
  rand: () => number,
  dot = 2,
) {
  for (let i = 0; i < count; i += 1) {
    const d = Math.floor((rand() - 0.5) * spread);
    ctx.fillStyle = `rgb(${rgb[0] + d}, ${rgb[1] + d}, ${rgb[2] + d})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * dot, 1 + rand() * dot);
  }
}

/** Soft blotches, for stains, wear, damp patches, and cloud shadows. */
export function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  color: (rand: () => number) => string,
  radius: [number, number],
  rand: () => number,
) {
  for (let i = 0; i < count; i += 1) {
    const r = radius[0] + rand() * (radius[1] - radius[0]);
    const x = rand() * size;
    const y = rand() * size;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = color(rand);
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Grid of tiles with grout. Returns nothing; paints both the tile faces and joints. */
export function tiles(
  ctx: CanvasRenderingContext2D,
  size: number,
  across: number,
  face: (rand: () => number) => string,
  grout: string,
  groutWidth: number,
  rand: () => number,
) {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const pitch = size / across;
  for (let y = 0; y < across; y += 1) {
    for (let x = 0; x < across; x += 1) {
      ctx.fillStyle = face(rand);
      ctx.fillRect(x * pitch + groutWidth / 2, y * pitch + groutWidth / 2, pitch - groutWidth, pitch - groutWidth);
    }
  }
}

/** Grey helper. 0 black, 1 white. */
export function grey(v: number) {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c}, ${c}, ${c})`;
}

/** Text decal with a transparent background, for signage and screens. */
export function textTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  if (!hasCanvas()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Dispose every texture a world painted. */
export function disposeTextures(list: (THREE.Texture | null | undefined)[]) {
  for (const texture of list) texture?.dispose();
}

/** Mark GLB materials so the arena's PBR lighting reaches them and the camera stays honest about shadows. */
export function adoptImportedMesh(mesh: THREE.Mesh, envMapIntensity = 1) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of list) {
    if (!material) continue;
    material.userData.retain = true;
    const standard = material as THREE.MeshStandardMaterial;
    if (standard.isMeshStandardMaterial) standard.envMapIntensity = envMapIntensity;
  }
}
