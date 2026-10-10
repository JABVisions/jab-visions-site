'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { isPadRyder } from '@/lib/ryderz-raid/dlc/pad';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import { playableCharacters } from '@/lib/ryderz-raid/roster';
import styles from '../RaidGame.module.css';
import { RYDER_THEME as AURA } from '../menu/theme';

/** One local Ryder, then the existing PvE raid. The roster is registry-driven. */
export default function SoloCharacterSelect({
  initialId,
  onBack,
  onPlay,
}: {
  initialId: RyderId;
  onBack: () => void;
  onPlay: (id: RyderId) => void;
}) {
  const roster = playableCharacters(GameMode.SOLO);
  const [focus, setFocus] = useState(Math.max(0, roster.findIndex((character) => character.ryderId === initialId)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setFocus((index) => (index + 1) % roster.length);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setFocus((index) => (index - 1 + roster.length) % roster.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const id = roster[focus]?.ryderId;
        if (id) onPlay(id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [focus, onBack, onPlay, roster]);

  const focused = roster[focus];

  return (
    <div className={styles.select}>
      <div className={styles.selectInner}>
        <header>
          <p>Those Ryderz: Raid · Solo</p>
          <h2>Pick a fighter.</h2>
          <span>Ryderz and Those Boomers. One fighter drops into the block you already know.</span>
          <button type="button" className={styles.selectBack} onClick={onBack}>
            Back to title
          </button>
        </header>
        <div className={styles.carousel}>
          <button type="button" className={styles.carouselNav} onClick={() => setFocus((index) => (index - 1 + roster.length) % roster.length)} aria-label="Previous Ryder">
            <ChevronLeft size={28} />
          </button>
          <div className={styles.viewport}>
            <div className={styles.roster}>
              {roster.map((character, index) => {
                const id = character.ryderId as RyderId;
                const ryder = RYDERZ[id];
                const colors = AURA[id];
                return (
                  <button
                    key={character.id}
                    type="button"
                    className={`${styles.card} ${index === focus ? styles.cardFocused : ''}`}
                    style={{ ['--aura' as string]: colors.aura, ['--aura-soft' as string]: colors.soft }}
                    onClick={() => {
                      if (index === focus) onPlay(id);
                      else setFocus(index);
                    }}
                  >
                    <div className={styles.portrait}>
                      <Image src={ryder.icon} alt={ryder.name} fill unoptimized sizes="220px" />
                    </div>
                    <small>
                      {ryder.role} · {ryder.title}
                    </small>
                    <h3>{isPadRyder(id) ? `P.A.D. DLC · ${ryder.name}` : ryder.name}</h3>
                    <ul className={styles.moveList}>
                      {ryder.moves.map((move) => (
                        <li key={move.id}>
                          <strong>{move.key}</strong> {move.name}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className={styles.carouselNav} onClick={() => setFocus((index) => (index + 1) % roster.length)} aria-label="Next Ryder">
            <ChevronRight size={28} />
          </button>
        </div>
        <button type="button" className={styles.dropIn} disabled={!focused?.ryderId} onClick={() => focused?.ryderId && onPlay(focused.ryderId)}>
          Drop in as {focused?.name ?? '…'}
        </button>
      </div>
    </div>
  );
}
