'use client';

import { useEffect, useRef } from 'react';

/** `prev` / `next` page between tabs on screens that have them: Q / E, Tab, the shoulder buttons. */
export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'prev' | 'next';

const KEY_MAP: Record<string, MenuKey> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'prev',
  KeyE: 'next',
  Tab: 'next',
};

/** Standard-mapping gamepad buttons that drive menus. */
const PAD_BUTTONS: Array<[index: number, key: MenuKey]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [0, 'confirm'],
  [1, 'back'],
  [4, 'prev'],
  [5, 'next'],
];

const STICK_DEADZONE = 0.55;
/** Held direction repeats after an initial delay, then at a steady rate (ms). */
const REPEAT_DELAY = 380;
const REPEAT_RATE = 120;

/**
 * Keyboard and gamepad navigation for menu screens. The handler returns true
 * when it consumed the input, which stops the key from scrolling the page or
 * reaching other listeners. Only one screen should be enabled at a time.
 *
 * Gamepad: d-pad or left stick move, A confirms, B goes back. Held directions
 * auto-repeat so long lists are quick to walk.
 */
export function useMenuKeys(handler: (key: MenuKey, event: KeyboardEvent | null) => boolean | void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (event.code !== 'Escape') return;
      }
      let key = KEY_MAP[event.code];
      if (!key) return;
      if (event.code === 'Tab' && event.shiftKey) key = 'prev';
      if (latest.current(key, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Capture so the menu wins over the raid's own key handling.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    // Key -> time the next auto-repeat may fire.
    const held = new Map<MenuKey, number>();
    const fire = (key: MenuKey, now: number) => {
      const next = held.get(key);
      if (next === undefined) {
        held.set(key, now + REPEAT_DELAY);
        latest.current(key, null);
        return;
      }
      // Only directions repeat; confirm, back and the tab keys fire once per press.
      if (key === 'confirm' || key === 'back' || key === 'prev' || key === 'next') return;
      if (now >= next) {
        held.set(key, now + REPEAT_RATE);
        latest.current(key, null);
      }
    };
    // Ignore buttons already down when the menu opened so the press that
    // paused the game does not also pick the first item.
    let armed = false;
    const poll = () => {
      frame = requestAnimationFrame(poll);
      const now = performance.now();
      const pads = navigator.getGamepads?.() ?? [];
      const down = new Set<MenuKey>();
      for (const pad of pads) {
        if (!pad) continue;
        for (const [index, key] of PAD_BUTTONS) {
          if (pad.buttons[index]?.pressed) down.add(key);
        }
        const x = pad.axes[0] ?? 0;
        const y = pad.axes[1] ?? 0;
        if (y < -STICK_DEADZONE) down.add('up');
        if (y > STICK_DEADZONE) down.add('down');
        if (x < -STICK_DEADZONE) down.add('left');
        if (x > STICK_DEADZONE) down.add('right');
      }
      if (!armed) {
        if (down.size === 0) armed = true;
        return;
      }
      for (const key of [...held.keys()]) if (!down.has(key)) held.delete(key);
      for (const key of down) fire(key, now);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}

export function wrap(index: number, length: number) {
  return length <= 0 ? 0 : ((index % length) + length) % length;
}
