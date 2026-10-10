'use client';

import { useState } from 'react';
import { listArenas } from '@/lib/ryderz-raid/arenas';
import type { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

/** Lists registered arenas. Unavailable ones stay marked Coming Soon. */
export default function ArenaSelector({
  manager,
  arenaId,
  active,
  onBack,
}: {
  manager: RyderManager;
  arenaId: string;
  active: boolean;
  onBack: () => void;
}) {
  const arenas = listArenas();
  const [focus, setFocus] = useState(Math.max(0, arenas.findIndex((a) => a.id === arenaId)));

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'up') setFocus((i) => wrap(i - 1, arenas.length));
    else if (key === 'down') setFocus((i) => wrap(i + 1, arenas.length));
    else if (key === 'confirm') manager.setArena(arenas[focus].id);
    else return false;
    return true;
  }, active);

  return (
    <section className={styles.panel} aria-label="Arena select">
      <header className={styles.panelHead}>
        <p className={styles.eyebrow}>Arena select</p>
        <h2>Choose a floor</h2>
        <p>The Block is the city raid. Training P.A.D. is the Paranormal Activity Division facility.</p>
      </header>
      <div className={`${styles.scroll} ${styles.options}`} role="listbox" aria-label="Arenas">
        {arenas.map((arena, i) => (
          <button
            key={arena.id}
            type="button"
            role="option"
            aria-selected={i === focus}
            disabled={!arena.available}
            className={[styles.option, i === focus ? styles.optionFocused : '', arena.available ? '' : styles.optionSoon].join(' ')}
            onMouseEnter={() => setFocus(i)}
            onClick={() => manager.setArena(arena.id)}
          >
            <small>{arena.available ? arena.setting : 'Coming soon'}</small>
            <strong>{arena.name}</strong>
            <p>{arena.description}</p>
            {arena.id === arenaId && <span className={styles.tag}>Current</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
