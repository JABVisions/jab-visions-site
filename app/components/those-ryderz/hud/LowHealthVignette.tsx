'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { healthEdge } from '@/lib/ryderz-raid/pvp/healthEdge';
import styles from './LowHealthVignette.module.css';

export type { HealthEdge } from '@/lib/ryderz-raid/pvp/healthEdge';

export type LowHealthVignetteApi = {
  setHealth: (health: number, maxHealth: number) => void;
};

/** Local Ryder only. The loop writes CSS variables; React does not rerender per frame. */
const LowHealthVignette = forwardRef<LowHealthVignetteApi>(function LowHealthVignette(_, ref) {
  const veil = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    setHealth(health, maxHealth) {
      const node = veil.current;
      if (!node) return;
      const next = healthEdge(health, maxHealth);
      node.dataset.stage = next.stage;
      node.style.setProperty('--edge', String(next.edge));
      node.style.setProperty('--beat', next.beat);
    },
  }));

  return <div ref={veil} className={styles.veil} data-stage="none" aria-hidden="true" />;
});

export default LowHealthVignette;
