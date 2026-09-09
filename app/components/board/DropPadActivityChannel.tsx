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
 *
 * `layout="overlay"` — full-layer view with a bottom gateway (legacy swipe-up).
 * `layout="zone"` — top-space panel for the Drop Pad OS spatial home grid.
 */
export default function DropPadActivityChannel({
  items,
  active,
  onReturn,
  scrollRef,
  layout = "overlay",
}: {
  items: ActivityChannelItem[];
  active: boolean;
  onReturn?: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  layout?: "overlay" | "zone";
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

  const isZone = layout === "zone";

  return (
    <div className={`${styles.channel} ${isZone ? styles.channelZone : ""}`}>
      {isZone ? (
        <div className={styles.zoneHead}>
          <div className={styles.zoneEyebrow}>Drop Pad · Top Space</div>
          <h2 className={styles.zoneTitle}>Activity Channel</h2>
        </div>
      ) : null}

      <div className={styles.stream} ref={scrollRef}>
        <div className={`${styles.streamInner} ${isZone ? styles.streamInnerZone : ""}`}>
          {ordered.length === 0 ? (
            <p className={styles.whisper}>Signals will land here as Board activity moves.</p>
          ) : (
            ordered.map((item) =>
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
            )
          )}
        </div>
      </div>

      {!isZone ? (
        <div className={styles.gateway}>
          {onReturn ? (
            <button
              type="button"
              className={styles.gatewayReturn}
              onClick={onReturn}
              aria-label="Return to Orb Home"
            >
              ⌄
            </button>
          ) : null}
          <div className={styles.gatewayEyebrow}>Drop Pad · Upper Layer</div>
          <h2 className={styles.gatewayTitle}>Activity Channel</h2>
          <div className={styles.gatewayHint}>Swipe down to return to Orb Home</div>
        </div>
      ) : null}
    </div>
  );
}
