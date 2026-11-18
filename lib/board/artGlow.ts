/** Luminescent paint. Blend smudge stays in artSmudge.ts and is not used here. */

export type ArtRgb = { r: number; g: number; b: number };

export function parseArtHex(color: string): ArtRgb | null {
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function mix(a: ArtRgb, b: ArtRgb, t: number): ArtRgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function luminance(color: ArtRgb) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

/** Dark picks still emit light. Bright picks keep their hue. */
export function artGlowColor(color: string): ArtRgb {
  const parsed = parseArtHex(color) ?? { r: 255, g: 255, b: 255 };
  const lum = luminance(parsed);
  if (lum >= 0.45) return parsed;
  return mix(parsed, { r: 255, g: 255, b: 255 }, (0.45 - lum) / 0.45 * 0.8);
}

export function artGlowLayout(radius: number) {
  const core = Math.max(1, radius);
  const halo = Math.max(core * 4.4, core + 18);
  const step = Math.max(0.7, core * 0.28);
  return { core, halo, step };
}

function rgba(color: ArtRgb, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
}

export function stampArtGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number
) {
  if (radius <= 0 || alpha <= 0) return;
  const ink = parseArtHex(color) ?? { r: 255, g: 79, b: 216 };
  const glow = artGlowColor(color);
  const hot = mix(glow, { r: 255, g: 255, b: 255 }, 0.72);
  const { halo } = artGlowLayout(radius);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  const bloom = ctx.createRadialGradient(x, y, radius * 0.2, x, y, halo);
  bloom.addColorStop(0, rgba(hot, 0.9 * alpha));
  bloom.addColorStop(0.22, rgba(glow, 0.62 * alpha));
  bloom.addColorStop(0.55, rgba(glow, 0.28 * alpha));
  bloom.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius);
  core.addColorStop(0, rgba(hot, alpha));
  core.addColorStop(0.42, rgba(ink, 0.92 * alpha));
  core.addColorStop(1, rgba(ink, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Stamp a continuous luminescent stroke from (x0, y0) to (x1, y1), in CSS pixels. */
export function paintArtGlowSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  color: string,
  alpha: number
) {
  const { step } = artGlowLayout(radius);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    stampArtGlow(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, color, alpha);
  }
}
