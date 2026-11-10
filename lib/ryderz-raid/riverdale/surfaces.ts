import * as THREE from 'three';
import { blotches, grey, hasCanvas, makeSurface, paintTexture, speckle, type SurfaceMaps } from '../render/surfaces';

/**
 * Painted surfaces for The Riverdale Party: board-formed concrete with water
 * stains, layered graffiti, rust-red steel with chipped paint, a dirt floor
 * with leaf litter, and alpha cards for ferns, ivy and grass.
 */

const TAGS = ['BX', 'RYDZ', 'SENA', 'KOZE', 'DUKE', 'MOOK', 'VEX', 'TRIX', 'ZOOM', 'RIO', 'NEKO', 'BORO', 'SKY', 'OHM'];
const SPRAY = ['#e8e4dc', '#1b2a8a', '#c81f2a', '#2fa04a', '#f2c230', '#8a2fc8', '#20b8d8', '#f06aa0', '#111111', '#ff7a1a'];

function concreteBase(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, tone = 0.62) {
  ctx.fillStyle = grey(tone);
  ctx.fillRect(0, 0, w, h);
  const size = Math.max(w, h);
  speckle(ctx, size, (w * h) / 60, [150, 148, 142], 50, rand, 2);
  blotches(ctx, size, 26, (r) => `rgba(${70 + r() * 30}, ${68 + r() * 26}, ${60 + r() * 20}, ${0.12 + r() * 0.16})`, [w * 0.05, w * 0.3], rand);
  // Water runs down from the slab.
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * w;
    const len = h * (0.2 + rand() * 0.6);
    const grad = ctx.createLinearGradient(x, 0, x, len);
    grad.addColorStop(0, `rgba(40, 42, 38, ${0.2 + rand() * 0.25})`);
    grad.addColorStop(1, 'rgba(40, 42, 38, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 2 + rand() * w * 0.04, len);
  }
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(30, 30, 28, 0.55)';
  for (let i = 0; i < 6; i += 1) {
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    let x = rand() * w;
    let y = rand() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k += 1) {
      x += (rand() - 0.5) * w * 0.12;
      y += rand() * h * 0.06;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Dirt splash at the foot.
  const foot = ctx.createLinearGradient(0, h, 0, h * 0.82);
  foot.addColorStop(0, 'rgba(70, 52, 34, 0.7)');
  foot.addColorStop(1, 'rgba(70, 52, 34, 0)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
}

function spray(ctx: CanvasRenderingContext2D, rand: () => number) {
  return SPRAY[Math.floor(rand() * SPRAY.length)];
}

/** A quick marker or spray tag: a few looping strokes. */
function scribble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number) {
  ctx.strokeStyle = spray(ctx, rand);
  ctx.lineWidth = 2 + rand() * 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + h * rand());
  for (let i = 0; i < 6; i += 1) {
    ctx.bezierCurveTo(
      x + w * rand(),
      y + h * rand(),
      x + w * rand(),
      y + h * rand(),
      x + (w * (i + 1)) / 6,
      y + h * (0.3 + rand() * 0.4),
    );
  }
  ctx.stroke();
}

/** Bubble-letter throw-up: thick outline, fill, highlight and drips. */
function throwUp(ctx: CanvasRenderingContext2D, word: string, cx: number, cy: number, px: number, rand: () => number, rotate = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotate);
  ctx.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const outline = rand() < 0.5 ? '#111111' : spray(ctx, rand);
  const fill = rand() < 0.55 ? '#ecebe6' : spray(ctx, rand);
  ctx.strokeStyle = outline;
  ctx.lineWidth = px * 0.22;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(word, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = px * 0.03;
  ctx.strokeText(word, -px * 0.03, -px * 0.04);
  const width = ctx.measureText(word).width;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const dx = (rand() - 0.5) * width;
    ctx.beginPath();
    ctx.moveTo(dx, px * 0.35);
    ctx.lineTo(dx, px * (0.5 + rand() * 0.7));
    ctx.stroke();
  }
  ctx.restore();
}

export interface ColumnSkin {
  map: THREE.Texture | null;
}

/** Four column skins: bare stained concrete and three levels of graffiti up to head height. */
export function columnSkins(): ColumnSkin[] {
  const out: ColumnSkin[] = [];
  for (let v = 0; v < 4; v += 1) {
    const map = paintTexture(
      256,
      (ctx, size, rand) => {
        // The canvas is square but wraps a tall column: the lower third is the reachable band.
        concreteBase(ctx, size, size, rand, 0.6 + v * 0.02);
        if (v === 0) return;
        const band = size * 0.28;
        for (let i = 0; i < 3 + v * 3; i += 1) {
          scribble(ctx, rand() * size * 0.8, size - band - rand() * band * 0.6, size * (0.2 + rand() * 0.3), band * 0.4, rand);
        }
        if (v >= 2) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          throwUp(ctx, TAGS[Math.floor(rand() * TAGS.length)], size * (0.3 + rand() * 0.4), size - band * 0.7, size * 0.11, rand, -Math.PI / 2);
          ctx.restore();
        }
        if (v === 3) {
          // Painted-over patch where someone buffed an old tag.
          ctx.fillStyle = 'rgba(120, 122, 118, 0.85)';
          ctx.fillRect(size * 0.1, size - band * 1.2, size * 0.35, band * 0.35);
          scribble(ctx, size * 0.12, size - band * 1.15, size * 0.3, band * 0.25, rand);
        }
      },
      { seed: 31 + v * 7 },
    );
    if (map) map.wrapT = THREE.ClampToEdgeWrapping;
    out.push({ map });
  }
  return out;
}

/** Long strip of throw-ups and tags for the back retaining wall. */
export function wallGraffiti(seed: number) {
  if (!hasCanvas()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  concreteBase(ctx, 1024, 256, rand, 0.55);
  for (let i = 0; i < 4; i += 1) {
    throwUp(ctx, TAGS[Math.floor(rand() * TAGS.length)], 120 + i * 250 + rand() * 40, 150 + rand() * 40, 74 + rand() * 30, rand, (rand() - 0.5) * 0.12);
  }
  for (let i = 0; i < 14; i += 1) scribble(ctx, rand() * 960, 60 + rand() * 150, 60 + rand() * 90, 40, rand);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function slabConcrete(): SurfaceMaps {
  return makeSurface({
    size: 256,
    seed: 17,
    albedo: (ctx, size, rand) => {
      concreteBase(ctx, size, size, rand, 0.44);
      // Board-form lines.
      ctx.strokeStyle = 'rgba(30,30,30,0.25)';
      for (let y = 0; y < size; y += size / 8) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + rand() * 2);
        ctx.lineTo(size, y + rand() * 2);
        ctx.stroke();
      }
    },
    height: (ctx, size, rand) => {
      ctx.fillStyle = grey(0.5);
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, 2400, [128, 128, 128], 90, rand, 2);
    },
    roughness: (ctx, size) => {
      ctx.fillStyle = grey(0.92);
      ctx.fillRect(0, 0, size, size);
    },
    normalStrength: 2.2,
  });
}

export function rustSteel(): SurfaceMaps {
  return makeSurface({
    size: 256,
    seed: 23,
    albedo: (ctx, size, rand) => {
      ctx.fillStyle = '#8a2a22';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 40, (r) => `rgba(${90 + r() * 50}, ${40 + r() * 20}, ${24 + r() * 10}, 0.55)`, [6, 30], rand);
      // Chipped paint showing bare rust and dark scale.
      for (let i = 0; i < 160; i += 1) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(66, 36, 22, 0.9)' : 'rgba(150, 70, 36, 0.8)';
        ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 9, 1 + rand() * 4);
      }
      speckle(ctx, size, 1800, [120, 50, 36], 40, rand, 2);
    },
    height: (ctx, size, rand) => {
      ctx.fillStyle = grey(0.5);
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 60, (r) => (r() < 0.5 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)'), [3, 12], rand);
    },
    roughness: (ctx, size, rand) => {
      ctx.fillStyle = grey(0.7);
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 30, () => 'rgba(255,255,255,0.4)', [6, 20], rand);
    },
    normalStrength: 3,
  });
}

/** Packed dirt with leaf litter, pebbles and root lines. Tinted per vertex by the terrain. */
export function forestFloor(): SurfaceMaps {
  return makeSurface({
    size: 512,
    seed: 41,
    albedo: (ctx, size, rand) => {
      ctx.fillStyle = '#8a7258';
      ctx.fillRect(0, 0, size, size);
      blotches(ctx, size, 60, (r) => `rgba(${70 + r() * 40}, ${52 + r() * 30}, ${34 + r() * 20}, 0.45)`, [10, 60], rand);
      speckle(ctx, size, 9000, [120, 100, 80], 60, rand, 3);
      // Leaves.
      for (let i = 0; i < 900; i += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const tone = rand();
        ctx.fillStyle = tone < 0.4 ? 'rgba(110, 70, 30, 0.85)' : tone < 0.75 ? 'rgba(140, 104, 50, 0.8)' : 'rgba(70, 80, 36, 0.8)';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rand() * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + rand() * 4, 1.5 + rand() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Roots and twigs.
      ctx.strokeStyle = 'rgba(52, 36, 22, 0.7)';
      for (let i = 0; i < 40; i += 1) {
        ctx.lineWidth = 1 + rand() * 2.5;
        ctx.beginPath();
        const x = rand() * size;
        const y = rand() * size;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60, x + (rand() - 0.5) * 90, y + (rand() - 0.5) * 90);
        ctx.stroke();
      }
    },
    height: (ctx, size, rand) => {
      ctx.fillStyle = grey(0.5);
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, 6000, [128, 128, 128], 110, rand, 3);
      blotches(ctx, size, 50, (r) => (r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'), [8, 30], rand);
    },
    roughness: (ctx, size) => {
      ctx.fillStyle = grey(0.94);
      ctx.fillRect(0, 0, size, size);
    },
    normalStrength: 2.6,
    repeat: [1, 1],
  });
}

/** Alpha card of leaves: ferns, ivy, and broadleaf undergrowth share one sheet. */
export function leafCard(kind: 'fern' | 'ivy' | 'grass' | 'shrub' | 'canopy') {
  return paintTexture(
    256,
    (ctx, size, rand) => {
      ctx.clearRect(0, 0, size, size);
      if (kind === 'shrub' || kind === 'canopy') {
        // Pointed broadleaves (the park's spicebush and young maple), packed into a round clump.
        const leaf = (x: number, y: number, len: number, angle: number, tone: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          const g = 70 + tone * 80;
          ctx.fillStyle = `rgb(${34 + tone * 50}, ${g}, ${22 + tone * 24})`;
          ctx.beginPath();
          ctx.moveTo(0, -len);
          ctx.quadraticCurveTo(len * 0.55, -len * 0.25, 0, len * 0.45);
          ctx.quadraticCurveTo(-len * 0.55, -len * 0.25, 0, -len);
          ctx.fill();
          ctx.strokeStyle = `rgba(20, 40, 12, 0.5)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -len * 0.9);
          ctx.lineTo(0, len * 0.4);
          ctx.stroke();
          ctx.restore();
        };
        if (kind === 'canopy') {
          ctx.fillStyle = '#3a2c20';
          ctx.fillRect(size * 0.47, size * 0.55, size * 0.06, size * 0.45);
        }
        const cx = size / 2;
        const cy = kind === 'canopy' ? size * 0.38 : size / 2;
        const radius = kind === 'canopy' ? size * 0.42 : size * 0.46;
        const count = kind === 'canopy' ? 520 : 340;
        for (let i = 0; i < count; i += 1) {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(rand()) * radius;
          const x = cx + Math.cos(a) * d;
          const y = cy + Math.sin(a) * d * (kind === 'canopy' ? 0.8 : 1);
          // Darker inside, lit leaves toward the top edge.
          const tone = Math.min(1, 0.15 + (d / radius) * 0.45 + (1 - y / size) * 0.35 + rand() * 0.3);
          leaf(x, y, 9 + rand() * 9, rand() * Math.PI * 2, tone);
        }
        return;
      }
      if (kind === 'grass') {
        for (let i = 0; i < 70; i += 1) {
          const x = size * (0.1 + rand() * 0.8);
          ctx.strokeStyle = `rgb(${60 + rand() * 40}, ${100 + rand() * 50}, ${40 + rand() * 20})`;
          ctx.lineWidth = 2 + rand() * 2;
          ctx.beginPath();
          ctx.moveTo(x, size);
          ctx.quadraticCurveTo(x + (rand() - 0.5) * 30, size * 0.5, x + (rand() - 0.5) * 50, size * (0.1 + rand() * 0.4));
          ctx.stroke();
        }
        return;
      }
      if (kind === 'fern') {
        for (let f = 0; f < 5; f += 1) {
          const baseX = size / 2;
          const tipX = size * (0.15 + f * 0.17);
          const tipY = size * (0.08 + rand() * 0.15);
          ctx.strokeStyle = '#3d5a22';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(baseX, size);
          ctx.quadraticCurveTo((baseX + tipX) / 2, size * 0.45, tipX, tipY);
          ctx.stroke();
          for (let k = 0; k < 16; k += 1) {
            const t = k / 16;
            const x = baseX + (tipX - baseX) * t;
            const y = size + (tipY - size) * t;
            const len = (1 - t) * 26 + 6;
            ctx.fillStyle = `rgb(${50 + rand() * 30}, ${100 + rand() * 40}, ${36 + rand() * 20})`;
            ctx.beginPath();
            ctx.ellipse(x - len * 0.6, y, len * 0.6, 3, -0.4, 0, Math.PI * 2);
            ctx.ellipse(x + len * 0.6, y, len * 0.6, 3, 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        return;
      }
      for (let i = 0; i < 90; i += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 8 + rand() * 12;
        ctx.fillStyle = `rgb(${40 + rand() * 40}, ${86 + rand() * 50}, ${30 + rand() * 24})`;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r);
        ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r);
        ctx.fill();
      }
    },
    { seed: { fern: 61, ivy: 67, grass: 71, shrub: 73, canopy: 79 }[kind] },
  );
}

/** Dark facade of the building that sits on the slab: concrete bands and unlit windows. */
export function facade() {
  return paintTexture(
    256,
    (ctx, size, rand) => {
      concreteBase(ctx, size, size, rand, 0.5);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const lit = rand() < 0.12;
          ctx.fillStyle = lit ? 'rgba(255, 196, 120, 0.9)' : 'rgba(18, 20, 26, 0.92)';
          ctx.fillRect(col * 64 + 14, row * 64 + 18, 36, 30);
        }
      }
    },
    { seed: 83 },
  );
}

export function fabric(color: string, seed: number) {
  return paintTexture(
    128,
    (ctx, size, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, 1800, [90, 80, 70], 40, rand, 1);
      blotches(ctx, size, 10, () => 'rgba(30, 24, 20, 0.35)', [8, 26], rand);
    },
    { seed },
  );
}
