'use client';

import { Lock } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { MOVE_KEYS, type AbilityId } from '@/lib/ryderz-raid/config';
import styles from './PowerDeckBar.module.css';

/** Slot the dock draws. `id` is null for an open slot with nothing equipped. */
export interface DeckSlotView {
  key: string;
  id: AbilityId | null;
  name: string;
  icon: string;
  /** Slot is opened on the tree. Closed slots show a lock and a cost. */
  open: boolean;
  /** SP cost of the node that opens this slot, for the lock tooltip. */
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
 * Bottom-centre power dock: six circles numbered 1–6, one per deck slot. Each
 * circle carries its power's sigil, a conic cooldown sweep and a ready glow;
 * locked slots show a padlock. The loop drives the rings through `setLive`;
 * React only rerenders when the loadout itself changes. Vitals live on the
 * circular HUD, so the dock stays small enough to sit under the action.
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
>(function PowerDeckBar({ slots, color, onOpenTree, onPress }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const spText = useRef<HTMLElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ringRefs = useRef<Array<HTMLElement | null>>([]);
  const timerRefs = useRef<Array<HTMLElement | null>>([]);

  useImperativeHandle(ref, () => ({
    setLive(state) {
      const node = root.current;
      if (!node) return;
      if (spText.current) spText.current.textContent = state.signalAvailable.toLocaleString('en-US');
      node.dataset.burnout = state.burnout || state.powersOut ? 'true' : 'false';
      node.dataset.guard = state.guarding ? 'true' : 'false';
      node.dataset.link = state.linked ? 'true' : 'false';
      for (let i = 0; i < slotRefs.current.length; i += 1) {
        const slot = slotRefs.current[i];
        if (!slot || slot.dataset.locked === 'true') continue;
        const move = state.moves[i];
        const live = Boolean(move);
        const ready = live && !state.burnout && !state.powersOut && move.ready;
        slot.dataset.ready = ready ? 'true' : 'false';
        slot.dataset.on = live && move.duration > 0 ? 'true' : 'false';
        const ring = ringRefs.current[i];
        const cooling = live && move.cooldown > 0.16;
        if (ring) {
          // Cooldown ring: a conic sweep that empties as the power comes back.
          const frac = cooling ? Math.min(1, move.cooldown / 2.4) : 0;
          ring.style.setProperty('--cd', `${Math.round(frac * 360)}deg`);
          ring.dataset.show = frac > 0 ? 'true' : 'false';
        }
        const timer = timerRefs.current[i];
        if (timer) timer.textContent = cooling ? move.cooldown.toFixed(1) : '';
      }
    },
  }));

  return (
    <div ref={root} className={styles.dock} style={{ ['--deck' as string]: color }} aria-label="Power dock" role="toolbar">
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
          aria-label={slot.open ? (slot.id ? `${slot.name} · key ${slot.key}` : `Slot ${slot.key} · empty`) : `Slot ${slot.key} · locked`}
          onClick={() => (slot.open && slot.id ? onPress?.(i) : onOpenTree())}
          title={
            slot.open
              ? slot.id
                ? `${slot.name} · press ${slot.key}`
                : `Empty · bind a power on the Power Tree (T)`
              : `Locked · open on the Power Tree${slot.unlockCost ? ` for ${slot.unlockCost.toLocaleString('en-US')} SP` : ''}`
          }
        >
          <i
            ref={(node) => {
              ringRefs.current[i] = node;
            }}
            className={styles.ring}
            data-show="false"
          />
          <span className={styles.icon}>{slot.open ? (slot.id ? slot.icon : '+') : <Lock size={13} />}</span>
          <em
            ref={(node) => {
              timerRefs.current[i] = node;
            }}
            className={styles.timer}
          />
          <b className={styles.key}>{slot.key || MOVE_KEYS[i]}</b>
        </button>
      ))}
      <button type="button" className={styles.sp} onClick={onOpenTree} title="Signal Points · open the Power Tree (T)">
        <strong ref={spText}>0</strong>
        <span>SP</span>
      </button>
    </div>
  );
});

export default PowerDeckBar;
