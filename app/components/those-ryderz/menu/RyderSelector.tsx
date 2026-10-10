'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { RYDERZ, RYDER_ORDER, type RyderId } from '@/lib/ryderz-raid/config';
import type { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { RYDER_THEME } from './theme';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

/** Roster slots shown; one locked card stays after the playable roster. */
const ROSTER_SLOTS = 9;
const COLUMNS = 3;

/**
 * Pick the Ryder in play. Focus previews the Ryder in the showcase; confirm
 * hands the swap to the RyderManager, which rebuilds the player in the raid.
 */
export default function RyderSelector({
  manager,
  activeRyder,
  active,
  busy,
  onPreview,
  onSwitch,
  onBack,
}: {
  manager: RyderManager;
  activeRyder: RyderId;
  active: boolean;
  busy: boolean;
  onPreview: (id: RyderId | null) => void;
  onSwitch: (id: RyderId) => void;
  onBack: () => void;
}) {
  const [focus, setFocus] = useState(Math.max(0, RYDER_ORDER.indexOf(activeRyder)));

  useEffect(() => {
    onPreview(RYDER_ORDER[focus] ?? null);
  }, [focus, onPreview]);

  useEffect(() => () => onPreview(null), [onPreview]);

  const choose = (index: number) => {
    const id = RYDER_ORDER[index];
    if (!id || busy || !manager.isRyderAvailable(id)) return;
    onSwitch(id);
  };

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'left') setFocus((i) => wrap(i - 1, RYDER_ORDER.length));
    else if (key === 'right') setFocus((i) => wrap(i + 1, RYDER_ORDER.length));
    else if (key === 'up') setFocus((i) => wrap(i - COLUMNS, RYDER_ORDER.length));
    else if (key === 'down') setFocus((i) => wrap(i + COLUMNS, RYDER_ORDER.length));
    else if (key === 'confirm') choose(focus);
    else return false;
    return true;
  }, active);

  return (
    <section className={styles.panel} aria-label="Switch Ryder">
      <header className={styles.panelHead}>
        <p className={styles.eyebrow}>Roster</p>
        <h2>Switch Ryder</h2>
        <p>
          Swap mid-raid. Round, Signal and spire upgrades carry over; Vital and aura keep their fractions, and each
          Ryder brings their own Power Deck.
        </p>
      </header>

      <div className={styles.scroll}>
        <div className={styles.roster} role="listbox" aria-label="Ryderz">
          {Array.from({ length: ROSTER_SLOTS }, (_, i) => {
            const id = RYDER_ORDER[i];
            if (!id) {
              return (
                <div key={`locked-${i}`} className={`${styles.ryderCard} ${styles.ryderLocked}`} aria-disabled="true">
                  <div className={styles.ryderPortrait}>???</div>
                  <small>Locked</small>
                  <strong>Unknown Ryder</strong>
                </div>
              );
            }
            const ryder = RYDERZ[id];
            const theme = RYDER_THEME[id];
            const available = manager.isRyderAvailable(id);
            const focused = i === focus;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={focused}
                disabled={!available}
                className={[
                  styles.ryderCard,
                  focused ? styles.ryderFocused : '',
                  available ? '' : styles.ryderLocked,
                ].join(' ')}
                style={{ ['--card' as string]: theme.aura }}
                onMouseEnter={() => setFocus(i)}
                onFocus={() => setFocus(i)}
                onClick={() => (focused ? choose(i) : setFocus(i))}
              >
                <div className={styles.ryderPortrait}>
                  <Image src={ryder.icon} alt="" fill unoptimized sizes="200px" />
                </div>
                <small>{theme.label} Ryder</small>
                <strong>{ryder.name}</strong>
                {id === activeRyder && <span className={styles.tag}>In play</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.summaryCard}>
        {(() => {
          const id = RYDER_ORDER[focus];
          const ryder = RYDERZ[id];
          return (
            <>
              <div className={styles.summaryRow}>
                <span>
                  {ryder.role} · {ryder.title}
                </span>
                <strong>{ryder.flaw}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Vital · Aura · Speed</span>
                <strong>
                  {ryder.maxHp} · {ryder.maxAura} · {ryder.speed}
                </strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Deck</span>
                <strong>{manager.loadoutSpecs(id).map((m) => m.name).join(' / ')}</strong>
              </div>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={busy || id === activeRyder}
                onClick={() => choose(focus)}
              >
                {id === activeRyder ? 'Currently in play' : busy ? 'Switching…' : `Switch to ${ryder.name}`}
              </button>
            </>
          );
        })()}
      </div>
    </section>
  );
}
