/**
 * Drop Studio V5 — incremental video timeline + flag.
 *
 * Runtime media (File / object URLs) lives in a media bag, never in JSON.
 * Publish still uses the V4 single-file path until a real flatten/export ships.
 */

export const DROP_STUDIO_V5_FLAG_KEY = "jab_drop_studio_v5";
export const DROP_STUDIO_V5_PROJECTS_KEY = "jab_drop_studio_v5_projects";
export const DROP_STUDIO_V5_UPDATED_EVENT = "board:drop-studio-v5:updated";

export const MAX_V5_VIDEO_CLIPS = 8;
export const MAX_V5_AUDIO_CLIPS = 8;
export const MAX_V5_TRACKS = 4;
export const MAX_V5_HISTORY = 24;

export type DropStudioV5Aspect = "portrait" | "landscape" | "square" | "story";
export type DropStudioV5TrackKind = "video" | "audio";
export type DropStudioV5MediaKind = "video" | "audio" | "image";

export const DROP_STUDIO_V5_ASPECTS: Record<
  DropStudioV5Aspect,
  { w: number; h: number; label: string; css: string }
> = {
  portrait: { w: 4, h: 5, label: "4:5", css: "4 / 5" },
  landscape: { w: 16, h: 9, label: "16:9", css: "16 / 9" },
  square: { w: 1, h: 1, label: "1:1", css: "1 / 1" },
  story: { w: 9, h: 16, label: "9:16", css: "9 / 16" },
};

export type DropStudioV5Crop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DropStudioV5Clip = {
  id: string;
  name?: string;
  /** Stable key into the runtime media bag. Never a File. */
  mediaKey: string;
  kind: DropStudioV5MediaKind;
  offsetMs: number;
  trimInMs: number;
  /** Exclusive end in the source. `0` means through sourceDurationMs. */
  trimOutMs: number;
  sourceDurationMs: number;
  volume: number;
  muted?: boolean;
  crop?: DropStudioV5Crop;
  filter?: string | null;
  overlay?: string | null;
  rotation?: 0 | 90 | 180 | 270;
};

export type DropStudioV5Track = {
  id: string;
  kind: DropStudioV5TrackKind;
  label: string;
  clips: DropStudioV5Clip[];
  muted?: boolean;
  volume: number;
};

export type DropStudioV5Session = {
  id: string;
  version: 5;
  aspect: DropStudioV5Aspect;
  playheadMs: number;
  tracks: DropStudioV5Track[];
};

export type DropStudioV5MediaBag = Record<
  string,
  { url: string; kind: DropStudioV5MediaKind; objectUrl?: boolean }
>;

export type DropStudioV5History = {
  past: DropStudioV5Session[];
  future: DropStudioV5Session[];
};

export type DropStudioV5ClipDraft = {
  mediaKey: string;
  name?: string;
  kind: DropStudioV5MediaKind;
  sourceDurationMs?: number;
  volume?: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function mediaKeyFromFile(file: { name: string; size: number; lastModified: number }) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function defaultV5Crop(): DropStudioV5Crop {
  return { x: 0, y: 0, w: 1, h: 1 };
}

export function normalizeV5Crop(input: unknown): DropStudioV5Crop | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const x = clamp(Number(source.x), 0, 0.9);
  const y = clamp(Number(source.y), 0, 0.9);
  const w = clamp(Number(source.w), 0.1, 1 - x);
  const h = clamp(Number(source.h), 0.1, 1 - y);
  if (x === 0 && y === 0 && w === 1 && h === 1) return undefined;
  return { x, y, w, h };
}

export function insetV5Crop(amount: number): DropStudioV5Crop | undefined {
  const inset = clamp(amount, 0, 0.4);
  if (inset === 0) return undefined;
  return { x: inset, y: inset, w: 1 - inset * 2, h: 1 - inset * 2 };
}

function pct(value: number) {
  return Math.round(value * 10000) / 100;
}

export function cropToClipPath(crop?: DropStudioV5Crop | null): string | undefined {
  const next = normalizeV5Crop(crop);
  if (!next) return undefined;
  const top = pct(next.y);
  const left = pct(next.x);
  const right = pct(1 - next.x - next.w);
  const bottom = pct(1 - next.y - next.h);
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

export function readDropStudioV5Flag(search = ""): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const studio = (params.get("studio") || "").trim().toLowerCase();
  if (studio === "v4") return false;
  if (studio === "v5") return true;
  if (canUseStorage()) {
    const stored = window.localStorage.getItem(DROP_STUDIO_V5_FLAG_KEY);
    if (stored === "0" || stored === "false") return false;
    if (stored === "1" || stored === "true") return true;
  }
  return true;
}

export function createDropStudioV5Session(id?: string): DropStudioV5Session {
  return {
    id: id || makeId("v5"),
    version: 5,
    aspect: "portrait",
    playheadMs: 0,
    tracks: [
      { id: "video-a", kind: "video", label: "Video", clips: [], volume: 1 },
      { id: "audio-a", kind: "audio", label: "Audio", clips: [], volume: 1 },
    ],
  };
}

export function createDropStudioV5History(): DropStudioV5History {
  return { past: [], future: [] };
}

export function cloneDropStudioV5Session(session: DropStudioV5Session): DropStudioV5Session {
  return JSON.parse(JSON.stringify(session)) as DropStudioV5Session;
}

function videoTrack(session: DropStudioV5Session) {
  return session.tracks.find((track) => track.kind === "video") ?? session.tracks[0];
}

function audioTrack(session: DropStudioV5Session) {
  return session.tracks.find((track) => track.kind === "audio");
}

export function resolveTrimOutMs(clip: DropStudioV5Clip): number {
  const duration = Math.max(0, clip.sourceDurationMs || 0);
  if (clip.trimOutMs > 0) {
    return duration > 0 ? Math.min(clip.trimOutMs, duration) : clip.trimOutMs;
  }
  return duration;
}

export function clipPlayableMs(clip: DropStudioV5Clip): number {
  return Math.max(0, resolveTrimOutMs(clip) - Math.max(0, clip.trimInMs));
}

export function clipEndMs(clip: DropStudioV5Clip): number {
  return clip.offsetMs + clipPlayableMs(clip);
}

export function trackEndMs(track: DropStudioV5Track): number {
  return track.clips.reduce((end, clip) => Math.max(end, clipEndMs(clip)), 0);
}

export function sessionDurationMs(session: DropStudioV5Session): number {
  return session.tracks.reduce((end, track) => Math.max(end, trackEndMs(track)), 0);
}

function makeClip(draft: DropStudioV5ClipDraft, offsetMs: number): DropStudioV5Clip {
  return {
    id: makeId("clip"),
    name: draft.name,
    mediaKey: draft.mediaKey,
    kind: draft.kind,
    offsetMs,
    trimInMs: 0,
    trimOutMs: 0,
    sourceDurationMs: Math.max(0, draft.sourceDurationMs ?? 0),
    volume: clamp(draft.volume ?? 1, 0, 1),
  };
}

function replaceTrack(session: DropStudioV5Session, nextTrack: DropStudioV5Track): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) => (track.id === nextTrack.id ? nextTrack : track)),
  };
}

export function packTrackClips(track: DropStudioV5Track): DropStudioV5Track {
  let offset = 0;
  const clips = track.clips.map((clip) => {
    const packed = { ...clip, offsetMs: offset };
    offset += clipPlayableMs(packed);
    return packed;
  });
  return { ...track, clips };
}

export function importVideoClip(
  session: DropStudioV5Session,
  draft: DropStudioV5ClipDraft
): DropStudioV5Session {
  const track = videoTrack(session);
  if (!track) return session;
  if (track.clips.length >= MAX_V5_VIDEO_CLIPS) return session;
  if (session.tracks.length > MAX_V5_TRACKS) return session;
  const clip = makeClip({ ...draft, kind: draft.kind === "audio" ? "video" : draft.kind }, trackEndMs(track));
  return replaceTrack(session, { ...track, clips: [...track.clips, clip] });
}

export function importAudioClip(
  session: DropStudioV5Session,
  draft: DropStudioV5ClipDraft
): DropStudioV5Session {
  const track = audioTrack(session);
  if (!track) return session;
  if (track.clips.length >= MAX_V5_AUDIO_CLIPS) return session;
  const clip = makeClip({ ...draft, kind: "audio" }, trackEndMs(track));
  return replaceTrack(session, { ...track, clips: [...track.clips, clip] });
}

export function setClipDuration(
  session: DropStudioV5Session,
  clipId: string,
  sourceDurationMs: number
): DropStudioV5Session {
  const duration = Math.max(0, sourceDurationMs);
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? { ...clip, sourceDurationMs: duration } : clip
      ),
    })),
  };
}

export function setMediaDuration(
  session: DropStudioV5Session,
  mediaKey: string,
  sourceDurationMs: number
): DropStudioV5Session {
  const duration = Math.max(0, sourceDurationMs);
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.mediaKey === mediaKey && clip.sourceDurationMs <= 0
          ? { ...clip, sourceDurationMs: duration }
          : clip
      ),
    })),
  };
}

export function trimClip(
  session: DropStudioV5Session,
  clipId: string,
  trimInMs: number,
  trimOutMs: number
): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const duration = Math.max(clip.sourceDurationMs, 1);
        const nextIn = clamp(trimInMs, 0, duration - 80);
        const rawOut = trimOutMs > 0 ? trimOutMs : duration;
        const nextOut = clamp(rawOut, nextIn + 80, duration);
        return {
          ...clip,
          trimInMs: nextIn,
          trimOutMs: nextOut >= duration ? 0 : nextOut,
        };
      }),
    })),
  };
}

function findClip(
  session: DropStudioV5Session,
  clipId: string
): { track: DropStudioV5Track; clip: DropStudioV5Clip; index: number } | null {
  for (const track of session.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}

export function splitClipAtPlayhead(session: DropStudioV5Session, clipId?: string): DropStudioV5Session {
  const playhead = Math.max(0, session.playheadMs);
  const target =
    (clipId ? findClip(session, clipId) : null) ??
    (() => {
      const track = videoTrack(session);
      if (!track) return null;
      const index = track.clips.findIndex(
        (clip) => playhead >= clip.offsetMs && playhead < clipEndMs(clip)
      );
      if (index < 0) return null;
      return { track, clip: track.clips[index], index };
    })();
  if (!target) return session;

  const local = playhead - target.clip.offsetMs + target.clip.trimInMs;
  const trimOut = resolveTrimOutMs(target.clip);
  if (local <= target.clip.trimInMs + 80 || local >= trimOut - 80) return session;

  const left: DropStudioV5Clip = {
    ...target.clip,
    trimOutMs: local,
  };
  const right: DropStudioV5Clip = {
    ...target.clip,
    id: makeId("clip"),
    name: target.clip.name ? `${target.clip.name} B` : undefined,
    offsetMs: playhead,
    trimInMs: local,
    trimOutMs: target.clip.trimOutMs,
  };
  const clips = [...target.track.clips];
  clips.splice(target.index, 1, left, right);
  return replaceTrack(session, { ...target.track, clips });
}

export function reorderClip(
  session: DropStudioV5Session,
  clipId: string,
  direction: -1 | 1
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found) return session;
  const nextIndex = found.index + direction;
  if (nextIndex < 0 || nextIndex >= found.track.clips.length) return session;
  const clips = [...found.track.clips];
  const [moved] = clips.splice(found.index, 1);
  clips.splice(nextIndex, 0, moved);
  return replaceTrack(session, packTrackClips({ ...found.track, clips }));
}

export function deleteClip(session: DropStudioV5Session, clipId: string): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found) return session;
  const clips = found.track.clips.filter((clip) => clip.id !== clipId);
  return replaceTrack(session, packTrackClips({ ...found.track, clips }));
}

export function setSessionAspect(
  session: DropStudioV5Session,
  aspect: DropStudioV5Aspect
): DropStudioV5Session {
  return { ...session, aspect: DROP_STUDIO_V5_ASPECTS[aspect] ? aspect : "portrait" };
}

export function setClipCrop(
  session: DropStudioV5Session,
  clipId: string,
  crop?: DropStudioV5Crop | null
): DropStudioV5Session {
  const nextCrop = normalizeV5Crop(crop);
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? { ...clip, crop: nextCrop } : clip
      ),
    })),
  };
}

export function setClipFilter(
  session: DropStudioV5Session,
  clipId: string,
  filter: string | null,
  overlay?: string | null
): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId
          ? {
              ...clip,
              filter,
              ...(overlay !== undefined ? { overlay } : {}),
            }
          : clip
      ),
    })),
  };
}

export function setTrackMute(
  session: DropStudioV5Session,
  trackId: string,
  muted: boolean
): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) =>
      track.id === trackId ? { ...track, muted } : track
    ),
  };
}

export function setClipVolume(
  session: DropStudioV5Session,
  clipId: string,
  volume: number
): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? { ...clip, volume: clamp(volume, 0, 1) } : clip
      ),
    })),
  };
}

export function setPlayhead(session: DropStudioV5Session, playheadMs: number): DropStudioV5Session {
  const duration = sessionDurationMs(session);
  return {
    ...session,
    playheadMs: clamp(playheadMs, 0, Math.max(duration, 0)),
  };
}

export function clipAtTime(
  track: DropStudioV5Track,
  timeMs: number
): DropStudioV5Clip | null {
  return (
    track.clips.find((clip) => timeMs >= clip.offsetMs && timeMs < clipEndMs(clip)) ?? null
  );
}

export function previewVideoAtPlayhead(session: DropStudioV5Session): {
  clip: DropStudioV5Clip;
  mediaTimeMs: number;
} | null {
  const track = videoTrack(session);
  if (!track || track.clips.length === 0) return null;
  const clip = clipAtTime(track, session.playheadMs) ?? track.clips[0];
  const mediaTimeMs = Math.max(
    clip.trimInMs,
    session.playheadMs - clip.offsetMs + clip.trimInMs
  );
  return { clip, mediaTimeMs };
}

export function previewAudioAtPlayhead(session: DropStudioV5Session): {
  clip: DropStudioV5Clip;
  mediaTimeMs: number;
} | null {
  const track = audioTrack(session);
  if (!track || track.muted || track.clips.length === 0) return null;
  const clip = clipAtTime(track, session.playheadMs);
  if (!clip || clip.muted) return null;
  const mediaTimeMs = Math.max(
    clip.trimInMs,
    session.playheadMs - clip.offsetMs + clip.trimInMs
  );
  return { clip, mediaTimeMs };
}

export function aspectToMediaFrame(
  aspect: DropStudioV5Aspect
): "portrait" | "landscape" {
  return aspect === "landscape" ? "landscape" : "portrait";
}

export function snapshotDropStudioV5(session: DropStudioV5Session): DropStudioV5Session {
  const cloned = cloneDropStudioV5Session(session);
  const serialized = JSON.stringify(cloned);
  if (serialized.includes('"file"') || serialized.toLowerCase().includes("[object file]")) {
    throw new Error("V5 snapshot must not contain File objects");
  }
  return cloned;
}

export function parseDropStudioV5Snapshot(raw: unknown): DropStudioV5Session | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (source.version !== 5 || typeof source.id !== "string") return null;
  const aspect =
    source.aspect === "landscape" || source.aspect === "square" || source.aspect === "story"
      ? source.aspect
      : "portrait";
  const tracks = Array.isArray(source.tracks)
    ? source.tracks
        .slice(0, MAX_V5_TRACKS)
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const track = entry as Record<string, unknown>;
          const kind: DropStudioV5TrackKind = track.kind === "audio" ? "audio" : "video";
          const clips: DropStudioV5Clip[] = [];
          if (Array.isArray(track.clips)) {
            for (const [clipIndex, clipEntry] of track.clips
              .slice(0, kind === "audio" ? MAX_V5_AUDIO_CLIPS : MAX_V5_VIDEO_CLIPS)
              .entries()) {
              if (!clipEntry || typeof clipEntry !== "object") continue;
              const clip = clipEntry as Record<string, unknown>;
              const mediaKey =
                typeof clip.mediaKey === "string" && clip.mediaKey.trim()
                  ? clip.mediaKey.trim()
                  : "";
              if (!mediaKey) continue;
              const parsedClip: DropStudioV5Clip = {
                id:
                  typeof clip.id === "string" && clip.id.trim()
                    ? clip.id.trim()
                    : `clip-${index}-${clipIndex}`,
                mediaKey,
                kind: clip.kind === "audio" || clip.kind === "image" ? clip.kind : "video",
                offsetMs: Math.max(0, Number(clip.offsetMs) || 0),
                trimInMs: Math.max(0, Number(clip.trimInMs) || 0),
                trimOutMs: Math.max(0, Number(clip.trimOutMs) || 0),
                sourceDurationMs: Math.max(0, Number(clip.sourceDurationMs) || 0),
                volume: clamp(Number(clip.volume ?? 1), 0, 1),
                muted: Boolean(clip.muted),
                crop: normalizeV5Crop(clip.crop),
                filter:
                  typeof clip.filter === "string" && clip.filter.trim()
                    ? clip.filter.trim().slice(0, 32)
                    : null,
                overlay:
                  typeof clip.overlay === "string" && clip.overlay.trim()
                    ? clip.overlay.trim().slice(0, 32)
                    : null,
              };
              if (typeof clip.name === "string" && clip.name.trim()) {
                parsedClip.name = clip.name.trim().slice(0, 48);
              }
              if (clip.rotation === 90 || clip.rotation === 180 || clip.rotation === 270) {
                parsedClip.rotation = clip.rotation;
              }
              clips.push(parsedClip);
            }
          }
          const parsedTrack: DropStudioV5Track = {
            id:
              typeof track.id === "string" && track.id.trim()
                ? track.id.trim()
                : `${kind}-${index}`,
            kind,
            label:
              typeof track.label === "string" && track.label.trim()
                ? track.label.trim().slice(0, 24)
                : kind === "audio"
                  ? "Audio"
                  : "Video",
            clips,
            muted: Boolean(track.muted),
            volume: clamp(Number(track.volume ?? 1), 0, 1),
          };
          return parsedTrack;
        })
        .filter((track): track is DropStudioV5Track => Boolean(track))
    : [];
  if (!tracks.length) return null;
  return {
    id: source.id,
    version: 5,
    aspect,
    playheadMs: Math.max(0, Number(source.playheadMs) || 0),
    tracks,
  };
}

export function pushV5History(
  history: DropStudioV5History,
  session: DropStudioV5Session
): DropStudioV5History {
  return {
    past: [...history.past, snapshotDropStudioV5(session)].slice(-MAX_V5_HISTORY),
    future: [],
  };
}

export function undoV5(
  history: DropStudioV5History,
  session: DropStudioV5Session
): { history: DropStudioV5History; session: DropStudioV5Session } {
  const previous = history.past[history.past.length - 1];
  if (!previous) return { history, session };
  return {
    session: cloneDropStudioV5Session(previous),
    history: {
      past: history.past.slice(0, -1),
      future: [snapshotDropStudioV5(session), ...history.future].slice(0, MAX_V5_HISTORY),
    },
  };
}

export function redoV5(
  history: DropStudioV5History,
  session: DropStudioV5Session
): { history: DropStudioV5History; session: DropStudioV5Session } {
  const next = history.future[0];
  if (!next) return { history, session };
  return {
    session: cloneDropStudioV5Session(next),
    history: {
      past: [...history.past, snapshotDropStudioV5(session)].slice(-MAX_V5_HISTORY),
      future: history.future.slice(1),
    },
  };
}

export function saveDropStudioV5Project(id: string, session: DropStudioV5Session): boolean {
  if (!canUseStorage() || !id) return false;
  try {
    const raw = window.localStorage.getItem(DROP_STUDIO_V5_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const map =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    map[id] = snapshotDropStudioV5(session);
    window.localStorage.setItem(DROP_STUDIO_V5_PROJECTS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(DROP_STUDIO_V5_UPDATED_EVENT, { detail: { id } }));
    return true;
  } catch {
    return false;
  }
}

export function loadDropStudioV5Project(id: string): DropStudioV5Session | null {
  if (!canUseStorage() || !id) return null;
  try {
    const raw = window.localStorage.getItem(DROP_STUDIO_V5_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return null;
    return parseDropStudioV5Snapshot((parsed as Record<string, unknown>)[id]);
  } catch {
    return null;
  }
}

export function removeDropStudioV5Project(id: string): void {
  if (!canUseStorage() || !id) return;
  try {
    const raw = window.localStorage.getItem(DROP_STUDIO_V5_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return;
    delete (parsed as Record<string, unknown>)[id];
    window.localStorage.setItem(DROP_STUDIO_V5_PROJECTS_KEY, JSON.stringify(parsed));
  } catch {
    // Quota / private mode — leave the in-memory session alone.
  }
}
