"use client";

// The embedded Descript doc a Thought / Doc drop carries instead of its full
// text: one laminated 4:5 Board sheet that scrolls its own body, so a chapter
// stays inside the drop frame.

import styles from "./descriptDocEmbed.module.css";

function wordCount(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export default function DescriptDocEmbed({
  title,
  text,
  label = "Descript Doc",
}: {
  title?: string;
  text: string;
  label?: string;
}) {
  const words = wordCount(text);

  return (
    <div className={styles.sheet}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {words ? (
          <span className={styles.count}>{words.toLocaleString()} words</span>
        ) : null}
      </div>

      {title ? <div className={styles.title}>{title}</div> : null}

      <div
        className={styles.body}
        tabIndex={0}
        role="article"
        aria-label={title ? `${title} — Descript document` : "Descript document"}
      >
        {text}
      </div>

      <div className={styles.laminate} aria-hidden />
    </div>
  );
}
