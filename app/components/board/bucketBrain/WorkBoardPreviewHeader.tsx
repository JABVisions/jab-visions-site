"use client";

import styles from "./workBoardPreview.module.css";
import type { WorkBoardPreviewCreator } from "@/lib/board/brain/workBoardPreview";

export default function WorkBoardPreviewHeader({
  creator,
}: {
  creator: WorkBoardPreviewCreator;
}) {
  const displayName = creator.displayName?.trim() || creator.username || "Board User";
  const initial = displayName.slice(0, 1).toUpperCase() || "B";
  const profession = creator.profession?.trim() || "Creator";
  const bio = creator.bio?.trim() || "";

  return (
    <header className={styles.header}>
      {creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.avatar} src={creator.avatarUrl} alt="" />
      ) : (
        <span className={styles.avatarFallback}>{initial}</span>
      )}
      <div className={styles.identity}>
        <div className={styles.kicker}>Work Board preview</div>
        <div className={styles.name}>{displayName}</div>
        <div className={styles.role}>
          {profession}
          {creator.username ? ` · @${creator.username}` : ""}
        </div>
        {bio ? <p className={styles.bio}>{bio}</p> : null}
      </div>
    </header>
  );
}
