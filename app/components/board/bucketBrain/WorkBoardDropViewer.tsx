"use client";

import styles from "./workBoardPreview.module.css";
import VoiceDropSoundboard from "@/app/components/board/VoiceDropSoundboard";
import type { WorkBoardLibraryDrop } from "@/lib/board/brain/workBoardPreview";
import { kindLabel } from "@/lib/board/utils";

export default function WorkBoardDropViewer({
  drop,
  onClose,
}: {
  drop: WorkBoardLibraryDrop;
  onClose: () => void;
}) {
  const kind = drop.kind === "media" ? "media" : drop.kind;

  return (
    <div className={styles.viewer} role="dialog" aria-modal="true" aria-labelledby="work-board-drop-title">
      <button type="button" className={styles.viewerBackdrop} onClick={onClose} aria-label="Close Drop" />
      <div className={styles.viewerPanel}>
        <div className={styles.viewerTop}>
          <div>
            <div className={styles.viewerKicker}>{kindLabel(kind)}</div>
            <h2 id="work-board-drop-title" className={styles.viewerTitle}>{drop.title}</h2>
          </div>
          <button type="button" className={styles.back} onClick={onClose}>
            Close
          </button>
        </div>
        <WorkBoardDropBody drop={drop} expanded />
      </div>
    </div>
  );
}

export function WorkBoardDropBody({
  drop,
  expanded = false,
}: {
  drop: WorkBoardLibraryDrop;
  expanded?: boolean;
}) {
  if (drop.kind === "youtube" && drop.embedUrl) {
    return (
      <div className={styles.media}>
        <iframe title={drop.title} src={drop.embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
      </div>
    );
  }
  if (drop.kind === "music" && drop.embedUrl) {
    return (
      <div className={styles.media}>
        <iframe title={drop.title} src={drop.embedUrl} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
      </div>
    );
  }
  if (drop.mediaUrl && drop.mediaType === "audio") {
    return <VoiceDropSoundboard src={drop.mediaUrl} title={drop.title} compact={!expanded} />;
  }
  if (drop.mediaUrl && drop.mediaType === "video") {
    return (
      <div className={styles.media}>
        <video src={drop.mediaUrl} controls playsInline />
      </div>
    );
  }
  if (drop.mediaUrl && drop.mediaType !== "file") {
    return (
      <div className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={drop.mediaUrl} alt={drop.title} />
      </div>
    );
  }
  if (drop.kind === "note" || drop.text) {
    return <div className={styles.note}>{drop.text || drop.description || "No note"}</div>;
  }
  if (drop.url) {
    return (
      <div className={styles.linkBox}>
        <div>{drop.description || drop.url}</div>
        <a href={drop.url} target="_blank" rel="noreferrer">
          Open →
        </a>
      </div>
    );
  }
  return <div className={styles.empty}>This Drop has no public preview yet.</div>;
}
