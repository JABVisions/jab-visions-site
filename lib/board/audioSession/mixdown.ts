import { sessionFromVocalAndInstrumental } from "./session";
import { audibleTracks, clipPlayableMs, clipMixStartMs, trackEndMs } from "./timeline";
import type { AudioSession, SessionTrack, TrackClip } from "./types";
import { decodeAudioFile, getAudioContextConstructor } from "./wav";

const TAKE_TAIL_MS = 320;
const MIX_MAX_MS = 240_000;

function yieldUi() {
  return new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/** Mix length is the vocal take (plus a short tail), not the leftover beat. */
export function mixTakeDurationMs(session: AudioSession) {
  const vocal = session.tracks.find((track) => track.kind === "vocal" && track.clips.length);
  if (vocal && !vocal.mix.muted) {
    return Math.min(MIX_MAX_MS, Math.max(1, trackEndMs(vocal) + TAKE_TAIL_MS));
  }
  const audible = audibleTracks(session);
  const longest = audible.reduce((end, track) => Math.max(end, trackEndMs(track)), 0);
  return Math.min(MIX_MAX_MS, Math.max(1, longest));
}

async function hydrateClipBuffers(session: AudioSession, ctx: BaseAudioContext) {
  for (const track of session.tracks) {
    for (const clip of track.clips) {
      try {
        // Always re-decode in this mix context. Buffers from a closed Safari
        // AudioContext can fail silently during Mix to Drop.
        clip.decoded = await decodeAudioFile(clip.file, ctx);
      } catch {
        clip.decoded = undefined;
      }
    }
  }
}

function overlayClip(
  destL: Float32Array,
  destR: Float32Array,
  destRate: number,
  clip: TrackClip,
  track: SessionTrack,
  mixLengthMs: number
) {
  const buffer = clip.decoded;
  if (!buffer) return;

  const startMs = clipMixStartMs(clip, track.latencyMs);
  const playableMs = clipPlayableMs(clip);
  if (playableMs <= 0) return;

  const volume =
    (track.mix.muted ? 0 : Math.max(0, Math.min(1.5, track.mix.volume))) *
    Math.max(0, Math.min(1.5, clip.volume ?? 1));
  if (volume <= 0) return;

  const pan = Math.max(-1, Math.min(1, track.mix.pan));
  const leftGain = volume * Math.min(1, 1 - pan);
  const rightGain = volume * Math.min(1, 1 + pan);

  const srcRate = buffer.sampleRate || destRate;
  const trimIn = Math.max(0, clip.trimInMs) / 1000;
  const destStart = Math.max(0, startMs) / 1000;
  const skipSrc = startMs < 0 ? -startMs / 1000 : 0;
  const srcStart = trimIn + skipSrc;
  const available = Math.max(0, buffer.duration - srcStart);
  const destRemaining = Math.max(0, mixLengthMs / 1000 - destStart);
  const duration = Math.min(playableMs / 1000 - skipSrc, available, destRemaining);
  if (duration <= 0.0005) return;

  const frames = Math.floor(duration * destRate);
  const destOffset = Math.floor(destStart * destRate);
  const srcChannels = buffer.numberOfChannels;
  const ch0 = buffer.getChannelData(0);
  const ch1 = srcChannels > 1 ? buffer.getChannelData(1) : ch0;
  const fadeInMs = Math.max(0, clip.fadeInMs ?? track.mix.fadeInMs);
  const fadeOutMs = Math.max(0, clip.fadeOutMs ?? track.mix.fadeOutMs);
  const fadeInFrames = Math.floor((fadeInMs / 1000) * destRate);
  const fadeOutFrames = Math.floor((fadeOutMs / 1000) * destRate);

  for (let i = 0; i < frames; i += 1) {
    const destIndex = destOffset + i;
    if (destIndex >= destL.length) break;
    const srcIndex = (srcStart + i / destRate) * srcRate;
    const a = Math.floor(srcIndex);
    const b = Math.min(a + 1, ch0.length - 1);
    const t = srcIndex - a;
    const l = (ch0[a] ?? 0) * (1 - t) + (ch0[b] ?? 0) * t;
    const r = (ch1[a] ?? 0) * (1 - t) + (ch1[b] ?? 0) * t;
    let envelope = 1;
    if (fadeInFrames > 0 && i < fadeInFrames) envelope = i / fadeInFrames;
    if (fadeOutFrames > 0 && i > frames - fadeOutFrames) {
      envelope = Math.min(envelope, (frames - i) / fadeOutFrames);
    }
    destL[destIndex] += l * leftGain * envelope;
    destR[destIndex] += r * rightGain * envelope;
  }
}

function floatStereoToWav(left: Float32Array, right: Float32Array, sampleRate: number) {
  const frames = left.length;
  const channels = 2;
  const bytesPerSample = 2;
  const dataLength = frames * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    const l = Math.max(-1, Math.min(1, left[frame] ?? 0));
    const r = Math.max(-1, Math.min(1, right[frame] ?? 0));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    offset += 2;
    view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 2;
  }
  return output;
}

/**
 * Fast Mix to Drop bounce: overlay decoded lanes for the vocal take length.
 * Avoids OfflineAudioContext + preset convolution over a full song, which froze the UI.
 */
export async function renderSessionFile(session: AudioSession): Promise<File> {
  const Constructor = getAudioContextConstructor();
  if (!Constructor) throw new Error("Web Audio is unavailable in this browser.");

  const ctx = new Constructor();
  try {
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    await hydrateClipBuffers(session, ctx);
    await yieldUi();

    const mixMs = mixTakeDurationMs(session);
    const tracks = audibleTracks(session);
    if (!tracks.length) throw new Error("This Studio session has no audible audio.");

    const sampleRate =
      tracks.flatMap((track) => track.clips.map((clip) => clip.decoded?.sampleRate ?? 0)).find((rate) => rate > 0) ||
      session.sampleRate ||
      48_000;
    const frames = Math.max(1, Math.ceil((mixMs / 1000) * sampleRate));
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);

    for (const track of tracks) {
      for (const clip of track.clips) {
        overlayClip(left, right, sampleRate, clip, track, mixMs);
      }
    }

    await yieldUi();
    const wav = floatStereoToWav(left, right, sampleRate);
    return new File([wav], `studio-mix-${Date.now()}.wav`, {
      type: "audio/wav",
      lastModified: Date.now(),
    });
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Phase 1 debug hook: bounce a vocal + beat to one wav with no UI. */
export async function mixTwoFiles(vocal: File, instrumental: File): Promise<File> {
  return renderSessionFile(sessionFromVocalAndInstrumental(vocal, instrumental));
}
