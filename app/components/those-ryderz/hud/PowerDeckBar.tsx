'use client';

import { Lock } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { MOVE_KEYS, type AbilityId } from '@/lib/ryderz-raid/config';
import styles from './PowerDeckBar.module.css';

/** Slot the deck draws. `id` is null for an open slot with nothing equipped. */
export interface DeckSlotView {
  key: string;
  id: AbilityId | null;
  name: string;
  icon: string;
  /** Slot is opened on the tree. Closed slots show a lock and a cost. */
  open: boolean;
  /** SP cost of the node that opens this slot, for the lock caption. */
  unlockCost?: number;
}

/** Per-frame numbers the loop writes straight to the DOM. */
export interface DeckLiveState {
  hp: number;
  maxHp: number;
  aura: number;
  maxAura: number;
  burnout: boolean;
  powersOut: boolean;
  guarding: boolean;
  signalAvailable: number;
  signalRound: number;
  level: number;
  levelProgress: number;
  moves: Array<{ ready: boolean; cooldown: number; duration: number }>;
  linked: boolean;
}

export type DeckBarApi = {
  setLive: (state: DeckLiveState) => void;
};

/**
 * Bottom-centre power deck: name and level, slim health and aura meters, the
 * five slots with their bindings, and the Signal Point balance. The loop
 * drives the meters and cooldown rings through `setLive`; React only
 * rerenders when the loadout itself changes.
 */
const PowerDeckBar = forwardRef<
  DeckBarApi,
  {
    name: string;
    slots: DeckSlotView[];
    color: string;
    onOpenTree: () => void;
    onPress?: (index: number) => void;
  }
>(function PowerDeckBar({ name, slots, color, onOpenTree, onPress }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const hpFill = useRef<HTMLElement>(null);
  const auraFill = useRef<HTMLElement>(null);
  const hpText = useRef<HTMLElement>(null);
  const auraText = useRef<HTMLElement>(null);
  const spText = useRef<HTMLElement>(null);
  const roundText = useRef<HTMLElement>(null);
  const levelText = useRef<HTMLElement>(null);
  const levelFill = useRef<HTMLElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ringRefs = useRef<Array<HTMLElement | null>>([]);
  const stateRefs = useRef<Array<HTMLElement | null>>([]);

  useImperativeHandle(ref, () => ({
    setLive(state) {
      const node = root.current;
      if (!node) return;
      const hp = state.maxHp > 0 ? Math.max(0, Math.min(1, state.hp / state.maxHp)) : 0;
      const aura = state.maxAura > 0 ? Math.max(0, Math.min(1, state.aura / state.maxAura)) : 0;
      if (hpFill.current) hpFill.current.style.transform = `scaleX(${hp})`;
      if (auraFill.current) auraFill.current.style.transform = `scaleX(${aura})`;
      if (hpText.current) hpText.current.textContent = `${Math.ceil(state.hp)}`;
      if (auraText.current) auraText.current.textContent = `${Math.ceil(state.aura)}`;
      if (spText.current) spText.current.textContent = state.signalAvailable.toLocaleString('en-US');
      if (roundText.current) roundText.current.textContent = state.signalRound > 0 ? `+${state.signalRound.toLocaleString('en-US')}` : '';
      if (levelText.current) levelText.current.textContent = `LV ${state.level}`;
      if (levelFill.current) levelFill.current.style.transform = `scaleX(${Math.max(0, Math.min(1, state.levelProgress))})`;
      node.dataset.low = hp < 0.3 ? 'true' : 'false';
      node.dataset.burnout = state.burnout || state.powersOut ? 'true' : 'false';
      node.dataset.guard = state.guarding ? 'true' : 'false';
      node.dataset.link = state.linked ? 'true' : 'false';
      for (let i = 0; i < slotRefs.current.length; i += 1) {
        const slot = slotRefs.current[i];
        // Locked slots keep their static "N SP" caption; the loop only drives open ones.
        if (!slot || slot.dataset.locked === 'true') continue;
        const move = state.moves[i];
        const live = Boolean(move);
        const ready = live && !state.burnout && !state.powersOut && move.ready;
        slot.dataset.ready = ready ? 'true' : 'false';
        slot.dataset.on = live && move.duration > 0 ? 'true' : 'false';
        const ring = ringRefs.current[i];
        if (ring) {
          // Cooldown ring: a conic sweep that empties as the power comes back.
          const frac = live && move.cooldown > 0.16 ? Math.min(1, move.cooldown / 2.4) : 0;
          ring.style.setProperty('--cd', `${Math.round(frac * 360)}deg`);
          ring.dataset.show = frac > 0 ? 'true' : 'false';
        }
        const label = stateRefs.current[i];
        if (label) {
          label.textContent = !live
            ? ''
            : state.powersOut
              ? 'OUT'
              : state.burnout
                ? 'NO AURA'
                : move.duration > 0
                  ? 'ON'
                  : move.cooldown > 0.16
                    ? `${move.cooldown.toFixed(1)}s`
                    : move.ready
                      ? 'READY'
                      : 'LOW';
        }
      }
    },
  }));

  return (
    <div ref={root} className={styles.deck} style={{ ['--deck' as string]: color }} data-low="false" aria-label="Power deck">
      <div className={styles.head}>
        <strong className={styles.name}>{name}</strong>
        <span className={styles.level}>
          <em ref={levelText}>LV 1</em>
          <i>
            <b ref={levelFill} />
          </i>
        </span>
        <button type="button" className={styles.tree} onClick={onOpenTree} title="Open the Power Tree (T)">
          Power Tree
        </button>
      </div>
      <div className={styles.meters}>
        <div className={`${styles.meter} ${styles.hp}`} aria-label="Health">
          <span>Health</span>
          <b>
            <i ref={hpFill} />
          </b>
          <em ref={hpText}>0</em>
        </div>
        <div className={`${styles.meter} ${styles.aura}`} aria-label="Aura">
          <span>Aura</span>
          <b>
            <i ref={auraFill} />
          </b>
          <em ref={auraText}>0</em>
        </div>
      </div>
      <div className={styles.slots} role="toolbar" aria-label="Power slots">
        {slots.map((slot, i) => (
          <button
            key={`${slot.key}-${slot.id ?? 'empty'}`}
            type="button"
            ref={(node) => {
              slotRefs.current[i] = node;
            }}
            className={`${styles.slot} ${slot.open ? '' : styles.slotLocked} ${slot.id ? '' : styles.slotEmpty}`}
            data-ready="false"
            data-on="false"
            data-locked={slot.open ? 'false' : 'true'}
            aria-disabled={!slot.open || !slot.id}
            onClick={() => (slot.open && slot.id ? onPress?.(i) : onOpenTree())}
            title={slot.open ? (slot.id ? `${slot.name} · ${slot.key}` : `Empty slot · bind a power in the deck`) : `Locked · open on the Power Tree${slot.unlockCost ? ` for ${slot.unlockCost} SP` : ''}`}
          >
            <i
              ref={(node) => {
                ringRefs.current[i] = node;
              }}
              className={styles.ring}
              data-show="false"
            />
            <span className={styles.key}>{slot.key || MOVE_KEYS[i]}</span>
            <span className={styles.icon}>{slot.open ? (slot.id ? slot.icon : '+') : <Lock size={15} />}</span>
            <b className={styles.label}>{slot.open ? (slot.id ? slot.name : 'Empty') : 'Locked'}</b>
            <em
              ref={(node) => {
                stateRefs.current[i] = node;
              }}
              className={styles.state}
            >
              {slot.open ? '' : slot.unlockCost ? `${slot.unlockCost} SP` : ''}
            </em>
          </button>
        ))}
      </div>
      <div className={styles.foot}>
        <span className={styles.sp}>
          SP <strong ref={spText}>0</strong>
          <em ref={roundText} />
        </span>
        <span className={styles.hintKeys}>
          <kbd>Shift</kbd>+<kbd>C</kbd> heavy · <kbd>Shift</kbd>+<kbd>V</kbd> launcher · hold <kbd>Z</kbd> guard
        </span>
      </div>
    </div>
  );
});

export default PowerDeckBar;
