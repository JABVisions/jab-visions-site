import type { AudioSession, SessionEditSnapshot, SessionTrack, TrackClip } from "./types";

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Strip AudioBuffers for undo snapshots / draft metadata. */
export function snapshotSession(session: AudioSession): SessionEditSnapshot {
  return {
    playheadMs: session.playheadMs,
    loop: session.loop,
    tracks: session.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      label: track.label,
      latencyMs: track.latencyMs,
      mix: { ...track.mix, alteration: track.mix.alteration ? { ...track.mix.alteration } : undefined },
      clips: track.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        fileKey: fileKey(clip.file),
        offsetMs: clip.offsetMs,
        trimInMs: clip.trimInMs,
        trimOutMs: clip.trimOutMs,
        sourceDurationMs: clip.sourceDurationMs,
        volume: clip.volume,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
      })),
    })),
  };
}

export function applySessionSnapshot(
  session: AudioSession,
  snapshot: SessionEditSnapshot
): AudioSession {
  const fileByKey = new Map<string, { file: File; decoded?: AudioBuffer }>();
  for (const track of session.tracks) {
    for (const clip of track.clips) {
      fileByKey.set(fileKey(clip.file), { file: clip.file, decoded: clip.decoded });
    }
  }

  const tracks: SessionTrack[] = snapshot.tracks.map((trackSnap) => {
    const clips: TrackClip[] = [];
    for (const clipSnap of trackSnap.clips) {
      const media = fileByKey.get(clipSnap.fileKey);
      if (!media) continue;
      clips.push({
        id: clipSnap.id,
        name: clipSnap.name,
        file: media.file,
        decoded: media.decoded,
        offsetMs: clipSnap.offsetMs,
        trimInMs: clipSnap.trimInMs,
        trimOutMs: clipSnap.trimOutMs,
        sourceDurationMs: clipSnap.sourceDurationMs,
        volume: clipSnap.volume,
        fadeInMs: clipSnap.fadeInMs,
        fadeOutMs: clipSnap.fadeOutMs,
      });
    }

    return {
      id: trackSnap.id,
      kind: trackSnap.kind,
      label: trackSnap.label,
      latencyMs: trackSnap.latencyMs,
      mix: trackSnap.mix,
      clips,
    };
  });

  return {
    ...session,
    playheadMs: snapshot.playheadMs,
    loop: snapshot.loop,
    tracks,
  };
}

export type SessionHistory = {
  past: SessionEditSnapshot[];
  future: SessionEditSnapshot[];
};

export function createSessionHistory(): SessionHistory {
  return { past: [], future: [] };
}

export function pushHistory(history: SessionHistory, session: AudioSession, limit = 40): SessionHistory {
  return {
    past: [...history.past, snapshotSession(session)].slice(-limit),
    future: [],
  };
}

export function undoHistory(
  history: SessionHistory,
  session: AudioSession
): { history: SessionHistory; session: AudioSession } | null {
  if (!history.past.length) return null;
  const past = [...history.past];
  const snapshot = past.pop()!;
  return {
    history: {
      past,
      future: [snapshotSession(session), ...history.future].slice(0, 40),
    },
    session: applySessionSnapshot(session, snapshot),
  };
}

export function redoHistory(
  history: SessionHistory,
  session: AudioSession
): { history: SessionHistory; session: AudioSession } | null {
  if (!history.future.length) return null;
  const future = [...history.future];
  const snapshot = future.shift()!;
  return {
    history: {
      past: [...history.past, snapshotSession(session)].slice(-40),
      future,
    },
    session: applySessionSnapshot(session, snapshot),
  };
}
