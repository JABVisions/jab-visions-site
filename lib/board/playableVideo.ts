/** Playback helpers so Drop Studio and Board tapes finish instead of freezing
 *  a few hundred milliseconds before `duration` (Safari/MediaRecorder). */

export type VideoProgressLike = {
  currentTime: number;
  duration: number;
  readyState: number;
  paused?: boolean;
  buffered: { length: number; end: (index: number) => number };
  error?: { code: number } | null;
};

export const VIDEO_END_SLACK_SECONDS = 0.85;
export const VIDEO_HARD_END_SLACK_SECONDS = 0.28;

export function videoBufferedEnd(el: { buffered: { length: number; end: (index: number) => number } }) {
  if (!el.buffered.length) return 0;
  try {
    return el.buffered.end(el.buffered.length - 1);
  } catch {
    return 0;
  }
}

/** True when the decoder has run out of samples before the reported duration. */
export function videoLooksStuckBeforeEnd(
  el: VideoProgressLike,
  slackSeconds = VIDEO_END_SLACK_SECONDS
): boolean {
  const duration = el.duration;
  if (!Number.isFinite(duration) || duration <= 0.25) return false;
  if (el.currentTime < 0.2) return false;
  const remaining = duration - el.currentTime;
  if (remaining > slackSeconds) return false;
  const bufferedEnd = videoBufferedEnd(el);
  const outOfBuffer =
    el.buffered.length === 0 || el.currentTime >= bufferedEnd - 0.08;
  return remaining <= slackSeconds && (el.readyState < 3 || outOfBuffer);
}

/** Network/src errors that need a fresh URL. Decode stalls near the end do not. */
export function videoErrorNeedsSrcRefresh(el: VideoProgressLike): boolean {
  const code = el.error?.code ?? 0;
  if (!code) return false;
  if (videoLooksStuckBeforeEnd(el)) return false;
  if (el.currentTime > 0.4 && code === 3) return false;
  return code === 2 || code === 4;
}

export function finishStuckVideo(
  el: HTMLVideoElement | null | undefined,
  { loop = false }: { loop?: boolean } = {}
): "looped" | "ended" | "noop" {
  if (!el || typeof el.duration !== "number" || el.ended) return "noop";
  const slack =
    el.error || el.readyState < 2 ? VIDEO_END_SLACK_SECONDS : VIDEO_HARD_END_SLACK_SECONDS;
  if (!videoLooksStuckBeforeEnd(el, slack)) return "noop";
  if (loop) {
    try {
      el.currentTime = 0;
    } catch {
      // ignore
    }
    void el.play().catch(() => {});
    return "looped";
  }
  try {
    if (Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = el.duration;
    }
  } catch {
    // ignore
  }
  if (!el.paused) el.pause();
  el.dispatchEvent(new Event("ended"));
  return "ended";
}
