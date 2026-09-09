"use client";

import { useEffect, useMemo, type RefObject } from "react";
import styles from "./DropPadActivityChannel.module.css";
import type {
  ActivityChannelItem,
  ActivitySignalType,
  CompactDropType,
} from "@/lib/board/activityChannel";

const ACCENTS: Record<ActivitySignalType, string> = {
  push: "#7ee2ff",
  pin: "#b7ff2d",
  wave: "#5fa8ff",
  save: "#a87bff",
  comment: "#ff4fd8",
  momentum: "#ffcf4d",
  bucket: "#e94fe0",
};

const DROP_GLYPH: Record<CompactDropType, string> = {
  vision: "👁️",
  video: "🎬",
  voice: "🎙️",
  thought: "💭",
  work: "🧩",
  pay: "💸",
  store: "🛍️",
  announcement: "📣",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (!Number.isFinite(m) || m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function DropPreview({
  drop,
}: {
  drop: NonNullable<Extract<ActivityChannelItem, { kind: "signal" }>["relatedDrop"]>;
}) {
  return (
    <div className={styles.dropPreview}>
      {drop.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.dropThumb} src={drop.mediaUrl} alt="" />
      ) : (
        <span className={styles.dropThumb} aria-hidden>
          {DROP_GLYPH[drop.type] ?? "🫧"}
        </span>
      )}
      <div className={styles.dropInfo}>
        <div className={styles.dropType}>{drop.type} drop</div>
        <div className={styles.dropTitle}>{drop.title}</div>
        {drop.description ? <div className={styles.dropDesc}>{drop.description}</div> : null}
      </div>
    </div>
  );
}

/**
 * Activity Channel — a conversational signal waterfall. Signals are primary,
 * whispers a soft secondary layer, and drops appear only attached to a signal.
 * The "Activity Channel" title is a bottom-anchored gateway; the stream flows
 * upward above it (newest near the gateway, scroll up for deeper signals).
 */
export default function DropPadActivityChannel({
  items,
  active,
  onReturn,
  scrollRef,
}: {
  items: ActivityChannelItem[];
  active: boolean;
  onReturn: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  // Render oldest → newest (top → bottom) so the freshest sits by the gateway.
  const ordered = useMemo(() => [...items].reverse(), [items]);

  // On entering the channel, rest the scroll at the bottom (freshest + gateway).
  useEffect(() => {
    if (!active) return;
    const el = scrollRef?.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [active, items, scrollRef]);

  return (
    <div className={styles.channel}>
      <div className={styles.stream} ref={scrollRef}>
        <div className={styles.streamInner}>
          {ordered.map((item) =>
            item.kind === "whisper" ? (
              <p
                key={item.id}
                className={`${styles.whisper} ${
                  item.intensity === "medium" ? styles.whisperMedium : ""
                }`}
              >
                {item.message}
              </p>
            ) : (
              <div
                key={item.id}
                className={styles.signal}
                style={{ ["--accent" as string]: ACCENTS[item.signalType ?? "push"] }}
              >
                {item.user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.avatar} src={item.user.avatarUrl} alt="" />
                ) : (
                  <span className={styles.avatar} aria-hidden>
                    {(item.user?.name ?? "B").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className={styles.body}>
                  <p className={styles.message}>{item.message}</p>
                  <div className={styles.meta}>
                    <span>{relTime(item.timestamp)}</span>
                    {item.signalType ? (
                      <span className={styles.typeChip}>{item.signalType}</span>
                    ) : null}
                  </div>
                  {item.relatedDrop ? <DropPreview drop={item.relatedDrop} /> : null}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className={styles.gateway}>
        <button
          type="button"
          className={styles.gatewayReturn}
          onClick={onReturn}
          aria-label="Return to Orb Home"
        >
          ⌄
        </button>
        <div className={styles.gatewayEyebrow}>Drop Pad · Upper Layer</div>
        <h2 className={styles.gatewayTitle}>Activity Channel</h2>
        <div className={styles.gatewayHint}>Swipe down to return to Orb Home</div>
      </div>
    </div>
  );
}
