'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { formatSpan, listArenas, type ArenaDefinition } from '@/lib/ryderz-raid/arenas';
import { paintArenaPreview } from '@/lib/ryderz-raid/arena-preview';
import { useMenuKeys, wrap } from '../menu/useMenuKeys';
import GlitchButton from '../start/GlitchButton';
import styles from './MapSelect.module.css';

/** Solo and PvP pick a floor before the match. The photograph, the blurb, and the size sit together. */
export default function MapSelect({
  mode,
  arenaId,
  onBack,
  onConfirm,
}: {
  mode: 'solo' | 'pvp';
  arenaId: string;
  onBack: () => void;
  onConfirm: (id: string) => void;
}) {
  const arenas = useMemo(() => listArenas().filter((arena) => arena.id !== 'training'), []);
  const [focus, setFocus] = useState(() => Math.max(0, arenas.findIndex((arena) => arena.id === arenaId)));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focused = arenas[focus] ?? arenas[0];
  const ready = Boolean(focused?.available);

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'up' || key === 'left') setFocus((index) => wrap(index - 1, arenas.length));
    else if (key === 'down' || key === 'right') setFocus((index) => wrap(index + 1, arenas.length));
    else if (key === 'confirm' && focused?.available) onConfirm(focused.id);
    else return false;
    return true;
  }, true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !focused || focused.picture) return;
    const paint = () => {
      const css = Math.max(canvas.clientWidth, 280);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(css * dpr);
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) paintArenaPreview(ctx, focused, px);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [focused]);

  return (
    <section className={styles.screen} aria-label="Map select">
      <header className={styles.head}>
        <p>{mode === 'pvp' ? 'PvP · Map' : 'Solo · Map'}</p>
        <h1>Choose a floor</h1>
      </header>
      <div className={styles.layout}>
        <div className={styles.list} role="listbox" aria-label="Maps">
          {arenas.map((arena, index) => (
            <button
              key={arena.id}
              type="button"
              role="option"
              aria-selected={index === focus}
              className={[styles.card, index === focus ? styles.cardOn : '', arena.available ? '' : styles.cardSoon].join(' ')}
              onMouseEnter={() => setFocus(index)}
              onClick={() => setFocus(index)}
            >
              <small>{arena.available ? arena.size.label : 'Coming soon'}</small>
              <strong>{arena.name}</strong>
              <em>{arena.available ? formatSpan(arena.size.metres) : arena.setting}</em>
            </button>
          ))}
        </div>
        <Preview arena={focused} canvasRef={canvasRef} />
      </div>
      <footer className={styles.actions}>
        <GlitchButton label="Back" hint="Esc" onClick={onBack} />
        <GlitchButton
          label={mode === 'pvp' ? 'Fight' : 'Drop in'}
          hint="Enter"
          selected
          dim={!ready}
          disabled={!ready}
          onClick={() => focused?.available && onConfirm(focused.id)}
        />
      </footer>
    </section>
  );
}

function Preview({
  arena,
  canvasRef,
}: {
  arena: ArenaDefinition | undefined;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const arenas = listArenas().filter((entry) => entry.available && entry.size.metres > 0);
  const widest = Math.max(...arenas.map((entry) => Math.log10(entry.size.metres)), 1);
  if (!arena) return null;
  return (
    <article className={styles.detail}>
      <div className={styles.chart}>
        {arena.picture ? (
          <img src={arena.picture} alt="" />
        ) : (
          <canvas ref={canvasRef} aria-hidden="true" />
        )}
      </div>
      <div className={styles.copy}>
        <p className={styles.setting}>{arena.available ? arena.setting : 'Coming soon'}</p>
        <h2>{arena.name}</h2>
        <p className={styles.description}>{arena.description}</p>
        <div className={styles.size}>
          <div className={styles.sizeHead}>
            <span>Size guide</span>
            <strong>
              {arena.size.label}
              {arena.available ? ` · ${formatSpan(arena.size.metres)}` : ''}
            </strong>
          </div>
          <div className={styles.bars} aria-hidden="true">
            {arenas.map((entry) => (
              <i key={entry.id} data-on={entry.id === arena.id ? 'true' : 'false'}>
                <b style={{ width: `${(Math.log10(entry.size.metres) / widest) * 100}%` }} />
                <em>{entry.size.label}</em>
              </i>
            ))}
          </div>
          <p>{arena.size.guide}</p>
        </div>
      </div>
    </article>
  );
}
