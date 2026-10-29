import { connectScheduledClip } from "./graph";
import { scheduleSession } from "./timeline";
import { sessionFromVocalAndInstrumental } from "./session";
import { audibleTracks, clipPlayableMs, clipMixStartMs, trackEndMs } from "./timeline";
import type { AudioSession, SessionTrack, TrackClip } from "./types";
import { decodeAudioFile, getAudioContextConstructor, withAudioTimeout } from "./wav";

// Bound working memory, never the audio timeline.
const MIX_BLOCK_SECONDS = 10;
const EFFECT_PREROLL_SECONDS = 5;
const MIX_RESUME_TIMEOUT_MS = 2_000;
const MIX_SAMPLE_RATE_MAX = 24_000;

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

/** Export the complete audible timeline, including explicit offsets and trims. */
export function mixTakeDurationMs(session: AudioSession) {
  return audibleTracks(session).reduce((end, track) => Math.max(end, trackEndMs(track)), 0);
}

/** Unknown duration is allowed before decoding; empty/muted projects are not. */
export function sessionCanExport(session: AudioSession) {
  return audibleTracks(session).some((track) => track.mix.volume > 0 && track.clips.some((clip) =>
    clip.file.size > 0 && (clip.volume ?? 1) > 0 &&
    (clipPlayableMs(clip) > 0 || (!clip.decoded && !clip.sourceDurationMs && clip.trimOutMs === 0))
  ));
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
      // A missing lane must fail the export, never silently publish a partial mix.
      clip.decoded = await decodeAudioFile(clip.file, ctx);
      clip.sourceDurationMs = clip.decoded.duration * 1000;
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
  frameCount: number,
  blockStart = 0
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
    const destIndex = destOffset + i - blockStart;
    if (destIndex < 0) continue;
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

function wavHeader(frames: number, sampleRate: number) {
  const output = new ArrayBuffer(44);
  const view = new DataView(output);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  const bytes = frames * 4;
  if (bytes > 0xffffffff - 36) throw new Error("This mix exceeds the WAV file size limit.");
  write(0, "RIFF"); view.setUint32(4, 36 + bytes, true);
  write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, bytes, true);
  return output;
}

/** Stateful stereo limiter: no clipping or gain resets at block boundaries. */
function encodeBlock(left: Float32Array, right: Float32Array, rate: number, limiter: { gain: number }) {
  const output = new ArrayBuffer(left.length * 4);
  const view = new DataView(output);
  const release = Math.exp(-1 / (rate * 0.1));
  for (let i = 0; i < left.length; i++) {
    const peak = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    const target = peak > 0.98 ? 0.98 / peak : 1;
    limiter.gain = Math.min(target, 1 - (1 - limiter.gain) * release);
    view.setInt16(i * 4, Math.round(left[i] * limiter.gain * 32767), true);
    view.setInt16(i * 4 + 2, Math.round(right[i] * limiter.gain * 32767), true);
  }
  return output;
}

async function renderBlock(session: AudioSession, rate: number, start: number, frames: number, mixMs: number) {
  const tracks = audibleTracks(session);
  if (tracks.some((track) => track.mix.preset !== "none")) {
    // Reuse the preview graph, with bounded preroll for filter/reverb/delay state.
    // The longest existing preset impulse is 4.2s. No feedback loop is used.
    if (typeof OfflineAudioContext === "undefined") throw new Error("Audio effects export is unavailable in this browser.");
    const from = Math.max(0, start / rate - EFFECT_PREROLL_SECONDS);
    const skip = Math.round(start - from * rate);
    const offline = new OfflineAudioContext(2, skip + frames, rate);
    for (const scheduled of scheduleSession(session)) {
      connectScheduledClip(offline, scheduled, offline.destination, {
        window: { start: from, end: (start + frames) / rate },
      });
    }
    const rendered = await withAudioTimeout(offline.startRendering(), 45_000, "effect block");
    return [rendered.getChannelData(0).subarray(skip), rendered.getChannelData(1).subarray(skip)];
  }
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (const track of tracks) {
    for (const clip of track.clips) {
      const offset = Math.floor(Math.max(0, clipMixStartMs(clip, track.latencyMs)) * rate / 1000);
      const from = Math.max(0, start - offset);
      overlayRange(left, right, rate, clip, track, mixMs, from, frames - Math.max(0, offset - start), start);
    }
  }
  return [left, right];
}

async function bounceSession(
  session: AudioSession,
  decodeCtx?: BaseAudioContext,
  shouldAbort?: () => boolean
) {
  throwIfAborted(shouldAbort);
  if (!sessionCanExport(session)) throw new Error("This Studio session has no audible audio.");
  session = { ...session, tracks: audibleTracks(session) };
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
    if (mixMs <= 0) throw new Error("This Studio session has no audible audio.");
    const frames = Math.ceil((mixMs / 1000) * sampleRate);
    const parts: BlobPart[] = [wavHeader(frames, sampleRate)];
    const blockFrames = Math.round(sampleRate * MIX_BLOCK_SECONDS);
    const limiter = { gain: 1 };
    for (let start = 0; start < frames; start += blockFrames) {
      throwIfAborted(shouldAbort);
      const [left, right] = await renderBlock(session, sampleRate, start, Math.min(blockFrames, frames - start), mixMs);
      throwIfAborted(shouldAbort);
      parts.push(new Blob([encodeBlock(left, right, sampleRate, limiter)]));
      await yieldUi();
    }
    throwIfAborted(shouldAbort);
    return new File(parts, `studio-mix-${Date.now()}.wav`, {
      type: "audio/wav",
      lastModified: Date.now(),
    });
  } finally {
    if (created) void created.close().catch(() => undefined);
  }
}

/**
 * Bounce the full edited timeline in bounded blocks, preserving the preview effects.
 * Uses the live mixer context when provided so Safari never opens a second
 * AudioContext (that resume() can hang forever).
 */
export async function renderSessionFile(
  session: AudioSession,
  decodeCtx?: BaseAudioContext,
  shouldAbort?: () => boolean
): Promise<File> {
  return bounceSession(session, decodeCtx, shouldAbort);
}

/** Phase 1 debug hook: bounce a vocal + beat to one wav with no UI. */
export async function mixTwoFiles(vocal: File, instrumental: File): Promise<File> {
  return renderSessionFile(sessionFromVocalAndInstrumental(vocal, instrumental));
}
