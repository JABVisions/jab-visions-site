'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import styles from './ComboIndicator.module.css';

export type ComboHudState = {
  count: number;
  label: string;
  tier: string;
  color: string;
  revision: number;
  power: boolean;
  powerLabel: string;
  powerLeft: number;
};

export type ComboHudApi = {
  setCombo: (state: ComboHudState) => void;
  setLinked: (linked: boolean) => void;
};

/** Compact chain readout. The loop writes the DOM; React does not rerender per hit. */
const ComboIndicator = forwardRef<ComboHudApi>(function ComboIndicator(_, ref) {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLElement>(null);
  const link = useRef<HTMLElement>(null);
  const seen = useRef(-1);

  useImperativeHandle(ref, () => ({
    setCombo(state) {
      const node = root.current;
      if (!node) return;
      const showChain = state.count >= 2;
      const showLink = state.power;
      node.dataset.show = showChain || showLink ? 'true' : 'false';
      node.dataset.tier = state.tier;
      node.style.setProperty('--combo', state.color);
      if (count.current) count.current.textContent = showChain ? state.label : '';
      if (link.current) {
        link.current.hidden = !showLink;
        link.current.textContent = showLink ? state.powerLabel : '';
      }
      if (state.revision !== seen.current) {
        seen.current = state.revision;
        node.dataset.pop = String(state.revision);
      }
    },
    setLinked(linked) {
      root.current?.toggleAttribute('data-linked', linked);
    },
  }));

  return (
    <div ref={root} className={styles.combo} data-show="false" data-tier="none" aria-hidden="true">
      <strong ref={count} />
      <em ref={link} hidden />
    </div>
  );
});

export default ComboIndicator;
