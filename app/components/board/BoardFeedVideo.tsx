"use client";

import { useEffect, useRef } from "react";

/**
 * Feed/profile video that does not keep a decoder hot offscreen.
 * Mobile Safari will otherwise buffer every <video> in an 80-card feed.
 */
export default function BoardFeedVideo({
  src,
  poster,
  className,
  onError,
}: {
  src: string;
  poster?: string;
  className?: string;
  onError?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          if (el.preload !== "metadata") el.preload = "metadata";
          return;
        }
        if (!el.paused) el.pause();
        el.preload = "none";
      },
      { rootMargin: "160px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  if (!src) return null;

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster || undefined}
      controls
      playsInline
      preload={poster ? "none" : "metadata"}
      onError={onError}
    />
  );
}
