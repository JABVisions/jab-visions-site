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

function cleanUsername(username: string) {
  return username.replace(/^@+/, "").trim().toLowerCase();
}

export default function FriendZoneOrb({ user }: Props) {
  const state = getFriendZoneState(user);
  const label = getRelationshipLabel(state);
  const description = getRelationshipDescription(state);
  const username = cleanUsername(user.username);
  const profileHref = `/board/profile/${encodeURIComponent(username)}`;

  return (
    <Link
      href={profileHref}
      className={`${styles.orbCard} ${styles[state]}`}
      aria-label={`Open ${user.name}'s Board`}
      title={`Open ${user.name}'s Board`}
    >
      <div className={styles.orbShell}>
        <div className={styles.auraRing} />
        <div className={styles.signalPulse} />
        <div className={styles.glassBloom} />

        <img
          src={user.avatarUrl}
          alt={`${user.name}'s avatar`}
          className={styles.avatar}
        />

        <div className={styles.memoryDust} />
        <span className={styles.stateGlyph} aria-hidden="true" />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{user.name}</p>
        <p className={styles.username}>@{username}</p>
        <p className={styles.status}>{label}</p>
        <p className={styles.description}>{description}</p>
        <p className={styles.lastActive}>{user.lastActiveLabel}</p>
      </div>
    </Link>
  );
}
