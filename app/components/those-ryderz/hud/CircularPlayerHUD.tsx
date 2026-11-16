'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { RYDER_THEME } from '../menu/theme';
import { useRyderIcon } from '../skins/useEquippedSkin';
import styles from './CircularPlayerHUD.module.css';

export type CircularHudApi = {
  setVitals: (
    hp: number,
    maxHp: number,
    aura: number,
    maxAura: number,
    burnout: boolean,
    resonance?: number,
    power?: { left: number; down: boolean; unlimited: boolean },
  ) => void;
};

function clampPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

const arcLengths = new WeakMap<SVGPathElement, number>();
const arcDashes = new WeakMap<SVGPathElement, string>();

/**
 * Paint a semicircle from its real length. CSS dash arrays ignore SVG pathLength, so a 0–100 dash stays visually full.
 * The engine calls this every frame: the length is measured once per path, and the DOM is only touched when the dash moves.
 */
function paintArc(path: SVGPathElement | null, pct: number) {
  if (!path) return;
  let length = arcLengths.get(path);
  if (!length) {
    length = path.getTotalLength();
    if (length > 0) arcLengths.set(path, length);
    else length = 1;
  }
  const shown = (Math.max(0, Math.min(100, pct)) / 100) * length;
  const dash = `${shown.toFixed(2)} ${length.toFixed(2)}`;
  if (arcDashes.get(path) === dash) return;
  arcDashes.set(path, dash);
  path.setAttribute('stroke-dasharray', dash);
  path.style.strokeDasharray = dash;
}

function setText(node: HTMLElement | null, text: string) {
  if (node && node.textContent !== text) node.textContent = text;
}

const CircularPlayerHUD = forwardRef<
  CircularHudApi,
  { ryderId: RyderId; burnout?: boolean; badge?: string }
>(function CircularPlayerHUD({ ryderId, burnout, badge }, ref) {
  const spec = RYDERZ[ryderId];
  const theme = RYDER_THEME[ryderId];
  const icon = useRyderIcon(ryderId);
  const root = useRef<HTMLDivElement>(null);
  const hpArc = useRef<SVGPathElement>(null);
  const auraArc = useRef<SVGPathElement>(null);
  const hpLabel = useRef<HTMLElement>(null);
  const auraLabel = useRef<HTMLElement>(null);
  const clockLabel = useRef<HTMLElement>(null);
  const resLabel = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    setVitals(hp, maxHp, aura, maxAura, isBurnout, resonance = 0, power) {
      const healthPct = clampPct(hp, maxHp);
      const auraPct = clampPct(aura, maxAura);
      paintArc(hpArc.current, healthPct);
      paintArc(auraArc.current, auraPct);
      setText(hpLabel.current, `${Math.ceil(hp)}`);
      const showClock = Boolean(power && !power.unlimited);
      setText(auraLabel.current, isBurnout ? 'OUT' : `${Math.ceil(aura)}`);
      const clock = clockLabel.current;
      if (clock) {
        if (clock.hidden !== !showClock) clock.hidden = !showClock;
        if (showClock && power) {
          setText(clock, `${Math.max(1, Math.ceil(power.left))}s`);
          const down = power.down ? 'true' : 'false';
          if (clock.dataset.down !== down) {
            clock.dataset.down = down;
            clock.title = power.down ? 'Powers return in' : 'Powers stay up for';
          }
        }
      }
      const res = resLabel.current;
      if (res) {
        if (res.hidden !== resonance <= 0) res.hidden = resonance <= 0;
        setText(res, resonance >= 100 ? 'RES READY' : `RES ${Math.floor(resonance)}`);
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
        />
        <path
          ref={auraArc}
          className={`${styles.arc} ${styles.aura}`}
          d="M 60 14 A 46 46 0 0 1 60 106"
        />
      </svg>
      <b ref={clockLabel} className={styles.gaugeClock} hidden>
        0s
      </b>
      <div className={styles.portrait}>
        <img src={icon} alt="" />
      </div>
      <div className={styles.bolt} aria-hidden="true" />
      <div className={styles.caption}>
        {badge ? <small>{badge}</small> : null}
        <b className={spec.name.length > 16 ? styles.longName : undefined}>{spec.name}</b>
        <span>
          HP <em ref={hpLabel}>—</em>
          <i>Aura</i> <em ref={auraLabel}>—</em>
          <b ref={resLabel} className={styles.resonance} hidden>
            RES 0
          </b>
        </span>
      </div>
    </div>
  );
});

export default CircularPlayerHUD;
