"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent, type Ref } from "react";
import {
  finishStuckVideo,
  videoErrorNeedsSrcRefresh,
} from "@/lib/board/playableVideo";

type Props = {
  src: string;
  poster?: string;
  className?: string;
  style?: CSSProperties;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: "none" | "metadata" | "auto";
  /** Pause and drop the decoder when the tape leaves the feed viewport. */
  offscreenPause?: boolean;
  onError?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoadedData?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLVideoElement>) => void;
  videoRef?: Ref<HTMLVideoElement | null>;
};

function assignRef(ref: Ref<HTMLVideoElement | null> | undefined, node: HTMLVideoElement | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as { current: HTMLVideoElement | null }).current = node;
}

/**
 * Shared Drop Studio / Board video. Safari often stalls a few hundred
 * milliseconds before `duration` and never fires `ended`; we finish the tape
 * instead of leaving a frozen frame.
 */
export default function BoardPlayableVideo({
  src,
  poster,
  className,
  style,
  controls = true,
  autoPlay,
  muted,
  loop,
  preload,
  offscreenPause = false,
  onError,
  onPlay,
  onPause,
  onEnded,
  onLoadedData,
  onPointerDown,
  videoRef,
}: Props) {
  const innerRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || !offscreenPause) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          if (el.paused && el.preload === "none") el.preload = "metadata";
          return;
        }
        if (!el.paused) el.pause();
        if (el.preload !== "none") el.preload = "none";
      },
      { rootMargin: "160px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, offscreenPause]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const unstick = () => {
      finishStuckVideo(el, { loop: Boolean(loop) });
    };

    const onPlaying = () => {
      if (el.preload !== "auto") el.preload = "auto";
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
    };

    const onWaiting = () => {
      unstick();
    };

    const onTimeUpdate = () => {
      if (el.paused) return;
      unstick();
    };

    el.addEventListener("playing", onPlaying);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("stalled", onWaiting);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("stalled", onWaiting);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [src, loop]);

  if (!src) return null;

  return (
    <video
      ref={(node) => {
        innerRef.current = node;
        if (node) {
          node.setAttribute("playsinline", "true");
          node.setAttribute("webkit-playsinline", "true");
        }
        assignRef(videoRef, node);
      }}
      className={className}
      style={style}
      src={src}
      poster={poster || undefined}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline
      preload={preload ?? (poster ? "metadata" : "auto")}
      onPlay={() => {
        const el = innerRef.current;
        if (el && el.preload !== "auto") el.preload = "auto";
        onPlay?.();
      }}
      onPause={onPause}
      onEnded={onEnded}
      onLoadedData={onLoadedData}
      onPointerDown={onPointerDown}
      onError={() => {
        const el = innerRef.current;
        if (el && finishStuckVideo(el, { loop: Boolean(loop) }) !== "noop") return;
        if (el && !videoErrorNeedsSrcRefresh(el)) return;
        onError?.();
      }}
    />
  );
}
