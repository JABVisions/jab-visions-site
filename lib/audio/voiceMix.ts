// Voice Studio mix engine.
//
// Tracks stay separate — each with its own trim window, placement and gain —
// until a mixdown is requested. Nothing here touches React, so the booth UI can
// change freely without disturbing the audio path.

import { connectVocalPreset, vocalPreset, type VocalPresetKey } from "./vocalPresets";

export type VoiceTrackKind = "instrumental" | "lead" | "adlib";

export type VoiceTrack = {
  id: string;
  kind: VoiceTrackKind;
  label: string;
  blob: Blob;
  url: string;
  /** Seconds into the mix timeline where this clip starts. */
  offsetSec: number;
  /** Trim window measured from the start of the clip. */
  trimStartSec: number;
  trimEndSec: number;
  durationSec: number;
  muted: boolean;
  gain: number;
};

export function preferredRecordingMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) ?? ""
  );
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function trimmedDuration(track: VoiceTrack) {
  return Math.max(0, track.trimEndSec - track.trimStartSec);
}

export async function decodeAudioBlob(ctx: BaseAudioContext, blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(buffer.slice(0));
}

/** Measure a recording without keeping a decoded buffer around. */
export async function probeDuration(blob: Blob) {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await decodeAudioBlob(ctx, blob);
    return buffer.duration;
  } catch {
    return 0;
  }
}

/** Normalised 0..1 peak envelope for waveform drawing. */
export function peaksFromBuffer(buffer: AudioBuffer, buckets: number) {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Float32Array(buckets);
  let loudest = 0;
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const start = i * size;
    for (let j = 0; j < size; j++) {
      const value = Math.abs(data[start + j] ?? 0);
      if (value > peak) peak = value;
    }
    peaks[i] = peak;
    if (peak > loudest) loudest = peak;
  }
  if (loudest > 0) {
    for (let i = 0; i < buckets; i++) peaks[i] /= loudest;
  }
  return peaks;
}

export async function peaksFromBlob(blob: Blob, buckets = 160) {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await decodeAudioBlob(ctx, blob);
    return peaksFromBuffer(buffer, buckets);
  } catch {
    return null;
  }
}

/** Encode an AudioBuffer as a 16-bit PCM WAV File. */
export function audioBufferToWavFile(buffer: AudioBuffer, name: string) {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channelCount; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new File([arrayBuffer], name, { type: "audio/wav" });
}

/**
 * Render every audible track into one buffer. The vocal preset is applied to
 * lead and ad-lib takes; the instrumental stays dry.
 */
export async function renderVoiceMix(
  tracks: VoiceTrack[],
  presetKey: VocalPresetKey
): Promise<AudioBuffer> {
  const audible = tracks.filter((track) => !track.muted && track.blob.size > 0);
  if (!audible.length) throw new Error("Record or import something to mix first.");

  const probe = new OfflineAudioContext(1, 1, 44100);
  const decoded = await Promise.all(
    audible.map(async (track) => ({ track, buffer: await decodeAudioBlob(probe, track.blob) }))
  );

  const preset = vocalPreset(presetKey);
  const rateFor = (track: VoiceTrack) =>
    track.kind === "instrumental" ? 1 : preset.playbackRate;

  let endSec = 0;
  for (const { track, buffer } of decoded) {
    const window = Math.min(trimmedDuration(track) || buffer.duration, buffer.duration);
    endSec = Math.max(endSec, track.offsetSec + window / rateFor(track));
  }

  const sampleRate = decoded[0]?.buffer.sampleRate ?? 44100;
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(endSec * sampleRate)), sampleRate);

  for (const { track, buffer } of decoded) {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rateFor(track);

    const gain = offline.createGain();
    gain.gain.value = track.gain;

    const processed =
      track.kind === "instrumental" ? source : connectVocalPreset(offline, source, presetKey);
    processed.connect(gain);
    gain.connect(offline.destination);

    const window = Math.min(trimmedDuration(track) || buffer.duration, buffer.duration);
    source.start(track.offsetSec, track.trimStartSec, window);
  }

  return offline.startRendering();
}

export async function renderVoiceMixFile(tracks: VoiceTrack[], presetKey: VocalPresetKey) {
  const rendered = await renderVoiceMix(tracks, presetKey);
  return audioBufferToWavFile(rendered, `voice-studio-${Date.now()}.wav`);
}
