'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './GlitchButton.module.css';

export default function GlitchButton({
  label,
  hint,
  icon,
  selected = false,
  dim = false,
  className = '',
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  icon?: ReactNode;
  selected?: boolean;
  dim?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[styles.btn, selected ? styles.selected : '', dim ? styles.dim : '', className].join(' ')}
      aria-pressed={selected}
      {...rest}
    >
      <span className={styles.frame} aria-hidden="true" />
      <span className={styles.scan} aria-hidden="true" />
      <span className={styles.code} aria-hidden="true" />
      <span className={styles.shards} aria-hidden="true" />
      <span className={styles.body}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.copy}>
          <strong className={styles.label} data-text={label}>
            {label}
          </strong>
          {hint ? <small>{hint}</small> : null}
          {children}
        </span>
      </span>
    </button>
  );
}
