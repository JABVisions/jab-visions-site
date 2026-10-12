'use client';

import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import type { PartySlot } from '@/lib/ryderz-raid/multiplayer';
import { RYDER_THEME } from '../menu/theme';
import styles from './PlayerPartyHUD.module.css';

export type PartyHudApi = {
  setSlot: (
    index: number,
    hp: number,
    maxHp: number,
    aura: number,
    maxAura: number,
    alive: boolean,
    bleed?: number,
  ) => void;
};

type SlotNodes = { root: HTMLDivElement | null; hp: HTMLSpanElement | null; aura: HTMLSpanElement | null };
type SlotVital = { hp: number; maxHp: number; aura: number; maxAura: number; alive: boolean; bleed: number };

export default function PlayerPartyHUD({
  slots,
  mode,
  apiRef,
}: {
  slots: PartySlot[];
  mode: GameMode;
  apiRef?: MutableRefObject<PartyHudApi | null>;
}) {
  const nodes = useRef(new Map<number, SlotNodes>());
  const latest = useRef(new Map<number, SlotVital>());

  const paint = (index: number) => {
    const node = nodes.current.get(index);
    const vital = latest.current.get(index);
    if (!node || !vital) return;
    const ratio = !vital.alive ? vital.bleed : vital.maxHp > 0 ? vital.hp / vital.maxHp : 0;
    const healthWidth = `${Math.max(0, Math.min(100, ratio * 100))}%`;
    const auraWidth = `${vital.maxAura > 0 ? Math.max(0, Math.min(100, (vital.aura / vital.maxAura) * 100)) : 0}%`;
    node.hp?.style.setProperty('width', healthWidth, 'important');
    node.aura?.style.setProperty('width', auraWidth, 'important');
    node.root?.classList.toggle(styles.down, !vital.alive);
    node.root?.classList.toggle(styles.bleeding, !vital.alive && vital.bleed > 0);
  };

  useLayoutEffect(() => {
    latest.current.forEach((_vital, index) => paint(index));
  });

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      setSlot(index, hp, maxHp, aura, maxAura, alive, bleed = 1) {
        latest.current.set(index, { hp, maxHp, aura, maxAura, alive, bleed });
        paint(index);
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
            ref={(el) => {
              const current = nodes.current.get(slot.index) ?? { root: null, hp: null, aura: null };
              current.root = el;
              nodes.current.set(slot.index, current);
            }}
            role="listitem"
            className={[styles.slot, empty ? styles.empty : '', local ? styles.local : '', player && !player.isConnected ? styles.offline : ''].join(' ')}
            style={theme ? { ['--ryder' as string]: theme.aura } : undefined}
            title={empty ? `Player ${slot.index + 1}` : player.displayName}
          >
            <div className={styles.portrait}>
              {ryder ? <img src={ryder.icon} alt="" /> : <span>{slot.index + 1}</span>}
              <i className={styles.status} />
            </div>
            <div className={styles.meta}>
              <small>P{slot.index + 1}</small>
              <strong>{empty ? 'Empty' : player.displayName}</strong>
              {ryder ? <em>{ryder.flaw}</em> : null}
              <div className={styles.ticks}>
                <span className={styles.hp}>
                  <i
                    ref={(el) => {
                      const current = nodes.current.get(slot.index) ?? { root: null, hp: null, aura: null };
                      current.hp = el;
                      nodes.current.set(slot.index, current);
                    }}
                    style={{ width: player ? '100%' : '0%' }}
                  />
                </span>
                <span className={styles.aura}>
                  <i
                    ref={(el) => {
                      const current = nodes.current.get(slot.index) ?? { root: null, hp: null, aura: null };
                      current.aura = el;
                      nodes.current.set(slot.index, current);
                    }}
                    style={{ width: player ? '100%' : '0%' }}
                  />
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
