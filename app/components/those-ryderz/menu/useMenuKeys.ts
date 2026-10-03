'use client';

import { useEffect, useRef } from 'react';

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

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
};

/**
 * Keyboard navigation for menu screens. The handler returns true when it
 * consumed the key, which stops the key from scrolling the page or reaching
 * other listeners. Only one screen should be enabled at a time.
 */
export function useMenuKeys(handler: (key: MenuKey, event: KeyboardEvent) => boolean | void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (event.code !== 'Escape') return;
      }
      const key = KEY_MAP[event.code];
      if (!key) return;
      if (latest.current(key, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Capture so the menu wins over the raid's own key handling.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enabled]);
}

export function wrap(index: number, length: number) {
  return length <= 0 ? 0 : ((index % length) + length) % length;
}
