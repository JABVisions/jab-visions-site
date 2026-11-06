import {
  applyVoicePreset,
  connectVoicePresetGraph,
  createVoicePresetNodes,
  type VoicePresetKey,
} from "@/lib/board/voicePresetAudio";
import type { ScheduledClip } from "./timeline";
import type { StudioPresetKey } from "./types";

export type TrackOutput = {
  output: AudioNode;
  source: AudioBufferSourceNode;
};

export function isVoicePreset(preset: StudioPresetKey): preset is VoicePresetKey {
  return preset !== "none";
}

/**
 * Connects one scheduled clip into `destination` (offline bus or live master).
 * Preset graphs are not wired to context.destination so N tracks can share a bus.
 * `timeOrigin` is AudioContext time for live playback (pass ctx.currentTime);
 * leave at 0 for OfflineAudioContext renders.
 */
export function connectScheduledClip(
  ctx: BaseAudioContext,
  scheduled: ScheduledClip,
  destination: AudioNode,
  options?: { timeOrigin?: number; window?: { start: number; end: number } }
): TrackOutput | null {
  const buffer = scheduled.clip.decoded;
  if (!buffer) return null;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const fade = ctx.createGain();
  const volume = ctx.createGain();
  const clipGain = Math.max(0, Math.min(1.5, scheduled.clip.volume ?? 1));
  volume.gain.value = Math.max(
    0,
    Math.min(1.5, scheduled.track.mix.volume * clipGain)
  );

  const panner =
    "createStereoPanner" in ctx
      ? ctx.createStereoPanner()
      : null;
  if (panner) {
    panner.pan.value = Math.max(-1, Math.min(1, scheduled.track.mix.pan));
  }

  const mix = scheduled.track.mix;
  const origin = Math.max(0, options?.timeOrigin ?? 0);
  const windowStart = options?.window?.start ?? 0;
  const windowEnd = options?.window?.end ?? Infinity;
  const clipStart = scheduled.whenSeconds;
  const clipEnd = clipStart + scheduled.durationSeconds;
  const playStart = Math.max(clipStart, windowStart);
  const playEnd = Math.min(clipEnd, windowEnd);
  if (playEnd <= playStart) return null;
  const start = origin + playStart - windowStart;
  const end = origin + playEnd - windowStart;
  const fadeIn = Math.max(0, scheduled.clip.fadeInMs ?? mix.fadeInMs) / 1000;
  const fadeOut = Math.max(0, scheduled.clip.fadeOutMs ?? mix.fadeOutMs) / 1000;

  const envelope = (at: number) => Math.min(
    1,
    fadeIn > 0 ? (at - clipStart) / fadeIn : 1,
    fadeOut > 0 ? (clipEnd - at) / fadeOut : 1
  );
  fade.gain.setValueAtTime(Math.max(0, envelope(playStart)), start);
  const breakpoints = [clipStart + fadeIn, clipEnd - fadeOut].filter((at) => at > playStart && at < playEnd).sort((a, b) => a - b);
  for (const at of [...breakpoints, playEnd]) {
    fade.gain.linearRampToValueAtTime(Math.max(0, envelope(at)), origin + at - windowStart);
  }

  if (isVoicePreset(mix.preset)) {
    const nodes = createVoicePresetNodes(ctx);
    connectVoicePresetGraph(source, nodes, { toDestination: false });
    applyVoicePreset(nodes, mix.preset, false, mix.alteration);
    nodes.master.connect(fade);
  } else {
    source.connect(fade);
  }

  fade.connect(volume);
  if (panner) {
    volume.connect(panner);
    panner.connect(destination);
  } else {
    volume.connect(destination);
  }

  source.start(start, scheduled.bufferOffsetSeconds + playStart - clipStart, playEnd - playStart);
  return { output: panner ?? volume, source };
}
