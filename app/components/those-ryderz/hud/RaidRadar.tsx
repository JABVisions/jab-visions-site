'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { DISTRICT_SPAN } from '@/lib/ryderz-raid/config';
import type { MapBlock } from '@/lib/ryderz-raid/map-chart';
import { paintStructures } from './map-structures';
import styles from './RaidRadar.module.css';

export type RadarAlly = {
  x: number;
  z: number;
  name: string;
  color: string;
  down: boolean;
};

export type RadarFrame = {
  x: number;
  z: number;
  yaw: number;
  span: number;
  terrain: 'island' | 'city';
  color: string;
  /** Walls, buildings, and other footprints the fighter cannot walk through. */
  blocks: MapBlock[];
  enemies: { x: number; z: number }[];
  allies: RadarAlly[];
};

export type RadarApi = {
  draw: (frame: RadarFrame) => void;
};

const MAP = DISTRICT_SPAN;

function gearPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, teeth: number) {
  const outer = radius;
  const inner = radius - Math.max(5, radius * 0.09);
  const step = (Math.PI * 2) / teeth;
  ctx.beginPath();
  for (let i = 0; i < teeth; i += 1) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step * 0.28;
    const a2 = a0 + step * 0.62;
    const a3 = a0 + step;
    const point = (angle: number, r: number, move: boolean) => {
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (move) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    };
    point(a0, inner, i === 0);
    point(a0 + step * 0.08, outer, false);
    point(a1, outer, false);
    point(a2, inner, false);
    point(a3, inner, false);
  }
  ctx.closePath();
}

function paintAlly(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, down: boolean, radius: number) {
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  if (down) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.25, radius * 0.45);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#f4fff8';
  ctx.lineWidth = Math.max(1, radius * 0.28);
  ctx.stroke();
}

/** Small gear map. The loop paints it; React does not rerender per blip. Click or press Tab to open the chart. */
const RaidRadar = forwardRef<RadarApi, { onOpen?: () => void }>(function RaidRadar({ onOpen }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(frame) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const css = Math.max(canvas.clientWidth, canvas.clientHeight) || 132;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(css * dpr);
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.46;
      ctx.clearRect(0, 0, size, size);

      ctx.fillStyle = '#07140f';
      gearPath(ctx, cx, cy, radius, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(57, 255, 106, 0.85)';
      ctx.lineWidth = Math.max(1.5, size * 0.012);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.78, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(4, 12, 10, 0.92)';
      ctx.fillRect(0, 0, size, size);

      const plot = radius * 1.42;
      const local = Math.abs(frame.x) > MAP || Math.abs(frame.z) > MAP;
      const originX = local ? frame.x : 0;
      const originZ = local ? frame.z : 0;
      const span = local ? 80 : MAP;
      const limit = radius * 0.72;
      const project = (x: number, z: number) => {
        let dx = ((x - originX) / span) * (plot / 2);
        let dy = ((z - originZ) / span) * (plot / 2);
        const dist = Math.hypot(dx, dy);
        if (dist > limit) {
          const scale = limit / dist;
          dx *= scale;
          dy *= scale;
          return { px: cx + dx, py: cy + dy, edge: true };
        }
        return { px: cx + dx, py: cy + dy, edge: false };
      };

      ctx.strokeStyle = 'rgba(158, 255, 196, 0.22)';
      ctx.lineWidth = Math.max(1, size * 0.008);
      ctx.beginPath();
      if (local) {
        ctx.moveTo(cx - plot / 2, cy);
        ctx.lineTo(cx + plot / 2, cy);
        ctx.moveTo(cx, cy - plot / 2);
        ctx.lineTo(cx, cy + plot / 2);
      } else {
        const toX = (x: number) => cx + ((x - originX) / span) * (plot / 2);
        const toY = (z: number) => cy + ((z - originZ) / span) * (plot / 2);
        ctx.moveTo(toX(-MAP), toY(0));
        ctx.lineTo(toX(MAP), toY(0));
        ctx.moveTo(toX(0), toY(-MAP));
        ctx.lineTo(toX(0), toY(MAP));
      }
      ctx.stroke();

      const toChartX = (x: number) => cx + ((x - originX) / span) * (plot / 2);
      const toChartY = (z: number) => cy + ((z - originZ) / span) * (plot / 2);
      paintStructures(ctx, frame.blocks, toChartX, toChartY, (plot / 2) / span);

      ctx.fillStyle = 'rgba(57, 255, 106, 0.35)';
      if (!local) {
        const half = MAP / 2;
        const toX = (x: number) => cx + (x / span) * (plot / 2);
        const toY = (z: number) => cy + (z / span) * (plot / 2);
        for (const ox of [-half, half]) {
          for (const oz of [-half, half]) {
            ctx.beginPath();
            ctx.arc(toX(ox), toY(oz), Math.max(1.5, size * 0.012), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      const sweep = (performance.now() / 1800) % (Math.PI * 2);
      const grad = ctx.createConicGradient(sweep - Math.PI / 2, cx, cy);
      if (grad) {
        grad.addColorStop(0, 'rgba(57, 255, 106, 0)');
        grad.addColorStop(0.12, 'rgba(57, 255, 106, 0.16)');
        grad.addColorStop(0.2, 'rgba(57, 255, 106, 0)');
        grad.addColorStop(1, 'rgba(57, 255, 106, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }

      const dot = Math.max(2.2, size * 0.018);
      ctx.fillStyle = '#ff4b6e';
      frame.enemies.forEach((enemy) => {
        const spot = project(enemy.x, enemy.z);
        if (spot.edge) return;
        ctx.beginPath();
        ctx.arc(spot.px, spot.py, dot, 0, Math.PI * 2);
        ctx.fill();
      });

      const allyDot = Math.max(2.6, size * 0.022);
      frame.allies.forEach((ally) => {
        const spot = project(ally.x, ally.z);
        paintAlly(ctx, spot.px, spot.py, ally.color, ally.down || spot.edge, spot.edge ? allyDot * 0.8 : allyDot);
      });

      const self = project(frame.x, frame.z);
      const len = Math.max(7, size * 0.055);
      ctx.save();
      ctx.translate(self.px, self.py);
      ctx.rotate(Math.atan2(Math.sin(frame.yaw), -Math.cos(frame.yaw)));
      ctx.fillStyle = '#f4fff8';
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(len * 0.48, len * 0.55);
      ctx.lineTo(0, len * 0.22);
      ctx.lineTo(-len * 0.48, len * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();

      ctx.fillStyle = '#9effc4';
      ctx.font = `${Math.max(9, size * 0.07)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - radius * 0.84);
    },
  }));

  return (
    <button type="button" className={styles.radar} aria-label="Open map" onClick={() => onOpen?.()}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.caption}>MAP</span>
    </button>
  );
});

export default RaidRadar;
