import type { VoicePresetKey } from "@/lib/board/voicePresetAudio";

/** Vocal + beat + several ad-lib lanes. */
export const MAX_AUDIO_SESSION_LANES = 8;

export type LaneKind = "vocal" | "instrumental" | "audio" | "fx" | "adlib";

/** v1 Voice presets plus Studio alteration keys. */
export type StudioPresetKey = VoicePresetKey | "none";

export type AlterationParams = {
  /** 0–1 blend from dry toward the full preset. */
  intensity: number;
  pitch?: number;
  reverb?: number;
  echo?: number;
  distortion?: number;
  correction?: number;
};

export type TrackClip = {
  id: string;
  /** Display name for ad-libs / renamed clips. */
  name?: string;
  /** Original media. Never overwritten by mixdown or trim. */
  file: File;
  decoded?: AudioBuffer;
  /** Full source length in ms (for restore-original). */
  sourceDurationMs?: number;
  /** Clip start on the session timeline. */
  offsetMs: number;
  trimInMs: number;
  /** Exclusive end in the source file. `0` means “through the end of the buffer”. */
  trimOutMs: number;
  /** Per-clip gain (defaults to 1). Track mix.volume still applies. */
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};

export type TrackMix = {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  preset: StudioPresetKey;
  /** Non-destructive alteration knobs (vocal lane). */
  alteration?: AlterationParams;
};

export type SessionTrack = {
  id: string;
  kind: LaneKind;
  label: string;
  clips: TrackClip[];
  mix: TrackMix;
  /** Shift recorded clips earlier to cancel input latency. Imported files stay 0. */
  latencyMs: number;
};

export type AudioSession = {
  id: string;
  sampleRate: number;
  tracks: SessionTrack[];
  playheadMs: number;
  loop?: { inMs: number; outMs: number };
  /** Wall-clock duration of the last armed record (ms). */
  recordElapsedMs?: number;
};

export type AudioDropExtras = {
  coverUrl?: string;
  lyrics?: string;
  credits?: string;
  description?: string;
  sessionTrackCount?: number;
};

/** Serializable edit snapshot (no AudioBuffers). */
export type SessionEditSnapshot = {
  tracks: Array<{
    id: string;
    kind: LaneKind;
    label: string;
    latencyMs: number;
    mix: TrackMix;
    clips: Array<{
      id: string;
      name?: string;
      fileKey: string;
      offsetMs: number;
      trimInMs: number;
      trimOutMs: number;
      sourceDurationMs?: number;
      volume?: number;
      fadeInMs?: number;
      fadeOutMs?: number;
    }>;
  }>;
  playheadMs: number;
  loop?: AudioSession["loop"];
};
