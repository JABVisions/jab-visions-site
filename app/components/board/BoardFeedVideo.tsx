"use client";

import BoardPlayableVideo from "./BoardPlayableVideo";

/**
 * Feed/profile video that does not keep a decoder hot offscreen.
 * Mobile Safari will otherwise buffer every <video> in an 80-card feed.
 */
export default function BoardFeedVideo({
  src,
  poster,
  className,
  autoPlay,
  onError,
}: {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  onError?: () => void;
}) {
  return (
    <BoardPlayableVideo
      src={src}
      poster={poster}
      className={className}
      autoPlay={autoPlay}
      offscreenPause={!autoPlay}
      preload={poster ? "none" : "metadata"}
      onError={onError}
    />
  );
}
