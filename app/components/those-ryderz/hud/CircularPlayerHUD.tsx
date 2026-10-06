'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { RYDER_THEME } from '../menu/theme';
import styles from './CircularPlayerHUD.module.css';

export type CircularHudApi = {
  setVitals: (hp: number, maxHp: number, aura: number, maxAura: number, burnout: boolean) => void;
};

function clampPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

const CircularPlayerHUD = forwardRef<
  CircularHudApi,
  { ryderId: RyderId; burnout: boolean }
>(function CircularPlayerHUD({ ryderId, burnout }, ref) {
  const spec = RYDERZ[ryderId];
  const theme = RYDER_THEME[ryderId];
  const root = useRef<HTMLDivElement>(null);
  const hpArc = useRef<SVGPathElement>(null);
  const auraArc = useRef<SVGPathElement>(null);
  const hpLabel = useRef<HTMLElement>(null);
  const auraLabel = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    setVitals(hp, maxHp, aura, maxAura, isBurnout) {
      const healthPct = clampPct(hp, maxHp);
      const auraPct = clampPct(aura, maxAura);
      if (hpArc.current) hpArc.current.style.strokeDasharray = `${healthPct} 100`;
      if (auraArc.current) auraArc.current.style.strokeDasharray = `${auraPct} 100`;
      if (hpLabel.current) hpLabel.current.textContent = `${Math.ceil(hp)}`;
      if (auraLabel.current) {
        auraLabel.current.textContent = isBurnout ? 'OUT' : `${Math.ceil(aura)}`;
      }
      const node = root.current;
      if (!node) return;
      node.classList.toggle(styles.low, healthPct <= 28 && healthPct > 0);
      node.classList.toggle(styles.critical, healthPct > 0 && healthPct <= 12);
      node.classList.toggle(styles.charged, auraPct >= 96 && !isBurnout);
      node.classList.toggle(styles.burned, isBurnout || auraPct <= 1);
    },
  }));

  return (
    <div
      ref={root}
      className={`${styles.hud} ${burnout ? styles.burned : ''}`}
      style={{ ['--ryder' as string]: theme.aura }}
      aria-label={`${spec.name} vital and aura`}
    >
      <svg className={styles.meter} viewBox="0 0 120 120" aria-hidden="true">
        <path className={styles.track} d="M 60 14 A 46 46 0 0 0 60 106" pathLength={100} />
        <path className={styles.track} d="M 60 14 A 46 46 0 0 1 60 106" pathLength={100} />
        <path
          ref={hpArc}
          className={`${styles.arc} ${styles.health}`}
          d="M 60 14 A 46 46 0 0 0 60 106"
          pathLength={100}
        />
        <path
          ref={auraArc}
          className={`${styles.arc} ${styles.aura}`}
          d="M 60 14 A 46 46 0 0 1 60 106"
          pathLength={100}
        />
      </svg>
      <div className={styles.portrait}>
        <img src={spec.icon} alt="" />
      </div>
      <div className={styles.bolt} aria-hidden="true" />
      <div className={styles.caption}>
        <b>{spec.name}</b>
        <span>
          HP <em ref={hpLabel}>—</em>
          <i>Aura</i> <em ref={auraLabel}>—</em>
        </span>
      </div>
    </div>
  );
});

export default CircularPlayerHUD;
