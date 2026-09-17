"use client";

import styles from "./workBoardPreview.module.css";
import type { WorkBoardSection } from "@/lib/board/brain/workBoardPreview";

export default function WorkBoardPreviewNavigation({
  section,
  onChange,
}: {
  section: WorkBoardSection;
  onChange: (section: WorkBoardSection) => void;
}) {
  return (
    <div className={styles.nav} role="tablist" aria-label="Work Board libraries">
      {(["portfolio", "assets"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={section === value}
          className={section === value ? styles.tabOn : styles.tab}
          onClick={() => onChange(value)}
        >
          {value === "portfolio" ? "Portfolio" : "Assets"}
        </button>
      ))}
    </div>
  );
}
