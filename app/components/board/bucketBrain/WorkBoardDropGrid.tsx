"use client";

import styles from "./workBoardPreview.module.css";
import type { WorkBoardLibraryDrop, WorkBoardSection } from "@/lib/board/brain/workBoardPreview";
import { kindEmoji, kindLabel } from "@/lib/board/utils";

export default function WorkBoardDropGrid({
  drops,
  section,
  emptyCopy,
  onOpen,
}: {
  drops: WorkBoardLibraryDrop[];
  section: WorkBoardSection;
  emptyCopy: string;
  onOpen: (drop: WorkBoardLibraryDrop) => void;
}) {
  if (!drops.length) {
    return <div className={styles.empty}>{emptyCopy}</div>;
  }

  return (
    <div className={styles.grid} data-space-scroll>
      {drops.map((drop) => {
        const kind = drop.kind === "media" ? "media" : drop.kind;
        return (
          <button
            key={drop.id}
            type="button"
            className={section === "portfolio" ? styles.tilePortfolio : styles.tile}
            onClick={() => onOpen(drop)}
          >
            <span className={styles.thumb}>
              {drop.mediaUrl && drop.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={drop.mediaUrl} alt="" />
              ) : drop.mediaUrl && drop.mediaType === "video" ? (
                <video src={drop.mediaUrl} muted playsInline preload="metadata" />
              ) : (
                <span aria-hidden>{kindEmoji(kind)}</span>
              )}
            </span>
            <span className={styles.tileCopy}>
              <span className={styles.tileTitle}>{drop.title}</span>
              <span className={styles.tileKind}>{kindLabel(kind)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
