"use client";

import Link from "next/link";
import styles from "./bucketBrainSpace.module.css";
import type { WorkBoardEntity } from "@/lib/board/bucketBrain/response";

export default function WorkBoardPreviewCard({ board }: { board: WorkBoardEntity }) {
  const initial = board.displayName.slice(0, 1).toUpperCase() || "B";
  return (
    <Link className={styles.card} href={board.href}>
      <div className={styles.cardTop}>
        {board.avatarUrl ? (
          <img className={styles.avatar} src={board.avatarUrl} alt="" />
        ) : (
          <span className={styles.avatarFallback}>{initial}</span>
        )}
        <div className={styles.cardCopy}>
          <div className={styles.name}>{board.displayName}</div>
          <div className={styles.role}>{board.profession || "Creator"}</div>
          <div className={styles.meta}>
            {board.location ? `${board.location} · ` : ""}
            {board.boardLabel || "Work Board"}
          </div>
        </div>
      </div>
      {board.bio ? <p className={styles.bio}>{board.bio}</p> : null}
      {board.previews.length ? (
        <div className={styles.previews}>
          {board.previews.map((preview) => (
            <span key={preview.id} className={styles.preview}>
              {preview.title}
            </span>
          ))}
        </div>
      ) : null}
      <span className={styles.open}>Open Work Board</span>
    </Link>
  );
}
