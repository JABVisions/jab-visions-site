'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { islandFloor } from '@/lib/ryderz-raid/island/terrain';
import { DISTRICT_SPAN } from '@/lib/ryderz-raid/config';
import type { RadarApi, RadarFrame } from './RaidRadar';
import { paintStructures } from './map-structures';
import styles from './RaidMap.module.css';

let stamp: { key: string; canvas: HTMLCanvasElement } | null = null;

function terrainStamp(span: number) {
  const key = `island:${Math.round(span)}`;
  if (stamp?.key === key) return stamp.canvas;
  const n = 168;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(n, n);
  const px = img.data;
  for (let y = 0; y < n; y += 1) {
    const wz = ((y + 0.5) / n) * span * 2 - span;
    for (let x = 0; x < n; x += 1) {
      const wx = ((x + 0.5) / n) * span * 2 - span;
      const h = islandFloor(wx, wz);
      const i = (y * n + x) * 4;
      let r = 12;
      let g = 48;
      let b = 68;
      if (h <= 0.2) {
        const deep = Math.max(0, Math.min(1, -h / 8));
        r = 14 + (1 - deep) * 16;
        g = 52 + (1 - deep) * 64;
        b = 74 + (1 - deep) * 28;
      } else if (h < 2.4) {
        r = 198;
        g = 176;
        b = 124;
      } else if (h < 12) {
        r = 36;
        g = 128;
        b = 62;
      } else if (h < 32) {
        r = 18;
        g = 82;
        b = 48;
      } else if (h < 68) {
        r = 118;
        g = 112;
        b = 104;
      } else {
        r = 220;
        g = 216;
        b = 204;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  stamp = { key, canvas };
  return canvas;
}

function paintArrow(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, len: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.lineTo(len * 0.48, len * 0.55);
  ctx.lineTo(0, len * 0.22);
  ctx.lineTo(-len * 0.48, len * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Full arena chart. Squadmates keep their colors. Downed teammates are hollow. */
const RaidMap = forwardRef<RadarApi, { place: string; localTwo: boolean; onClose: () => void }>(function RaidMap(
  { place, localTwo, onClose },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(frame: RadarFrame) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const css = Math.max(canvas.clientWidth, canvas.clientHeight) || 520;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(css * dpr);
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      const pad = size * 0.07;
      const plot = size - pad * 2;
      const span = Math.max(8, frame.span);
      const toX = (x: number) => pad + ((x + span) / (span * 2)) * plot;
      const toY = (z: number) => pad + ((z + span) / (span * 2)) * plot;

      ctx.fillStyle = '#07140f';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, pad, plot, plot);
      ctx.clip();
      if (frame.terrain === 'island') {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(terrainStamp(span), pad, pad, plot, plot);
      } else {
        ctx.fillStyle = '#10241c';
        ctx.fillRect(pad, pad, plot, plot);
        ctx.strokeStyle = 'rgba(158, 255, 196, 0.28)';
        ctx.lineWidth = Math.max(2, size * 0.008);
        ctx.beginPath();
        ctx.moveTo(toX(-DISTRICT_SPAN), toY(0));
        ctx.lineTo(toX(DISTRICT_SPAN), toY(0));
        ctx.moveTo(toX(0), toY(-DISTRICT_SPAN));
        ctx.lineTo(toX(0), toY(DISTRICT_SPAN));
        ctx.stroke();
        ctx.fillStyle = 'rgba(57, 255, 106, 0.45)';
        const half = DISTRICT_SPAN / 2;
        for (const ox of [-half, half]) {
          for (const oz of [-half, half]) {
            ctx.beginPath();
            ctx.arc(toX(ox), toY(oz), Math.max(3, size * 0.012), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      paintStructures(ctx, frame.blocks, toX, toY, plot / (span * 2));
      ctx.restore();

      ctx.strokeStyle = 'rgba(57, 255, 106, 0.85)';
      ctx.lineWidth = Math.max(2, size * 0.006);
      ctx.strokeRect(pad, pad, plot, plot);

      ctx.fillStyle = '#9effc4';
      ctx.font = `700 ${Math.max(12, size * 0.028)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('N', pad + plot / 2, pad - size * 0.012);

      const enemyR = Math.max(3.5, size * 0.009);
      ctx.fillStyle = '#ff4b6e';
      frame.enemies.forEach((enemy) => {
        ctx.beginPath();
        ctx.arc(toX(enemy.x), toY(enemy.z), enemyR, 0, Math.PI * 2);
        ctx.fill();
      });

      const allyR = Math.max(5, size * 0.014);
      const gap = allyR * 3.1;
      const placed = frame.allies.map((ally) => ({
        ally,
        x: toX(ally.x),
        y: toY(ally.z),
        ax: toX(ally.x),
        ay: toY(ally.z),
      }));
      const selfX = toX(frame.x);
      const selfY = toY(frame.z);
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < placed.length; i += 1) {
          const mark = placed[i];
          let dx = mark.x - selfX;
          let dy = mark.y - selfY;
          let dist = Math.hypot(dx, dy);
          if (dist < gap) {
            if (dist < 0.01) {
              const turn = (i / Math.max(1, placed.length)) * Math.PI * 2;
              dx = Math.cos(turn);
              dy = Math.sin(turn);
              dist = 1;
            }
            mark.x = selfX + (dx / dist) * gap;
            mark.y = selfY + (dy / dist) * gap;
          }
          for (let j = 0; j < i; j += 1) {
            const other = placed[j];
            let ox = mark.x - other.x;
            let oy = mark.y - other.y;
            let apart = Math.hypot(ox, oy);
            if (apart >= gap) continue;
            if (apart < 0.01) {
              ox = 1;
              oy = 0;
              apart = 1;
            }
            mark.x = other.x + (ox / apart) * gap;
            mark.y = other.y + (oy / apart) * gap;
          }
        }
      }
      ctx.font = `700 ${Math.max(11, size * 0.026)}px ui-monospace, monospace`;
      const labels = placed.map((mark) => {
        const right = mark.x >= selfX;
        return {
          mark,
          right,
          x: right ? mark.x + allyR + 5 : mark.x - allyR - 5,
          y: mark.y + allyR * 0.35,
        };
      });
      for (let pass = 0; pass < 8; pass += 1) {
        for (let i = 0; i < labels.length; i += 1) {
          for (let j = 0; j < i; j += 1) {
            if (Math.abs(labels[i].y - labels[j].y) < 16 && Math.abs(labels[i].x - labels[j].x) < size * 0.16) {
              labels[i].y = labels[j].y + 16;
            }
          }
        }
      }
      labels.forEach((label) => {
        const mark = label.mark;
        const moved = Math.hypot(mark.x - mark.ax, mark.y - mark.ay) > 3;
        if (moved) {
          ctx.strokeStyle = 'rgba(244, 255, 248, 0.45)';
          ctx.lineWidth = Math.max(1, size * 0.002);
          ctx.beginPath();
          ctx.moveTo(mark.ax, mark.ay);
          ctx.lineTo(mark.x, mark.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, allyR, 0, Math.PI * 2);
        if (mark.ally.down) {
          ctx.strokeStyle = mark.ally.color;
          ctx.lineWidth = Math.max(2, size * 0.005);
          ctx.stroke();
        } else {
          ctx.fillStyle = mark.ally.color;
          ctx.fill();
          ctx.strokeStyle = '#f4fff8';
          ctx.lineWidth = Math.max(1.5, size * 0.003);
          ctx.stroke();
        }
        const text = mark.ally.down ? `${mark.ally.name} DOWN` : mark.ally.name;
        ctx.textAlign = label.right ? 'left' : 'right';
        ctx.lineWidth = Math.max(3, size * 0.006);
        ctx.strokeStyle = 'rgba(4, 10, 8, 0.9)';
        ctx.strokeText(text, label.x, label.y);
        ctx.fillStyle = mark.ally.down ? '#ffd0d8' : '#f4fff8';
        ctx.fillText(text, label.x, label.y);
      });

      const px = toX(frame.x);
      const py = toY(frame.z);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(8, size * 0.02), 0, Math.PI * 2);
      ctx.strokeStyle = frame.color;
      ctx.lineWidth = Math.max(2, size * 0.005);
      ctx.stroke();
      paintArrow(ctx, px, py, frame.yaw, Math.max(11, size * 0.028), '#f4fff8');

      ctx.fillStyle = 'rgba(244, 255, 248, 0.72)';
      ctx.font = `${Math.max(11, size * 0.024)}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(span * 2)} m`, pad + plot, size - size * 0.012);
    },
  }));

  return (
    <div className={styles.map} role="dialog" aria-label={`${place} map`} onClick={onClose}>
      <div
        className={styles.panel}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className={styles.head}>
          <strong>{place}</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <canvas ref={canvasRef} className={styles.canvas} />
        <footer className={styles.legend}>
          <span>
            <i className={styles.you} /> You
          </span>
          <span>
            <i className={styles.ally} /> Allies
          </span>
          <span>
            <i className={styles.wall} /> Structures
          </span>
          <span>
            <i className={styles.host} /> Hosts
          </span>
          <em>{localTwo ? 'Tab or Esc closes' : 'Tab, M, or Esc closes'}</em>
        </footer>
      </div>
    </div>
  );
});

export default RaidMap;
