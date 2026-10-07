'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { DISTRICT_SPAN } from '@/lib/ryderz-raid/config';
import styles from './RaidRadar.module.css';

export type RadarFrame = {
  x: number;
  z: number;
  yaw: number;
  enemies: { x: number; z: number }[];
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

/** Small gear map of the four city blocks. The loop paints it; React does not rerender per blip. */
const RaidRadar = forwardRef<RadarApi>(function RaidRadar(_, ref) {
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
      const toX = (x: number) => cx + (x / MAP) * (plot / 2);
      const toY = (z: number) => cy + (z / MAP) * (plot / 2);

      ctx.strokeStyle = 'rgba(158, 255, 196, 0.22)';
      ctx.lineWidth = Math.max(1, size * 0.008);
      ctx.beginPath();
      ctx.moveTo(toX(-MAP), toY(0));
      ctx.lineTo(toX(MAP), toY(0));
      ctx.moveTo(toX(0), toY(-MAP));
      ctx.lineTo(toX(0), toY(MAP));
      ctx.stroke();

      const half = MAP / 2;
      ctx.fillStyle = 'rgba(57, 255, 106, 0.35)';
      for (const ox of [-half, half]) {
        for (const oz of [-half, half]) {
          ctx.beginPath();
          ctx.arc(toX(ox), toY(oz), Math.max(1.5, size * 0.012), 0, Math.PI * 2);
          ctx.fill();
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

      ctx.fillStyle = '#ff4b6e';
      const dot = Math.max(2.2, size * 0.018);
      frame.enemies.forEach((enemy) => {
        ctx.beginPath();
        ctx.arc(toX(enemy.x), toY(enemy.z), dot, 0, Math.PI * 2);
        ctx.fill();
      });

      const px = toX(frame.x);
      const py = toY(frame.z);
      const fx = Math.sin(frame.yaw);
      const fz = Math.cos(frame.yaw);
      const len = Math.max(7, size * 0.055);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(fx, -fz));
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
    <div className={styles.radar} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
});

export default RaidRadar;
