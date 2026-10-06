'use client';

import Image from 'next/image';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import type { PartySlot } from '@/lib/ryderz-raid/multiplayer';
import { RYDER_THEME } from '../menu/theme';
import styles from './PlayerPartyHUD.module.css';

export type PartyHudApi = {
  setLocalVitals: (hp: number, maxHp: number, aura: number, maxAura: number, alive: boolean) => void;
};

export default function PlayerPartyHUD({
  slots,
  mode,
  apiRef,
}: {
  slots: PartySlot[];
  mode: GameMode;
  apiRef?: MutableRefObject<PartyHudApi | null>;
}) {
  const hpFill = useRef<HTMLSpanElement>(null);
  const auraFill = useRef<HTMLSpanElement>(null);
  const slotRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      setLocalVitals(hp, maxHp, aura, maxAura, alive) {
        if (hpFill.current) hpFill.current.style.width = `${maxHp > 0 ? (hp / maxHp) * 100 : 0}%`;
        if (auraFill.current) auraFill.current.style.width = `${maxAura > 0 ? (aura / maxAura) * 100 : 0}%`;
        slotRoot.current?.classList.toggle(styles.down, !alive);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  return (
    <div
      className={`${styles.row} ${mode === GameMode.SOLO ? styles.solo : ''} ${mode === GameMode.PVP ? styles.pvp : ''}`}
      role="list"
      aria-label="Party"
    >
      {slots.map((slot) => {
        const player = slot.player;
        const empty = !player || !player.selectedRyder;
        const ryder = player?.selectedRyder ? RYDERZ[player.selectedRyder] : null;
        const theme = ryder ? RYDER_THEME[ryder.id] : null;
        const local = Boolean(player?.isLocal);
        return (
          <div
            key={slot.index}
            ref={local ? slotRoot : undefined}
            role="listitem"
            className={[
              styles.slot,
              empty ? styles.empty : '',
              local ? styles.local : '',
              player && !player.isConnected ? styles.offline : '',
              player && !player.isAlive ? styles.down : '',
            ].join(' ')}
            style={theme ? { ['--ryder' as string]: theme.aura } : undefined}
            title={empty ? `Player ${slot.index + 1}` : player.displayName}
          >
            <div className={styles.portrait}>
              {ryder ? <Image src={ryder.icon} alt="" fill unoptimized sizes="44px" /> : <span>{slot.index + 1}</span>}
              <i className={styles.status} />
            </div>
            <div className={styles.meta}>
              <small>P{slot.index + 1}</small>
              <strong>{empty ? 'Empty' : player.displayName}</strong>
              {ryder ? <em>{ryder.flaw}</em> : null}
              <div className={styles.ticks}>
                <span className={styles.hp}>
                  <i ref={local ? hpFill : undefined} style={local ? undefined : { width: player ? '100%' : '0%' }} />
                </span>
                <span className={styles.aura}>
                  <i ref={local ? auraFill : undefined} style={local ? undefined : { width: player ? '100%' : '0%' }} />
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
