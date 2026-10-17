'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import styles from './PauseMenu.module.css';

export interface NavItem<Id extends string = string> {
  id: Id;
  label: string;
  hint: string;
  /** Rendered with a "soon" badge; still selectable so the screen can explain itself. */
  soon?: boolean;
  danger?: boolean;
}

/**
 * Vertical command list with a gliding marker. Focus is controlled by the
 * parent so keyboard and pointer stay in sync.
 */
export default function PauseMenuNavigation<Id extends string>({
  items,
  index,
  onFocus,
  onSelect,
}: {
  items: NavItem<Id>[];
  index: number;
  onFocus: (index: number) => void;
  onSelect: (id: Id) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [marker, setMarker] = useState({ top: 0, height: 0 });

  useLayoutEffect(() => {
    const el = refs.current[index];
    if (!el) return;
    setMarker({ top: el.offsetTop + 8, height: Math.max(0, el.offsetHeight - 16) });
  }, [index, items.length]);

  return (
    <nav className={styles.nav} aria-label="Pause menu">
      <span
        className={styles.marker}
        style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
        aria-hidden="true"
      />
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          ref={(node) => {
            refs.current[i] = node;
          }}
          className={[
            styles.navItem,
            i === index ? styles.navActive : '',
            item.soon ? styles.navSoon : '',
            item.danger ? styles.navDanger : '',
          ].join(' ')}
          onMouseEnter={() => onFocus(i)}
          onFocus={() => onFocus(i)}
          onClick={() => onSelect(item.id)}
        >
          <strong>{item.label}</strong>
          <small>{item.hint}</small>
        </button>
      ))}
    </nav>
  );
}
