import type {
  AlterationParams,
  AudioSession,
  LaneKind,
  SessionTrack,
  StudioPresetKey,
  TrackClip,
  TrackMix,
} from "./types";
import { MAX_AUDIO_SESSION_LANES } from "./types";
import type { VoicePresetKey } from "@/lib/board/voicePresetAudio";

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

export function defaultAlteration(preset: StudioPresetKey = "clean"): AlterationParams {
  return {
    intensity: preset === "clean" || preset === "none" ? 0.35 : 0.75,
    pitch: 0.5,
    reverb: 0.5,
    echo: 0.5,
    distortion: 0.5,
    correction: 0.5,
  };
}

export function defaultTrackMix(kind: LaneKind): TrackMix {
  return {
    volume: kind === "vocal" ? 1.35 : kind === "instrumental" ? 0.75 : kind === "adlib" ? 1.1 : 1,
    pan: 0,
    muted: false,
    solo: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    preset: kind === "vocal" ? "clean" : "none",
    alteration: kind === "vocal" ? defaultAlteration("clean") : undefined,
  };
}

export function createAudioSession(sampleRate = 48_000): AudioSession {
  return {
    id: id("session"),
    sampleRate,
    tracks: [],
    playheadMs: 0,
  };
}

export function createClipFromFile(
  file: File,
  offsetMs = 0,
  extra: Partial<Pick<TrackClip, "name" | "sourceDurationMs" | "volume" | "fadeInMs" | "fadeOutMs">> = {}
): TrackClip {
  return {
    id: id("clip"),
    file,
    name: extra.name,
    offsetMs,
    trimInMs: 0,
    trimOutMs: 0,
    sourceDurationMs: extra.sourceDurationMs,
    volume: extra.volume,
    fadeInMs: extra.fadeInMs,
    fadeOutMs: extra.fadeOutMs,
  };
}

export function labelForLane(kind: LaneKind): string {
  if (kind === "vocal") return "Vocals";
  if (kind === "instrumental") return "Instrumental";
  if (kind === "fx") return "Effects";
  if (kind === "adlib") return "Ad-Lib";
  return "Audio";
}

export function createTrackFromFile(
  kind: LaneKind,
  file: File,
  mix: Partial<TrackMix> = {},
  clipExtra: Parameters<typeof createClipFromFile>[2] = {}
): SessionTrack {
  return {
    id: id("track"),
    kind,
    label: clipExtra?.name || labelForLane(kind),
    clips: [createClipFromFile(file, 0, clipExtra)],
    mix: { ...defaultTrackMix(kind), ...mix },
    latencyMs: 0,
  };
}

export function addTrack(session: AudioSession, track: SessionTrack): AudioSession {
  if (session.tracks.length >= MAX_AUDIO_SESSION_LANES) {
    throw new Error(`Studio sessions cap at ${MAX_AUDIO_SESSION_LANES} lanes.`);
  }
  return { ...session, tracks: [...session.tracks, track] };
}

export function replaceTrack(session: AudioSession, trackId: string, next: SessionTrack): AudioSession {
  return {
    ...session,
    tracks: session.tracks.map((track) => (track.id === trackId ? next : track)),
  };
}

export function upsertLaneFromFile(
  session: AudioSession,
  kind: LaneKind,
  file: File,
  extra: { offsetMs?: number; latencyMs?: number; mix?: Partial<TrackMix>; name?: string } = {}
): AudioSession {
  const nextTrack: SessionTrack = {
    ...createTrackFromFile(kind, file, extra.mix, { name: extra.name }),
    latencyMs: extra.latencyMs ?? 0,
    clips: [createClipFromFile(file, extra.offsetMs ?? 0, { name: extra.name })],
  };
  // Ad-libs always add a new lane so they never overwrite vocals.
  if (kind === "adlib" || kind === "fx") {
    return addTrack(session, nextTrack);
  }
  const existing = session.tracks.find((track) => track.kind === kind);
  if (existing) {
    return replaceTrack(session, existing.id, { ...nextTrack, id: existing.id });
  }
  return addTrack(session, nextTrack);
}

export function updateTrackMix(
  session: AudioSession,
  trackId: string,
  mix: Partial<SessionTrack["mix"]>
): AudioSession {
  return {
    ...session,
    tracks: session.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            mix: {
              ...track.mix,
              ...mix,
              alteration:
                mix.alteration !== undefined
                  ? { ...defaultAlteration(mix.preset ?? track.mix.preset), ...track.mix.alteration, ...mix.alteration }
                  : track.mix.alteration,
            },
          }
        : track
    ),
  };
}

export function updateClip(
  session: AudioSession,
  trackId: string,
  clipId: string,
  patch: Partial<TrackClip>
): AudioSession {
  return {
    ...session,
    tracks: session.tracks.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
      };
    }),
  };
}

export function removeClip(session: AudioSession, trackId: string, clipId: string): AudioSession {
  return {
    ...session,
    tracks: session.tracks
      .map((track) => {
        if (track.id !== trackId) return track;
        return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      })
      .filter((track) => track.kind === "vocal" || track.kind === "instrumental" || track.clips.length > 0),
  };
}

export function duplicateClip(session: AudioSession, trackId: string, clipId: string): AudioSession {
  const track = session.tracks.find((item) => item.id === trackId);
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) return session;
  const copy: TrackClip = {
    ...clip,
    id: id("clip"),
    name: clip.name ? `${clip.name} copy` : undefined,
    offsetMs: clip.offsetMs + 120,
    decoded: clip.decoded,
  };
  return replaceTrack(session, trackId, { ...track, clips: [...track.clips, copy] });
}

export function splitClipAtPlayhead(
  session: AudioSession,
  trackId: string,
  clipId: string,
  playheadMs: number
): AudioSession {
  const track = session.tracks.find((item) => item.id === trackId);
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) return session;

  const start = clip.offsetMs;
  const trimOut =
    clip.trimOutMs > 0
      ? clip.trimOutMs
      : clip.sourceDurationMs && clip.sourceDurationMs > 0
        ? clip.sourceDurationMs
        : clip.decoded
          ? clip.decoded.duration * 1000
          : clip.trimInMs + 1;
  const end = start + Math.max(0, trimOut - clip.trimInMs);
  if (playheadMs <= start + 40 || playheadMs >= end - 40) return session;

  const localSplit = clip.trimInMs + (playheadMs - start);
  const left: TrackClip = {
    ...clip,
    trimOutMs: localSplit,
  };
  const right: TrackClip = {
    ...clip,
    id: id("clip"),
    offsetMs: playheadMs,
    trimInMs: localSplit,
    trimOutMs: clip.trimOutMs,
    name: clip.name ? `${clip.name} B` : undefined,
  };
  return replaceTrack(session, trackId, {
    ...track,
    clips: track.clips.flatMap((item) => (item.id === clipId ? [left, right] : [item])),
  });
}

export function restoreClipOriginal(session: AudioSession, trackId: string, clipId: string): AudioSession {
  return updateClip(session, trackId, clipId, {
    trimInMs: 0,
    trimOutMs: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    volume: 1,
  });
}

export function reorderAdlibTracks(session: AudioSession, fromId: string, toId: string): AudioSession {
  const fromIndex = session.tracks.findIndex((track) => track.id === fromId);
  const toIndex = session.tracks.findIndex((track) => track.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return session;
  const tracks = [...session.tracks];
  const [moved] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, moved);
  return { ...session, tracks };
}

/** Shift an ad-lib lane earlier (-1) or later (+1) among ad-lib/fx tracks. */
export function moveAdlibTrack(
  session: AudioSession,
  trackId: string,
  direction: -1 | 1
): AudioSession {
  const adlibs = session.tracks.filter((track) => track.kind === "adlib" || track.kind === "fx");
  const index = adlibs.findIndex((track) => track.id === trackId);
  const neighbor = adlibs[index + direction];
  if (index < 0 || !neighbor) return session;
  return reorderAdlibTracks(session, trackId, neighbor.id);
}

export function duplicateAdlibTrack(session: AudioSession, trackId: string): AudioSession {
  const track = session.tracks.find((item) => item.id === trackId);
  if (!track || (track.kind !== "adlib" && track.kind !== "fx")) return session;
  const copy: SessionTrack = {
    ...track,
    id: id("track"),
    label: `${track.label || "Ad-Lib"} copy`,
    mix: { ...track.mix, alteration: track.mix.alteration ? { ...track.mix.alteration } : undefined },
    clips: track.clips.map((clip) => ({
      ...clip,
      id: id("clip"),
      offsetMs: clip.offsetMs + 120,
      name: clip.name ? `${clip.name} copy` : undefined,
    })),
  };
  return addTrack(session, copy);
}

export function renameTrack(session: AudioSession, trackId: string, label: string): AudioSession {
  return {
    ...session,
    tracks: session.tracks.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        label,
        clips: track.clips.map((clip, index) => (index === 0 ? { ...clip, name: label } : clip)),
      };
    }),
  };
}

export function sessionHasLane(session: AudioSession, kind: LaneKind) {
  return session.tracks.some((track) => track.kind === kind && track.clips.length > 0);
}

export function removeLane(session: AudioSession, kind: LaneKind): AudioSession {
  return {
    ...session,
    tracks: session.tracks.filter((track) => track.kind !== kind),
  };
}

export function removeTrackById(session: AudioSession, trackId: string): AudioSession {
  return {
    ...session,
    tracks: session.tracks.filter((track) => track.id !== trackId),
  };
}

export function sessionFromVocalAndInstrumental(
  vocal: File,
  instrumental: File,
  vocalPreset: StudioPresetKey = "clean"
): AudioSession {
  return addTrack(
    addTrack(createAudioSession(), createTrackFromFile("vocal", vocal, { preset: vocalPreset })),
    createTrackFromFile("instrumental", instrumental)
  );
}

const VOICE_PRESET_KEYS: VoicePresetKey[] = [
  "clean",
  "warm",
  "radio",
  "concert",
  "dream",
  "deep",
  "high",
  "robot",
  "distorted",
  "chorus",
  "echo",
  "reverb",
  "pitch",
];

export function isStudioPreset(value: string): value is StudioPresetKey {
  return value === "none" || (VOICE_PRESET_KEYS as string[]).includes(value);
}
