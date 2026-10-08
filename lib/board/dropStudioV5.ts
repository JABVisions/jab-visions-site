/**
 * Drop Studio V5 — incremental video timeline + flag.
 *
 * Runtime media (File / object URLs) lives in a media bag, never in JSON.
 * Publish still uses the V4 single-file path until a real flatten/export ships.
 */

import {
  normalizeGrade,
  V5_MOTIONS,
  type DropStudioV5Grade,
  type DropStudioV5Motion,
} from "@/lib/board/dropStudioV5Grade";

export const DROP_STUDIO_V5_FLAG_KEY = "jab_drop_studio_v5";
export const DROP_STUDIO_V5_PROJECTS_KEY = "jab_drop_studio_v5_projects";
export const DROP_STUDIO_V5_UPDATED_EVENT = "board:drop-studio-v5:updated";

export const MAX_V5_VIDEO_CLIPS = 8;
export const MAX_V5_AUDIO_CLIPS = 8;
export const MAX_V5_ART_CLIPS = 8;
export const MAX_V5_EFFECT_CLIPS = 8;
export const V5_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3] as const;
export const MAX_V5_TRACKS = 4;
export const MAX_V5_HISTORY = 24;

export type DropStudioV5Aspect = "portrait" | "landscape" | "square" | "story";
export type DropStudioV5TrackKind = "video" | "audio" | "art" | "effect";
export type DropStudioV5ArtAction =
  | "new"
  | "duplicate"
  | "hide"
  | "start-earlier"
  | "start-later"
  | "end-earlier"
  | "end-later"
  | "earlier"
  | "later"
  | "smaller"
  | "larger"
  | "nudge-left"
  | "nudge-right"
  | "nudge-up"
  | "nudge-down";
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
  /** Art overlays only. Hidden clips stay on the timeline and out of the preview. */
  hidden?: boolean;
  /** Art overlays only. Destination box in the frame. Missing means full frame. */
  placement?: DropStudioV5Crop;
  /** Playback rate. Timeline length is the source range divided by this. */
  speed?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  grade?: DropStudioV5Grade;
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
      { id: "art-a", kind: "art", label: "Art", clips: [], volume: 1 },
      { id: "fx-a", kind: "effect", label: "Effect", clips: [], volume: 1 },
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

function emptyArtTrack(): DropStudioV5Track {
  return { id: "art-a", kind: "art", label: "Art", clips: [], volume: 1 };
}

function emptyEffectTrack(): DropStudioV5Track {
  return { id: "fx-a", kind: "effect", label: "Effect", clips: [], volume: 1 };
}

function effectTrack(session: DropStudioV5Session) {
  return session.tracks.find((track) => track.kind === "effect");
}

export function ensureEffectTrack(session: DropStudioV5Session): DropStudioV5Session {
  if (session.tracks.some((track) => track.kind === "effect")) return session;
  if (session.tracks.length >= MAX_V5_TRACKS) return session;
  return { ...session, tracks: [...session.tracks, emptyEffectTrack()] };
}

export function ensureArtTrack(session: DropStudioV5Session): DropStudioV5Session {
  if (session.tracks.some((track) => track.kind === "art")) return session;
  if (session.tracks.length >= MAX_V5_TRACKS) return session;
  return { ...session, tracks: [...session.tracks, emptyArtTrack()] };
}

function artTrack(session: DropStudioV5Session) {
  return session.tracks.find((track) => track.kind === "art");
}

export function resolveTrimOutMs(clip: DropStudioV5Clip): number {
  const duration = Math.max(0, clip.sourceDurationMs || 0);
  if (clip.trimOutMs > 0) {
    return duration > 0 ? Math.min(clip.trimOutMs, duration) : clip.trimOutMs;
  }
  return duration;
}

export function clipSpeed(clip: DropStudioV5Clip): number {
  const speed = clip.speed ?? 1;
  return (V5_SPEEDS as readonly number[]).includes(speed) ? speed : 1;
}

export function clipPlayableMs(clip: DropStudioV5Clip): number {
  const source = Math.max(0, resolveTrimOutMs(clip) - Math.max(0, clip.trimInMs));
  const speed = clipSpeed(clip);
  return speed === 1 ? source : source / speed;
}

export function fadeGainAt(clip: DropStudioV5Clip, timelineMs: number): number {
  const start = clip.offsetMs;
  const end = clipEndMs(clip);
  const duration = Math.max(1, end - start);
  const local = timelineMs - start;
  let gain = Math.min(1, Math.max(0, clip.volume ?? 1));
  const fadeIn = Math.max(0, clip.fadeInMs ?? 0);
  const fadeOut = Math.max(0, clip.fadeOutMs ?? 0);
  if (fadeIn > 0 && local < fadeIn) gain *= Math.max(0, local) / fadeIn;
  if (fadeOut > 0 && duration - local < fadeOut) gain *= Math.max(0, duration - local) / fadeOut;
  return Math.min(1, Math.max(0, gain));
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
  const keepTime = found.track.kind === "art" || found.track.kind === "effect";
  const nextTrack = keepTime ? { ...found.track, clips } : packTrackClips({ ...found.track, clips });
  return replaceTrack(session, nextTrack);
}

export function deleteClip(session: DropStudioV5Session, clipId: string): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found) return session;
  const clips = found.track.clips.filter((clip) => clip.id !== clipId);
  const keepTime = found.track.kind === "art" || found.track.kind === "effect";
  const nextTrack = keepTime ? { ...found.track, clips } : packTrackClips({ ...found.track, clips });
  return replaceTrack(session, nextTrack);
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

export function artClipsAtTime(session: DropStudioV5Session, timeMs: number): DropStudioV5Clip[] {
  const track = artTrack(session);
  if (!track || track.muted) return [];
  return track.clips.filter(
    (clip) => !clip.hidden && timeMs >= clip.offsetMs && timeMs < clipEndMs(clip)
  );
}

/**
 * Attach a drawing to the art track. A stroke inside an existing overlay updates
 * that clip's image key. A stroke in empty time creates a clip from the playhead
 * through the end of the video. The source video file is not modified.
 */
export function bindArtOverlay(
  session: DropStudioV5Session,
  mediaKey: string,
  preferredClipId?: string | null,
  forceNew = false
): { session: DropStudioV5Session; clipId: string; mediaKey: string; created: boolean } {
  const next = ensureArtTrack(session);
  const track = artTrack(next);
  if (!track || !mediaKey) {
    return { session: next, clipId: "", mediaKey, created: false };
  }
  const playhead = Math.max(0, next.playheadMs);
  const covers = (clip: DropStudioV5Clip) => playhead >= clip.offsetMs && playhead < clipEndMs(clip);
  const preferred = preferredClipId
    ? track.clips.find((clip) => clip.id === preferredClipId)
    : undefined;
  const target = forceNew
    ? undefined
    : preferred && covers(preferred)
      ? preferred
      : [...track.clips].reverse().find((clip) => covers(clip));
  if (target) {
    return { session: next, clipId: target.id, mediaKey: target.mediaKey, created: false };
  }
  if (track.clips.length >= MAX_V5_ART_CLIPS) {
    const last = track.clips[track.clips.length - 1];
    return { session: next, clipId: last?.id || "", mediaKey: last?.mediaKey || mediaKey, created: false };
  }
  const videoEnd = trackEndMs(videoTrack(next) ?? { id: "video", kind: "video", label: "Video", clips: [], volume: 1 });
  const duration = videoEnd > playhead + 200 ? videoEnd - playhead : 60_000;
  const clip: DropStudioV5Clip = {
    id: makeId("art"),
    name: `Art ${track.clips.length + 1}`,
    mediaKey,
    kind: "image",
    offsetMs: playhead,
    trimInMs: 0,
    trimOutMs: 0,
    sourceDurationMs: duration,
    volume: 1,
  };
  return {
    session: replaceTrack(next, { ...track, clips: [...track.clips, clip] }),
    clipId: clip.id,
    mediaKey,
    created: true,
  };
}

export function setArtClipBounds(
  session: DropStudioV5Session,
  clipId: string,
  offsetMs: number,
  endMs: number
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind !== "art") return session;
  const start = Math.max(0, offsetMs);
  const end = Math.max(start + 200, endMs);
  const clips = found.track.clips.map((clip) =>
    clip.id === clipId
      ? { ...clip, offsetMs: start, trimInMs: 0, trimOutMs: 0, sourceDurationMs: end - start }
      : clip
  );
  return replaceTrack(session, { ...found.track, clips });
}

export function duplicateArtClip(session: DropStudioV5Session, clipId: string): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind !== "art") return session;
  if (found.track.clips.length >= MAX_V5_ART_CLIPS) return session;
  const copy: DropStudioV5Clip = {
    ...found.clip,
    id: makeId("art"),
    name: found.clip.name ? `${found.clip.name} copy` : "Art copy",
  };
  const clips = [...found.track.clips];
  clips.splice(found.index + 1, 0, copy);
  return replaceTrack(session, { ...found.track, clips });
}

export function duplicateClip(session: DropStudioV5Session, clipId: string): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found) return session;
  if (found.track.kind === "art") return duplicateArtClip(session, clipId);
  const cap = found.track.kind === "audio" ? MAX_V5_AUDIO_CLIPS : MAX_V5_VIDEO_CLIPS;
  if (found.track.kind === "effect" || found.track.clips.length >= cap) return session;
  const copy: DropStudioV5Clip = {
    ...found.clip,
    id: makeId("clip"),
    name: found.clip.name ? `${found.clip.name} copy` : "Copy",
    offsetMs: clipEndMs(found.clip),
  };
  const clips = [...found.track.clips];
  clips.splice(found.index + 1, 0, copy);
  if (found.track.kind === "video") return replaceTrack(session, packTrackClips({ ...found.track, clips }));
  return replaceTrack(session, { ...found.track, clips });
}

export function setClipSpeed(
  session: DropStudioV5Session,
  clipId: string,
  speed: number
): DropStudioV5Session {
  if (!(V5_SPEEDS as readonly number[]).includes(speed)) return session;
  const found = findClip(session, clipId);
  if (!found || found.track.kind === "art" || found.track.kind === "effect") return session;
  const clips = found.track.clips.map((clip) => (clip.id === clipId ? { ...clip, speed } : clip));
  const nextTrack =
    found.track.kind === "video"
      ? packTrackClips({ ...found.track, clips })
      : { ...found.track, clips };
  return replaceTrack(session, nextTrack);
}

export function setClipFade(
  session: DropStudioV5Session,
  clipId: string,
  fadeInMs: number,
  fadeOutMs: number
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || (found.track.kind !== "audio" && found.track.kind !== "video")) return session;
  const clips = found.track.clips.map((clip) =>
    clip.id === clipId
      ? {
          ...clip,
          fadeInMs: clamp(fadeInMs, 0, 4000),
          fadeOutMs: clamp(fadeOutMs, 0, 4000),
        }
      : clip
  );
  return replaceTrack(session, { ...found.track, clips });
}

export function setClipGrade(
  session: DropStudioV5Session,
  clipId: string,
  grade?: DropStudioV5Grade | null
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind === "art" || found.track.kind === "effect") return session;
  const next = normalizeGrade(grade);
  const clips = found.track.clips.map((clip) =>
    clip.id === clipId ? { ...clip, grade: next } : clip
  );
  return replaceTrack(session, { ...found.track, clips });
}

export function addEffectClip(
  session: DropStudioV5Session,
  motion: DropStudioV5Motion,
  offsetMs: number,
  durationMs = 2000
): DropStudioV5Session {
  if (!V5_MOTIONS.includes(motion)) return session;
  const next = ensureEffectTrack(session);
  const track = effectTrack(next);
  if (!track || track.clips.length >= MAX_V5_EFFECT_CLIPS) return next;
  const clip: DropStudioV5Clip = {
    id: makeId("fx"),
    name: motion,
    mediaKey: `fx:${motion}`,
    kind: "image",
    offsetMs: Math.max(0, offsetMs),
    trimInMs: 0,
    trimOutMs: 0,
    sourceDurationMs: Math.max(240, durationMs),
    volume: 1,
  };
  return replaceTrack(next, { ...track, clips: [...track.clips, clip] });
}

export function effectMotion(clip: DropStudioV5Clip): DropStudioV5Motion | null {
  if (!clip.mediaKey.startsWith("fx:")) return null;
  const name = clip.mediaKey.slice(3);
  return V5_MOTIONS.includes(name as DropStudioV5Motion) ? (name as DropStudioV5Motion) : null;
}

export function effectsAtTime(session: DropStudioV5Session, timeMs: number): DropStudioV5Clip[] {
  const track = effectTrack(session);
  if (!track) return [];
  return track.clips.filter(
    (clip) => !clip.hidden && effectMotion(clip) && timeMs >= clip.offsetMs && timeMs < clipEndMs(clip)
  );
}

export function setClipHidden(
  session: DropStudioV5Session,
  clipId: string,
  hidden: boolean
): DropStudioV5Session {
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, hidden } : clip)),
    })),
  };
}

export function setArtPlacement(
  session: DropStudioV5Session,
  clipId: string,
  placement?: DropStudioV5Crop | null
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind !== "art") return session;
  const nextPlacement = normalizeV5Crop(placement);
  const clips = found.track.clips.map((clip) =>
    clip.id === clipId ? { ...clip, placement: nextPlacement } : clip
  );
  return replaceTrack(session, { ...found.track, clips });
}

export function scaleArtPlacement(
  session: DropStudioV5Session,
  clipId: string,
  factor: number
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind !== "art") return session;
  const current = found.clip.placement ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = clamp(current.w * factor, 0.2, 1);
  const h = clamp(current.h * factor, 0.2, 1);
  const x = clamp(current.x + (current.w - w) / 2, 0, 1 - w);
  const y = clamp(current.y + (current.h - h) / 2, 0, 1 - h);
  return setArtPlacement(session, clipId, { x, y, w, h });
}

export function nudgeArtPlacement(
  session: DropStudioV5Session,
  clipId: string,
  dx: number,
  dy: number
): DropStudioV5Session {
  const found = findClip(session, clipId);
  if (!found || found.track.kind !== "art") return session;
  const current = found.clip.placement ?? { x: 0, y: 0, w: 1, h: 1 };
  const x = clamp(current.x + dx, 0, 1 - current.w);
  const y = clamp(current.y + dy, 0, 1 - current.h);
  return setArtPlacement(session, clipId, { x, y, w: current.w, h: current.h });
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
  ended: boolean;
} | null {
  const track = videoTrack(session);
  if (!track || track.clips.length === 0) return null;
  const active = clipAtTime(track, session.playheadMs);
  if (active) {
    const mediaTimeMs = Math.max(
      active.trimInMs,
      session.playheadMs - active.offsetMs + active.trimInMs
    );
    return { clip: active, mediaTimeMs, ended: false };
  }
  const ordered = [...track.clips].sort((a, b) => a.offsetMs - b.offsetMs);
  const last = ordered[ordered.length - 1];
  if (session.playheadMs >= clipEndMs(last) - 1) {
    return { clip: last, mediaTimeMs: resolveTrimOutMs(last), ended: true };
  }
  const upcoming = ordered.find((clip) => clip.offsetMs >= session.playheadMs);
  if (upcoming) {
    return { clip: upcoming, mediaTimeMs: upcoming.trimInMs, ended: false };
  }
  return { clip: ordered[0], mediaTimeMs: ordered[0].trimInMs, ended: false };
}

/** Timeline position where the single decoder should load the next clip. */
export function handoffPlayheadMs(clip: DropStudioV5Clip, mediaMs: number): number | null {
  const trimOut = resolveTrimOutMs(clip);
  if (trimOut <= 0 || mediaMs < trimOut - 40) return null;
  return clipEndMs(clip);
}

export function monitorAspectRatio(aspect: DropStudioV5Aspect): number {
  const spec = DROP_STUDIO_V5_ASPECTS[aspect] ?? DROP_STUDIO_V5_ASPECTS.portrait;
  return spec.w / spec.h;
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
          const kind: DropStudioV5TrackKind =
            track.kind === "audio"
              ? "audio"
              : track.kind === "art"
                ? "art"
                : track.kind === "effect"
                  ? "effect"
                  : "video";
          const clipCap =
            kind === "audio"
              ? MAX_V5_AUDIO_CLIPS
              : kind === "art"
                ? MAX_V5_ART_CLIPS
                : kind === "effect"
                  ? MAX_V5_EFFECT_CLIPS
                  : MAX_V5_VIDEO_CLIPS;
          const clips: DropStudioV5Clip[] = [];
          if (Array.isArray(track.clips)) {
            for (const [clipIndex, clipEntry] of track.clips.slice(0, clipCap).entries()) {
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
              if (clip.hidden) parsedClip.hidden = true;
              const placement = normalizeV5Crop(clip.placement);
              if (placement) parsedClip.placement = placement;
              if ((V5_SPEEDS as readonly number[]).includes(Number(clip.speed))) {
                parsedClip.speed = Number(clip.speed);
              }
              const fadeIn = Math.max(0, Number(clip.fadeInMs) || 0);
              const fadeOut = Math.max(0, Number(clip.fadeOutMs) || 0);
              if (fadeIn > 0) parsedClip.fadeInMs = Math.min(4000, fadeIn);
              if (fadeOut > 0) parsedClip.fadeOutMs = Math.min(4000, fadeOut);
              const grade = normalizeGrade(clip.grade);
              if (grade) parsedClip.grade = grade;
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
                  : kind === "art"
                    ? "Art"
                    : kind === "effect"
                      ? "Effect"
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
  if (!tracks.some((track) => track.kind === "art") && tracks.length < MAX_V5_TRACKS) {
    tracks.push(emptyArtTrack());
  }
  if (!tracks.some((track) => track.kind === "effect") && tracks.length < MAX_V5_TRACKS) {
    tracks.push(emptyEffectTrack());
  }
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
