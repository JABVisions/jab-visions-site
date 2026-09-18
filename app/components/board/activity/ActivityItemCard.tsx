"use client";

import {
  actorAvatar,
  actorName,
  describeActivity,
  relativeActivityTime,
  typeLabel,
  type GroupedActivity,
} from "@/lib/board/notifications";
import styles from "./activityChannel.module.css";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ActivityItemCard({
  group,
  index = 0,
  compact = false,
  rise = false,
  onOpen,
  onAcceptWave,
  onDecline,
}: {
  group: GroupedActivity;
  index?: number;
  compact?: boolean;
  rise?: boolean;
  onOpen: () => void;
  onAcceptWave?: () => void;
  onDecline?: () => void;
}) {
  const item = group.latest;
  const names = Array.from(
    new Set(group.items.map((entry) => actorName(entry)).filter(Boolean))
  );
  const copy = describeActivity(item, { names, count: group.count });
  const avatar = actorAvatar(item);
  const name = actorName(item);
  const initial = name.slice(0, 1).toUpperCase();
  const unread = group.unread;

  return (
    <article
      className={clsx(
        styles.card,
        styles[item.activityType],
        unread ? styles.cardUnread : styles.cardRead,
        compact && styles.compact,
        !compact && styles[`float${index % 5}` as "float0"],
        rise && styles.rise
      )}
      style={rise ? { animationDelay: `${Math.min(index, 14) * 48}ms` } : undefined}
    >
      <button type="button" className={styles.avatar} onClick={onOpen} aria-label={copy}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" />
        ) : (
          initial
        )}
      </button>
      <div className={styles.body}>
        <button type="button" onClick={onOpen} className={styles.body}>
          <div className={styles.kicker}>
            <span>{typeLabel(item.activityType)}</span>
            <span>
              {unread ? <span className={styles.pulse} aria-label="Unread" /> : null}{" "}
              {relativeActivityTime(item.createdAt)}
            </span>
          </div>
          <strong className={styles.copy}>{copy}</strong>
          {item.preview ? <p className={styles.preview}>{item.preview}</p> : null}
          {item.imageUrl ? (
            <div className={styles.thumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt="" />
            </div>
          ) : null}
        </button>
        {item.activityType === "friendzone_request" ? (
          <div className={styles.actions}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAcceptWave?.();
              }}
            >
              Accept
            </button>
            <button type="button" onClick={onOpen}>
              View Profile
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDecline?.();
              }}
            >
              Decline
            </button>
          </div>
        ) : item.activityType === "wave" ? (
          <div className={styles.actions}>
            <button type="button" onClick={onOpen}>
              View Profile
            </button>
          </div>
        ) : item.activityType === "dm" ? (
          <div className={styles.actions}>
            <button type="button" onClick={onOpen}>
              Open conversation
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
