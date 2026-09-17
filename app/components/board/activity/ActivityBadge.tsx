"use client";

import { useActivityChannelOptional } from "./ActivityProvider";
import styles from "./activityChannel.module.css";

export default function ActivityBadge({
  className,
  tone = "holographic",
}: {
  className?: string;
  tone?: "holographic" | "light";
}) {
  const activity = useActivityChannelOptional();
  const count = activity?.unreadCount ?? 0;
  if (!count) return null;
  return (
    <span
      className={`${styles.badge} ${tone === "light" ? styles.badgeLight : ""} ${className ?? ""}`}
      aria-label={`${count} unread activity`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
