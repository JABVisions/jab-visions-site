"use client";

import { useEffect, useRef } from "react";
import { ACTIVITY_FILTERS } from "@/lib/board/notifications";
import { handleActivityNavigation } from "@/lib/board/activityNavigation";
import { persistWave } from "@/lib/board/persistWave";
import { actorUsername } from "@/lib/board/notifications";
import { useActivityChannel } from "./ActivityProvider";
import ActivityItemCard from "./ActivityItemCard";
import styles from "./activityChannel.module.css";

export default function ActivityFeed({
  variant = "holographic",
  onOpened,
}: {
  variant?: "holographic" | "compact";
  onOpened?: () => void;
}) {
  const {
    grouped,
    filter,
    setFilter,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    markRead,
    markSeen,
    setupRequired,
  } = useActivityChannel();
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const compact = variant === "compact";

  useEffect(() => {
    void markSeen();
    // Opening the Channel marks items seen, not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = moreRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, grouped.length]);

  return (
    <div className={`${styles.feed} ${compact ? "" : styles.holographic}`}>
      <div className={`${styles.filters} ${compact ? styles.compactFilters : ""}`}>
        {ACTIVITY_FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`${styles.chip} ${filter === entry.id ? styles.chipActive : ""}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {setupRequired ? (
        <p className={`${styles.note} ${compact ? styles.compactEmpty : ""}`}>
          Activity Channel needs the board_notifications SQL installed in Supabase.
        </p>
      ) : loading && grouped.length === 0 ? (
        <p className={`${styles.note} ${compact ? styles.compactEmpty : ""}`}>
          Listening for movement across Board…
        </p>
      ) : grouped.length === 0 ? (
        <p className={`${styles.empty} ${compact ? styles.compactEmpty : ""}`}>
          The Channel is quiet. Waves, Signals, comments, and messages will appear here.
        </p>
      ) : (
        grouped.map((group, index) => (
          <ActivityItemCard
            key={group.key}
            group={group}
            index={index}
            compact={compact}
            onOpen={() => {
              void markRead(group.items.map((item) => item.id));
              handleActivityNavigation(group.latest);
              onOpened?.();
            }}
            onAcceptWave={() => {
              const username = actorUsername(group.latest);
              void persistWave("me", username, group.latest.actorUserId || undefined);
              void markRead(group.items.map((item) => item.id));
            }}
            onDecline={() => {
              void markRead(group.items.map((item) => item.id));
            }}
          />
        ))
      )}

      {hasMore ? (
        <button
          ref={moreRef}
          type="button"
          className={styles.more}
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading" : "Older activity"}
        </button>
      ) : null}
    </div>
  );
}
