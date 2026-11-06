import { DISTRICT_SPAN } from './config';
import type { ArenaDefinition } from './arenas';
import { ISLAND_HALF, ISLAND_LANDMARKS, islandChartColor } from './island/terrain';

/** Draw the select-screen chart for one arena. Coordinates are metres, +X east, +Z south. */
export function paintArenaPreview(ctx: CanvasRenderingContext2D, arena: ArenaDefinition, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#07060c';
  ctx.fillRect(0, 0, size, size);
  if (arena.id === 'island-paradise') paintIsland(ctx, arena, size);
  else if (arena.id === 'training-pad') paintPad(ctx, arena, size);
  else paintBlock(ctx, arena, size);
  if (!arena.available) {
    ctx.fillStyle = 'rgba(7, 6, 12, 0.55)';
    ctx.fillRect(0, 0, size, size);
  }
}

function frame(minX: number, maxX: number, minZ: number, maxZ: number, size: number) {
  const pad = size * 0.08;
  const plot = size - pad * 2;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const span = Math.max(spanX, spanZ);
  const ox = (minX + maxX) / 2;
  const oz = (minZ + maxZ) / 2;
  const x = (wx: number) => pad + ((wx - ox + span / 2) / span) * plot;
  const y = (wz: number) => pad + ((wz - oz + span / 2) / span) * plot;
  return { x, y, metresPerPixel: span / plot, span };
}

function scaleBar(ctx: CanvasRenderingContext2D, size: number, metresPerPixel: number) {
  const steps = [10, 20, 50, 100, 200, 500, 1000];
  const target = size * 0.22 * metresPerPixel;
  const metres = steps.reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best), steps[0]);
  const width = metres / metresPerPixel;
  const x = size * 0.08;
  const y = size - size * 0.055;
  ctx.strokeStyle = 'rgba(246, 243, 255, 0.85)';
  ctx.lineWidth = Math.max(2, size * 0.006);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x + width, y - 5);
  ctx.lineTo(x + width, y + 5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(246, 243, 255, 0.9)';
  ctx.font = `700 ${Math.max(11, size * 0.028)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, x, y - 8);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#07060c';
  ctx.stroke();
}

function legend(ctx: CanvasRenderingContext2D, size: number, items: Array<{ fill: string; label: string }>) {
  const font = Math.max(11, size * 0.028);
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  let y = size * 0.07;
  for (const item of items) {
    dot(ctx, size * 0.08, y, item.fill);
    ctx.fillStyle = '#f6f3ff';
    ctx.fillText(item.label, size * 0.1, y + font * 0.35);
    y += font + 8;
  }
}

function paintBlock(ctx: CanvasRenderingContext2D, arena: ArenaDefinition, size: number) {
  const half = DISTRICT_SPAN / 2;
  const view = frame(-half * 2, half * 2, -half * 2, half * 2, size);
  const origins = [-half, half];
  ctx.fillStyle = '#141820';
  for (const ox of origins) {
    for (const oz of origins) {
      const left = view.x(ox - half + 2);
      const top = view.y(oz - half + 2);
      const right = view.x(ox + half - 2);
      const bottom = view.y(oz + half - 2);
      ctx.fillRect(Math.min(left, right), Math.min(top, bottom), Math.abs(right - left), Math.abs(bottom - top));
    }
  }
  ctx.strokeStyle = 'rgba(120, 210, 255, 0.55)';
  ctx.lineWidth = Math.max(3, size * 0.012);
  for (const ox of origins) {
    for (const oz of origins) {
      ctx.beginPath();
      ctx.moveTo(view.x(ox), view.y(oz - 28));
      ctx.lineTo(view.x(ox), view.y(oz + 28));
      ctx.moveTo(view.x(ox - 28), view.y(oz));
      ctx.lineTo(view.x(ox + 28), view.y(oz));
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(90, 78, 110, 0.95)';
  for (const ox of origins) {
    for (const oz of origins) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const left = view.x(ox + sx * 12);
          const top = view.y(oz + sz * 12);
          const right = view.x(ox + sx * 26);
          const bottom = view.y(oz + sz * 26);
          ctx.fillRect(Math.min(left, right), Math.min(top, bottom), Math.abs(right - left), Math.abs(bottom - top));
        }
      }
    }
  }
  dot(ctx, view.x(arena.spawnPoint.x), view.y(arena.spawnPoint.z), '#66cfff');
  dot(ctx, view.x(arena.ryderBeaconPoint.x), view.y(arena.ryderBeaconPoint.z), '#ffd23c');
  legend(ctx, size, [
    { fill: '#66cfff', label: 'Drop' },
    { fill: '#ffd23c', label: 'Beacon' },
  ]);
  scaleBar(ctx, size, view.metresPerPixel);
}

function paintPad(ctx: CanvasRenderingContext2D, arena: ArenaDefinition, size: number) {
  const view = frame(-74, 40, -32, 32, size);
  const ring = (radius: number, color: string) => {
    ctx.beginPath();
    ctx.arc(view.x(0), view.y(0), radius / view.metresPerPixel, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  ring(26.2, '#1a2433');
  ring(16.1, '#101820');
  ring(15.9, '#243044');
  const hall = (minX: number, maxX: number, minZ: number, maxZ: number, color: string) => {
    const left = view.x(minX);
    const right = view.x(maxX);
    const top = view.y(minZ);
    const bottom = view.y(maxZ);
    ctx.fillStyle = color;
    ctx.fillRect(Math.min(left, right), Math.min(top, bottom), Math.abs(right - left), Math.abs(bottom - top));
  };
  hall(-68, -40, -3.6, 3.6, '#31445c');
  hall(-41, -17, -8.7, 8.7, '#28384c');
  hall(22, 36, -6, 6, '#31445c');
  ctx.fillStyle = '#9fd0ff';
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CHAMBER', view.x(0), view.y(0) + 4);
  ctx.fillText('LAB', view.x(-54), view.y(-8));
  ctx.fillText('BAY', view.x(29), view.y(-10));
  dot(ctx, view.x(arena.spawnPoint.x), view.y(arena.spawnPoint.z), '#66cfff');
  legend(ctx, size, [{ fill: '#66cfff', label: 'Drop' }]);
  scaleBar(ctx, size, view.metresPerPixel);
}

function paintIsland(ctx: CanvasRenderingContext2D, arena: ArenaDefinition, size: number) {
  const view = frame(-ISLAND_HALF, ISLAND_HALF, -ISLAND_HALF, ISLAND_HALF, size);
  const cells = 112;
  const step = (ISLAND_HALF * 2) / cells;
  for (let iz = 0; iz < cells; iz += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const wx = -ISLAND_HALF + ix * step;
      const wz = -ISLAND_HALF + iz * step;
      const [r, g, b] = islandChartColor(wx + step * 0.5, wz + step * 0.5);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const left = view.x(wx);
      const top = view.y(wz);
      const right = view.x(wx + step);
      const bottom = view.y(wz + step);
      ctx.fillRect(Math.min(left, right), Math.min(top, bottom), Math.abs(right - left) + 1, Math.abs(bottom - top) + 1);
    }
  }
  ctx.fillStyle = '#f6f3ff';
  ctx.font = '700 12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  for (const place of ISLAND_LANDMARKS) {
    if (place.name !== 'Beach' && place.name !== 'Resort' && place.name !== 'Summit' && place.name !== 'Jungle') continue;
    const x = view.x(place.x);
    const y = view.y(place.z);
    ctx.fillStyle = '#07060c';
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f3ff';
    ctx.fillText(place.name, x + 6, y + 4);
  }
  dot(ctx, view.x(arena.spawnPoint.x), view.y(arena.spawnPoint.z), '#66cfff');
  legend(ctx, size, [{ fill: '#66cfff', label: 'Drop' }]);
  scaleBar(ctx, size, view.metresPerPixel);
}
