import type { MapBlock } from '@/lib/ryderz-raid/map-chart';

/** Footprints of walls, buildings, and other walk blockers. Blips paint on top. */
export function paintStructures(
  ctx: CanvasRenderingContext2D,
  blocks: readonly MapBlock[] | undefined,
  toX: (x: number) => number,
  toY: (z: number) => number,
  ppm: number,
) {
  if (!blocks?.length || ppm <= 0) return;
  ctx.fillStyle = 'rgba(217, 196, 154, 0.9)';
  ctx.strokeStyle = 'rgba(28, 18, 12, 0.88)';
  ctx.lineWidth = Math.max(1, ppm * 0.12);
  for (const block of blocks) {
    if (block.kind === 'circle') {
      const radius = Math.max(1.25, block.r * ppm);
      ctx.beginPath();
      ctx.arc(toX(block.x), toY(block.z), radius, 0, Math.PI * 2);
      ctx.fill();
      if (radius >= 3) ctx.stroke();
      continue;
    }
    const x0 = toX(block.minX);
    const y0 = toY(block.minZ);
    const x1 = toX(block.maxX);
    const y1 = toY(block.maxZ);
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    if (width < 0.4 && height < 0.4) continue;
    ctx.fillRect(left, top, width, height);
    if (Math.max(width, height) >= 4) ctx.strokeRect(left, top, width, height);
  }
}
