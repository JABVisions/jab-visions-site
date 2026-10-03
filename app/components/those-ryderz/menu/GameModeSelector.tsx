'use client';

import { useState } from 'react';
import { GAME_MODES, type GameMode } from '@/lib/ryderz-raid/game-mode';
import type { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

/** PvE is live; PvP is registered so the rules can branch on it once Ryder-on-Ryder combat exists. */
export default function GameModeSelector({
  manager,
  gameMode,
  active,
  onBack,
}: {
  manager: RyderManager;
  gameMode: GameMode;
  active: boolean;
  onBack: () => void;
}) {
  const [focus, setFocus] = useState(Math.max(0, GAME_MODES.findIndex((m) => m.id === gameMode)));

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'up') setFocus((i) => wrap(i - 1, GAME_MODES.length));
    else if (key === 'down') setFocus((i) => wrap(i + 1, GAME_MODES.length));
    else if (key === 'confirm') manager.setGameMode(GAME_MODES[focus].id);
    else return false;
    return true;
  }, active);

  return (
    <section className={styles.panel} aria-label="Game mode">
      <header className={styles.panelHead}>
        <p className={styles.eyebrow}>Game mode</p>
        <h2>How the block fights</h2>
        <p>Modes share Ryderz, decks and arenas. Training, Survival and Boss Raid will slot in here later.</p>
      </header>
      <div className={`${styles.scroll} ${styles.options}`} role="listbox" aria-label="Game modes">
        {GAME_MODES.map((mode, i) => (
          <button
            key={mode.id}
            type="button"
            role="option"
            aria-selected={i === focus}
            disabled={!mode.available}
            className={[styles.option, i === focus ? styles.optionFocused : '', mode.available ? '' : styles.optionSoon].join(' ')}
            onMouseEnter={() => setFocus(i)}
            onClick={() => manager.setGameMode(mode.id)}
          >
            <small>{mode.tagline}</small>
            <strong>{mode.name}</strong>
            <p>{mode.description}</p>
            {mode.id === gameMode && <span className={styles.tag}>Active</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
