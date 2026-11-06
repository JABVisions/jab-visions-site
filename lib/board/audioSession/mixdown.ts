import { sessionFromVocalAndInstrumental } from "./session";
import { audibleTracks, clipPlayableMs, clipMixStartMs, trackEndMs } from "./timeline";
import type { AudioSession, SessionTrack, TrackClip } from "./types";
import { decodeAudioFile, getAudioContextConstructor, withAudioTimeout } from "./wav";

const TAKE_TAIL_MS = 320;
const MIX_MAX_MS = 120_000;
const MIX_RENDER_TIMEOUT_MS = 20_000;
const MIX_RESUME_TIMEOUT_MS = 2_000;
const MIX_SAMPLE_RATE_MAX = 24_000;
const OVERLAY_YIELD_FRAMES = 24_000;

function throwIfAborted(shouldAbort?: () => boolean) {
  if (shouldAbort?.()) throw new Error("Audio session mix aborted");
}

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

function decodedBufferUsable(buffer: AudioBuffer | undefined): buffer is AudioBuffer {
  if (!buffer || buffer.length <= 0) return false;
  try {
    void buffer.getChannelData(0);
    return true;
  } catch {
    return false;
  }
}

async function hydrateClipBuffers(session: AudioSession, ctx: BaseAudioContext) {
  for (const track of session.tracks) {
    for (const clip of track.clips) {
      if (decodedBufferUsable(clip.decoded)) continue;
      try {
        clip.decoded = await decodeAudioFile(clip.file, ctx);
      } catch {
        clip.decoded = undefined;
      }
    }
  }
}

function overlayRange(
  destL: Float32Array,
  destR: Float32Array,
  destRate: number,
  clip: TrackClip,
  track: SessionTrack,
  mixLengthMs: number,
  fromFrame: number,
  frameCount: number
) {
  const buffer = clip.decoded;
  if (!buffer) return 0;

  const startMs = clipMixStartMs(clip, track.latencyMs);
  const playableMs = clipPlayableMs(clip);
  if (playableMs <= 0) return 0;

  const volume =
    (track.mix.muted ? 0 : Math.max(0, Math.min(1.5, track.mix.volume))) *
    Math.max(0, Math.min(1.5, clip.volume ?? 1));
  if (volume <= 0) return 0;

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
  if (duration <= 0.0005) return 0;

  const frames = Math.floor(duration * destRate);
  if (fromFrame >= frames) return 0;
  const destOffset = Math.floor(destStart * destRate);
  const srcChannels = buffer.numberOfChannels;
  const ch0 = buffer.getChannelData(0);
  const ch1 = srcChannels > 1 ? buffer.getChannelData(1) : ch0;
  const fadeInMs = Math.max(0, clip.fadeInMs ?? track.mix.fadeInMs);
  const fadeOutMs = Math.max(0, clip.fadeOutMs ?? track.mix.fadeOutMs);
  const fadeInFrames = Math.floor((fadeInMs / 1000) * destRate);
  const fadeOutFrames = Math.floor((fadeOutMs / 1000) * destRate);
  const sameRate = Math.abs(srcRate - destRate) < 0.5;
  const ratio = destRate > 0 ? srcRate / destRate : 1;
  const step = Math.round(ratio);
  const integerStep = !sameRate && step >= 1 && Math.abs(ratio - step) < 0.001;
  const srcOffset = Math.floor(srcStart * srcRate);
  const end = Math.min(frames, fromFrame + frameCount);

  for (let i = fromFrame; i < end; i += 1) {
    const destIndex = destOffset + i;
    if (destIndex >= destL.length) break;
    let l: number;
    let r: number;
    if (sameRate) {
      const srcIndex = Math.min(ch0.length - 1, Math.max(0, srcOffset + i));
      l = ch0[srcIndex] ?? 0;
      r = ch1[srcIndex] ?? 0;
    } else if (integerStep) {
      const srcIndex = Math.min(ch0.length - 1, Math.max(0, srcOffset + i * step));
      l = ch0[srcIndex] ?? 0;
      r = ch1[srcIndex] ?? 0;
    } else {
      const srcIndex = (srcStart + i / destRate) * srcRate;
      const a = Math.floor(srcIndex);
      const b = Math.min(a + 1, ch0.length - 1);
      const t = srcIndex - a;
      l = (ch0[a] ?? 0) * (1 - t) + (ch0[b] ?? 0) * t;
      r = (ch1[a] ?? 0) * (1 - t) + (ch1[b] ?? 0) * t;
    }
    let envelope = 1;
    if (fadeInFrames > 0 && i < fadeInFrames) envelope = i / fadeInFrames;
    if (fadeOutFrames > 0 && i > frames - fadeOutFrames) {
      envelope = Math.min(envelope, (frames - i) / fadeOutFrames);
    }
    destL[destIndex] += l * leftGain * envelope;
    destR[destIndex] += r * rightGain * envelope;
  }

  return frames;
}

function clipOverlayFrames(clip: TrackClip, track: SessionTrack, destRate: number, mixLengthMs: number) {
  const buffer = clip.decoded;
  if (!buffer) return 0;
  const startMs = clipMixStartMs(clip, track.latencyMs);
  const playableMs = clipPlayableMs(clip);
  if (playableMs <= 0) return 0;
  const destStart = Math.max(0, startMs) / 1000;
  const skipSrc = startMs < 0 ? -startMs / 1000 : 0;
  const srcStart = Math.max(0, clip.trimInMs) / 1000 + skipSrc;
  const available = Math.max(0, buffer.duration - srcStart);
  const destRemaining = Math.max(0, mixLengthMs / 1000 - destStart);
  const duration = Math.min(playableMs / 1000 - skipSrc, available, destRemaining);
  if (duration <= 0.0005) return 0;
  return Math.floor(duration * destRate);
}

async function overlayClip(
  destL: Float32Array,
  destR: Float32Array,
  destRate: number,
  clip: TrackClip,
  track: SessionTrack,
  mixLengthMs: number,
  shouldAbort?: () => boolean
) {
  const frames = clipOverlayFrames(clip, track, destRate, mixLengthMs);
  for (let from = 0; from < frames; from += OVERLAY_YIELD_FRAMES) {
    throwIfAborted(shouldAbort);
    overlayRange(destL, destR, destRate, clip, track, mixLengthMs, from, OVERLAY_YIELD_FRAMES);
    if (from + OVERLAY_YIELD_FRAMES < frames) await yieldUi();
  }
}

async function floatStereoToWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  shouldAbort?: () => boolean
) {
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
    if (frame > 0 && frame % OVERLAY_YIELD_FRAMES === 0) {
      throwIfAborted(shouldAbort);
      await yieldUi();
    }
    const l = Math.max(-1, Math.min(1, left[frame] ?? 0));
    const r = Math.max(-1, Math.min(1, right[frame] ?? 0));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    offset += 2;
    view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 2;
  }
  return output;
}

async function bounceSession(
  session: AudioSession,
  decodeCtx?: BaseAudioContext,
  shouldAbort?: () => boolean
) {
  throwIfAborted(shouldAbort);
  const needsDecode = session.tracks.some((track) =>
    track.clips.some((clip) => !decodedBufferUsable(clip.decoded))
  );
  let created: AudioContext | null = null;
  try {
    if (needsDecode) {
      let ctx = decodeCtx;
      if (!ctx || (ctx as AudioContext).state === "closed") {
        const Constructor = getAudioContextConstructor();
        if (!Constructor) throw new Error("Web Audio is unavailable in this browser.");
        created = new Constructor();
        if (created.state === "suspended") {
          await withAudioTimeout(created.resume(), MIX_RESUME_TIMEOUT_MS, "mix-resume").catch(
            () => undefined
          );
        }
        ctx = created;
      }
      throwIfAborted(shouldAbort);
      await hydrateClipBuffers(session, ctx);
      await yieldUi();
    }

    const mixMs = mixTakeDurationMs(session);
    const tracks = audibleTracks(session);
    if (!tracks.length) throw new Error("This Studio session has no audible audio.");

    const nativeRate =
      tracks.flatMap((track) => track.clips.map((clip) => clip.decoded?.sampleRate ?? 0)).find((rate) => rate > 0) ||
      session.sampleRate ||
      48_000;
    const sampleRate = Math.min(MIX_SAMPLE_RATE_MAX, nativeRate);
    const frames = Math.max(1, Math.ceil((mixMs / 1000) * sampleRate));
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);

    for (const track of tracks) {
      for (const clip of track.clips) {
        await overlayClip(left, right, sampleRate, clip, track, mixMs, shouldAbort);
      }
    }

    await yieldUi();
    const wav = await floatStereoToWav(left, right, sampleRate, shouldAbort);
    return new File([wav], `studio-mix-${Date.now()}.wav`, {
      type: "audio/wav",
      lastModified: Date.now(),
    });
  } finally {
    if (created) void created.close().catch(() => undefined);
  }
}

/**
 * Fast Mix to Drop bounce: overlay decoded lanes for the vocal take length.
 * Uses the live mixer context when provided so Safari never opens a second
 * AudioContext (that resume() can hang forever).
 */
export async function renderSessionFile(
  session: AudioSession,
  decodeCtx?: BaseAudioContext,
  shouldAbort?: () => boolean
): Promise<File> {
  return withAudioTimeout(bounceSession(session, decodeCtx, shouldAbort), MIX_RENDER_TIMEOUT_MS, "mix");
}

/** Phase 1 debug hook: bounce a vocal + beat to one wav with no UI. */
export async function mixTwoFiles(vocal: File, instrumental: File): Promise<File> {
  return renderSessionFile(sessionFromVocalAndInstrumental(vocal, instrumental));
}
