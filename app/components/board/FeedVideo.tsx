"use client";

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";

/**
 * Feed/collection video: autoplays muted once it scrolls into view, pauses when
 * it leaves, and re-mutes so it always re-enters silently. Tap the video (or the
 * "Tap for sound" pill) to unmute — only then do native controls appear. The
 * expanded viewer uses a plain <video> instead (deliberate open, sound on).
 */
export default function FeedVideo({
  src,
  className,
  preload = "metadata",
  style,
  onError,
  onLoadedMetadata,
}: {
  src: string;
  className?: string;
  preload?: "none" | "metadata" | "auto";
  style?: CSSProperties;
  onError?: () => void;
  onLoadedMetadata?: (e: SyntheticEvent<HTMLVideoElement>) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          setInView(true);
          void v.play().catch(() => {});
        } else {
          setInView(false);
          v.pause();
          // Re-mute on exit so the next scroll-in is silent again.
          v.muted = true;
          setMuted(true);
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const unmute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    void v.play().catch(() => {});
  };

  return (
    <>
      <video
        ref={ref}
        className={className}
        src={src}
        muted={muted}
        playsInline
        loop
        preload={preload}
        controls={!muted}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
        onClick={muted ? unmute : undefined}
        style={muted ? { cursor: "pointer", ...style } : style}
      />
      {muted && inView ? (
        <button
          type="button"
          aria-label="Tap for sound"
          onClick={unmute}
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            zIndex: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.35)",
            background: "rgba(0, 0, 0, 0.55)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <span aria-hidden>🔇</span> Tap for sound
        </button>
      ) : null}
    </>
  );
}
