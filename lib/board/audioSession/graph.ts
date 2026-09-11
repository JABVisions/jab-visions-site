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
  options?: { timeOrigin?: number }
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
  const start = origin + scheduled.whenSeconds;
  const end = start + scheduled.durationSeconds;
  const fadeIn = Math.max(0, scheduled.clip.fadeInMs ?? mix.fadeInMs) / 1000;
  const fadeOut = Math.max(0, scheduled.clip.fadeOutMs ?? mix.fadeOutMs) / 1000;

  fade.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, start);
  if (fadeIn > 0) {
    fade.gain.linearRampToValueAtTime(1, start + Math.min(fadeIn, scheduled.durationSeconds));
  }
  if (fadeOut > 0 && fadeOut < scheduled.durationSeconds) {
    const fadeOutAt = Math.max(start, end - fadeOut);
    fade.gain.setValueAtTime(1, fadeOutAt);
    fade.gain.linearRampToValueAtTime(0, end);
  }

  if (isVoicePreset(mix.preset)) {
    const nodes = createVoicePresetNodes(ctx);
    connectVoicePresetGraph(source, nodes, { toDestination: false });
    applyVoicePreset(nodes, mix.preset, false);
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

  source.start(start, scheduled.bufferOffsetSeconds, scheduled.durationSeconds);
  return { output: panner ?? volume, source };
}
