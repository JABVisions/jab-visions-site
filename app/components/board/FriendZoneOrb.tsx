"use client";

import Link from "next/link";
import {
  FriendZoneOrbUser,
  getFriendZoneState,
  getRelationshipDescription,
  getRelationshipLabel,
} from "@/lib/board/friendZoneSignals";
import styles from "./FriendZoneOrb.module.css";

type Props = {
  user: FriendZoneOrbUser;
};

function cleanUsername(username: unknown) {
  return String(username || "board")
    .replace(/^@+/, "")
    .trim()
    .toLowerCase();
}

export default function FriendZoneOrb({ user }: Props) {
  const state = getFriendZoneState(user);
  const label = getRelationshipLabel(state);
  const description = getRelationshipDescription(state);
  const username = cleanUsername(user.username);
  const name = String(user.name || username || "Board User");
  const avatarUrl =
    typeof user.avatarUrl === "string" && user.avatarUrl.trim()
      ? user.avatarUrl
      : "/assets/board-welcome-mark.jpg";
  const lastActiveLabel = String(user.lastActiveLabel || "Board signal");
  const profileHref = `/board/profile/${encodeURIComponent(username)}`;

  return (
    <Link
      href={profileHref}
      className={`${styles.orbCard} ${styles[state]}`}
      aria-label={`Open ${name}'s Board`}
      title={`Open ${name}'s Board`}
    >
      <div className={styles.orbShell}>
        <div className={styles.auraRing} />
        <div className={styles.signalPulse} />
        <div className={styles.glassBloom} />

        <img
          src={avatarUrl}
          alt={`${name}'s avatar`}
          className={styles.avatar}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/assets/board-welcome-mark.jpg";
          }}
        />

        <div className={styles.memoryDust} />
        <span className={styles.stateGlyph} aria-hidden="true" />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        <p className={styles.username}>@{username}</p>
        <p className={styles.status}>{label}</p>
        <p className={styles.description}>{description}</p>
        <p className={styles.lastActive}>{lastActiveLabel}</p>
      </div>
    </Link>
  );
}
