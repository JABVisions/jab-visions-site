"use client";

import Link from "next/link";
import styles from "./bucketBrainSpace.module.css";
import type { CreatorEntity, WorkBoardEntity } from "@/lib/board/brain/response";

export default function WorkBoardPreviewCard({
  board,
}: {
  board: WorkBoardEntity | CreatorEntity;
}) {
  const displayName = board.displayName?.trim() || board.username || "Board User";
  const initial = displayName.slice(0, 1).toUpperCase() || "B";
  const profession = board.profession?.trim() || "Creator";
  const location = "location" in board ? board.location : null;
  const boardLabel = "boardLabel" in board ? board.boardLabel : "Work Board";
  const bio = board.bio?.trim() || "";
  const previews = "previews" in board ? board.previews : [];
  const href = board.href || `/board/profile/${encodeURIComponent(board.username)}`;
  const glow = "glowColor" in board ? board.glowColor : null;

  return (
    <Link
      className={styles.card}
      href={href}
      style={glow ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 22px ${glow}33` } : undefined}
    >
      <div className={styles.cardTop}>
        {board.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.avatar} src={board.avatarUrl} alt="" />
        ) : (
          <span className={styles.avatarFallback}>{initial}</span>
        )}
        <div className={styles.cardCopy}>
          <div className={styles.name}>{displayName}</div>
          <div className={styles.role}>{profession}</div>
          <div className={styles.meta}>
            {location ? `${location} · ` : ""}
            {boardLabel || "Work Board"}
          </div>
        </div>
      </div>
      {bio ? <p className={styles.bio}>{bio}</p> : null}
      {previews.length ? (
        <div className={styles.previews}>
          {previews.map((preview) => (
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
