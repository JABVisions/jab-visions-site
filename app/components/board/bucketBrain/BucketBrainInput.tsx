"use client";

import type { FormEvent } from "react";
import styles from "./bucketBrainSpace.module.css";

export default function BucketBrainInput({
  value,
  disabled,
  onChange,
  onSubmit,
  onFocus,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className={styles.ask} onSubmit={handleSubmit}>
      <input
        className={styles.field}
        value={value}
        maxLength={180}
        disabled={disabled}
        placeholder="Ask Bucket Brain..."
        aria-label="Ask Bucket Brain"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
      <div className={styles.askRow}>
        <button className={styles.submit} type="submit" disabled={disabled || !value.trim()}>
          Ask
        </button>
      </div>
    </form>
  );
}
