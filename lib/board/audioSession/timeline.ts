import type { AudioSession, SessionTrack, TrackClip } from "./types";

export function resolveTrimOutMs(clip: TrackClip): number {
  const durationMs =
    clip.decoded
      ? clip.decoded.duration * 1000
      : clip.sourceDurationMs && clip.sourceDurationMs > 0
        ? clip.sourceDurationMs
        : 0;
  if (clip.trimOutMs > 0) {
    return durationMs > 0 ? Math.min(clip.trimOutMs, durationMs) : clip.trimOutMs;
  }
  return durationMs;
}

export function clipPlayableMs(clip: TrackClip): number {
  return Math.max(0, resolveTrimOutMs(clip) - Math.max(0, clip.trimInMs));
}

/** Where this clip starts on the mix timeline after latency compensation. */
export function clipMixStartMs(clip: TrackClip, latencyMs: number): number {
  return clip.offsetMs - latencyMs;
}

export function clipEndOnTimelineMs(clip: TrackClip, latencyMs: number): number {
  return clipMixStartMs(clip, latencyMs) + clipPlayableMs(clip);
}

export function trackEndMs(track: SessionTrack): number {
  return track.clips.reduce((end, clip) => Math.max(end, clipEndOnTimelineMs(clip, track.latencyMs)), 0);
}

export function sessionDurationMs(session: AudioSession): number {
  return session.tracks.reduce((end, track) => Math.max(end, trackEndMs(track)), 0);
}

export function audibleTracks(session: AudioSession): SessionTrack[] {
  const anySolo = session.tracks.some((track) => track.mix.solo);
  return session.tracks.filter((track) => {
    if (!track.clips.length || track.mix.muted) return false;
    if (anySolo && !track.mix.solo) return false;
    return true;
  });
}

export type ScheduledClip = {
  track: SessionTrack;
  clip: TrackClip;
  /** Seconds from mix t=0. Always >= 0. */
  whenSeconds: number;
  /** Seconds into the source buffer, including trim and a negative mix start. */
  bufferOffsetSeconds: number;
  durationSeconds: number;
};

/**
 * Maps a clip onto a render/play schedule. Negative mix starts (latency) eat
 * into the beginning of the source instead of scheduling before 0.
 */
export function scheduleClip(track: SessionTrack, clip: TrackClip): ScheduledClip | null {
  const playableMs = clipPlayableMs(clip);
  if (playableMs <= 0) return null;

  let whenSeconds = clipMixStartMs(clip, track.latencyMs) / 1000;
  let bufferOffsetSeconds = Math.max(0, clip.trimInMs) / 1000;
  let durationSeconds = playableMs / 1000;

  if (whenSeconds < 0) {
    const skip = -whenSeconds;
    bufferOffsetSeconds += skip;
    durationSeconds -= skip;
    whenSeconds = 0;
  }

  if (durationSeconds <= 0.0005) return null;

  return { track, clip, whenSeconds, bufferOffsetSeconds, durationSeconds };
}

export function scheduleSession(session: AudioSession): ScheduledClip[] {
  const out: ScheduledClip[] = [];
  for (const track of audibleTracks(session)) {
    for (const clip of track.clips) {
      const scheduled = scheduleClip(track, clip);
      if (scheduled) out.push(scheduled);
    }
  }
  return out;
}
