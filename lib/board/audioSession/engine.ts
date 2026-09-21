import { clipFileKey, MissingAudioObjectError } from "./clipMedia";
import { connectScheduledClip } from "./graph";
import { scheduleSession, sessionDurationMs } from "./timeline";
import type { AudioSession, LaneKind, TrackClip, TrackMix } from "./types";
import { decodeAudioFile, getAudioContextConstructor, withAudioTimeout } from "./wav";

/** Time-domain meters don't need 2048 bins — that analyser buffer is ~8× the RAM. */
const LANE_ANALYSER_FFT = 256;

/**
 * Live transport for a session. Exposes per-lane AnalyserNodes so the Studio
 * UI can show a living equalizer for every track that is currently sounding.
 * Volume / mute are applied on live lane buses so sliders work during playback.
 * Buses are keyed by track id so multiple ad-lib lanes stay independent.
 */
export class AudioSessionEngine {
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private outputs: AudioNode[] = [];
  private analysers = new Map<string, AnalyserNode>();
  private laneGains = new Map<string, GainNode>();
  private laneMix = new Map<string, Pick<TrackMix, "volume" | "muted">>();
  private trackKinds = new Map<string, LaneKind>();
  private playing = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private onEnded: (() => void) | null = null;
  private playOriginMs = 0;
  private playStartedAt = 0;
  private missingClipNames: string[] = [];
  private playGeneration = 0;
  private decodedByKey = new Map<string, AudioBuffer>();
  private decodedCtx: AudioContext | null = null;

  get isPlaying() {
    return this.playing;
  }

  consumeMissingClipNames() {
    const names = this.missingClipNames;
    this.missingClipNames = [];
    return names;
  }

  /** Estimated playhead while transport is running. */
  getPlayheadMs() {
    if (!this.playing || !this.playStartedAt) return this.playOriginMs;
    return this.playOriginMs + (performance.now() - this.playStartedAt);
  }

  getAnalyser(kind: LaneKind): AnalyserNode | null {
    for (const [trackId, trackKind] of this.trackKinds) {
      if (trackKind === kind) return this.analysers.get(trackId) ?? null;
    }
    return null;
  }

  /** Snapshot of live lane analysers by kind (first track of each kind). */
  getAnalysers(): Partial<Record<LaneKind, AnalyserNode>> {
    const out: Partial<Record<LaneKind, AnalyserNode>> = {};
    this.trackKinds.forEach((kind, trackId) => {
      if (out[kind]) return;
      const analyser = this.analysers.get(trackId);
      if (analyser) out[kind] = analyser;
    });
    return out;
  }

  setEndedHandler(handler: (() => void) | null) {
    this.onEnded = handler;
  }

  /** Live volume / mute while a transport is running. */
  setTrackMix(trackId: string, mix: Partial<Pick<TrackMix, "volume" | "muted">>) {
    const current = this.laneMix.get(trackId) ?? { volume: 1, muted: false };
    const next = {
      volume: mix.volume ?? current.volume,
      muted: mix.muted ?? current.muted,
    };
    this.laneMix.set(trackId, next);
    const gain = this.laneGains.get(trackId);
    if (!gain) return;
    const value = next.muted ? 0 : Math.max(0, Math.min(1.5, next.volume));
    const ctx = this.ctx;
    if (ctx) {
      gain.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
    } else {
      gain.gain.value = value;
    }
  }

  /** @deprecated Prefer setTrackMix — kept for single-lane vocal/instrumental callers. */
  setLaneMix(kind: LaneKind, mix: Partial<Pick<TrackMix, "volume" | "muted">>) {
    for (const [trackId, trackKind] of this.trackKinds) {
      if (trackKind === kind) this.setTrackMix(trackId, mix);
    }
  }

  private async context() {
    const Constructor = getAudioContextConstructor();
    if (!Constructor) throw new Error("Web Audio is unavailable in this browser.");
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new Constructor();
      this.ctx.onstatechange = () => {
        if (
          this.ctx?.state === "suspended" &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          void this.ctx.resume().catch(() => undefined);
        }
      };
    }
    if (this.ctx.state === "suspended") {
      await withAudioTimeout(this.ctx.resume(), 2_500, "resume").catch(() => undefined);
    }
    return this.ctx;
  }

  /** Shared live context — mic capture must use this while the beat plays. */
  async ensureContext() {
    return this.context();
  }

  /** iOS Safari suspends the mixer when the tab hides — wake it on return. */
  async resumeContext() {
    if (!this.ctx || this.ctx.state === "closed") return;
    if (this.ctx.state === "suspended") {
      await withAudioTimeout(this.ctx.resume(), 2_500, "resume").catch(() => undefined);
    }
  }

  /** Decode every clip into the live mixer context — Mix to Drop must not open a second one. */
  async hydrateSession(session: AudioSession) {
    const ctx = await this.context();
    for (const track of session.tracks) {
      for (const clip of track.clips) {
        try {
          await this.decodeClip(clip, ctx);
          if (!clip.sourceDurationMs && clip.decoded) {
            clip.sourceDurationMs = clip.decoded.duration * 1000;
          }
        } catch {
          clip.decoded = undefined;
        }
      }
    }
  }

  private async decodeClip(clip: TrackClip, ctx: AudioContext) {
    if (this.decodedCtx !== ctx) {
      this.decodedByKey.clear();
      this.decodedCtx = ctx;
    }
    const key = clipFileKey(clip.file);
    const cached = this.decodedByKey.get(key);
    if (cached && cached.length > 0) {
      clip.decoded = cached;
      return;
    }
    const buffer = await decodeAudioFile(clip.file, ctx);
    this.decodedByKey.set(key, buffer);
    clip.decoded = buffer;
  }

  private pruneBuses(liveTrackIds: Set<string>) {
    for (const id of [...this.laneGains.keys()]) {
      if (liveTrackIds.has(id)) continue;
      try {
        this.laneGains.get(id)?.disconnect();
      } catch {
        // already disconnected
      }
      try {
        this.analysers.get(id)?.disconnect();
      } catch {
        // already disconnected
      }
      this.laneGains.delete(id);
      this.analysers.delete(id);
      this.laneMix.delete(id);
      this.trackKinds.delete(id);
    }
  }

  private busFor(trackId: string, kind: LaneKind, ctx: AudioContext, mix: TrackMix) {
    let gain = this.laneGains.get(trackId);
    let analyser = this.analysers.get(trackId);
    if (!gain || !analyser) {
      gain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = LANE_ANALYSER_FFT;
      analyser.smoothingTimeConstant = 0.35;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      this.laneGains.set(trackId, gain);
      this.analysers.set(trackId, analyser);
    }
    this.trackKinds.set(trackId, kind);
    this.laneMix.set(trackId, { volume: mix.volume, muted: mix.muted });
    gain.gain.value = mix.muted ? 0 : Math.max(0, Math.min(1.5, mix.volume));
    return gain;
  }

  private clearEndTimer() {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  async play(session: AudioSession, fromMs = session.playheadMs) {
    const generation = ++this.playGeneration;
    this.stop();
    const ctx = await this.context();
    if (generation !== this.playGeneration) return null;
    this.pruneBuses(new Set(session.tracks.map((track) => track.id)));
    const missing: string[] = [];
    for (const track of session.tracks) {
      for (const clip of track.clips) {
        try {
          await this.decodeClip(clip, ctx);
          if (!clip.sourceDurationMs && clip.decoded) {
            clip.sourceDurationMs = clip.decoded.duration * 1000;
          }
        } catch {
          clip.decoded = undefined;
          missing.push(clip.name || clip.file.name || "clip");
          continue;
        }
        if (generation !== this.playGeneration) return null;
      }
    }
    this.missingClipNames = missing;
    if (generation !== this.playGeneration) return null;

    const shifted: AudioSession = {
      ...session,
      tracks: session.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          offsetMs: clip.offsetMs - fromMs,
        })),
      })),
    };

    const scheduled = scheduleSession(shifted);
    const timeOrigin = ctx.currentTime;
    const started: AudioBufferSourceNode[] = [];
    const outputs: AudioNode[] = [];
    for (const item of scheduled) {
      // Volume/mute live on the lane bus — schedule clips dry at unity.
      const bus = this.busFor(item.track.id, item.track.kind, ctx, item.track.mix);
      const dry = {
        ...item,
        track: {
          ...item.track,
          mix: { ...item.track.mix, volume: 1, muted: false },
        },
      };
      const connected = connectScheduledClip(ctx, dry, bus, { timeOrigin });
      if (connected) {
        started.push(connected.source);
        outputs.push(connected.output);
      }
    }
    this.sources = started;
    this.outputs = outputs;
    this.playing = started.length > 0;
    this.playOriginMs = Math.max(0, fromMs);
    this.playStartedAt = this.playing ? performance.now() : 0;

    if (this.playing) {
      const remaining = Math.max(0, sessionDurationMs(shifted) - fromMs);
      this.clearEndTimer();
      this.endTimer = setTimeout(() => {
        this.playing = false;
        this.playStartedAt = 0;
        this.onEnded?.();
      }, remaining + 80);
    } else if (missing.length) {
      throw new MissingAudioObjectError(missing[0]);
    }

    return this.getAnalysers();
  }

  /** Play the beat (and any non-vocal lanes) in headphones while recording. */
  async playBacking(session: AudioSession, fromMs = 0) {
    const backing: AudioSession = {
      ...session,
      tracks: session.tracks.map((track) =>
        track.kind === "vocal"
          ? { ...track, mix: { ...track.mix, muted: true } }
          : track
      ),
    };
    return this.play(backing, fromMs);
  }

  stop(opts?: { cancel?: boolean }) {
    if (opts?.cancel) this.playGeneration += 1;
    this.clearEndTimer();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      try {
        source.disconnect();
      } catch {
        // Graph already torn down.
      }
    }
    this.sources = [];
    for (const output of this.outputs) {
      try {
        output.disconnect();
      } catch {
        // Graph already torn down.
      }
    }
    this.outputs = [];
    this.playing = false;
    this.playStartedAt = 0;
    // Preset graphs (reverb/delay tails) stay connected to the lane bus after
    // source.stop(). Tear the buses down so a new preset cannot stack on the
    // previous ones and play every effect at once.
    this.disconnectBuses();
  }

  private disconnectBuses() {
    this.laneGains.forEach((gain) => {
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
    });
    this.analysers.forEach((analyser) => {
      try {
        analyser.disconnect();
      } catch {
        // Already disconnected.
      }
    });
    this.laneGains.clear();
    this.analysers.clear();
    this.laneMix.clear();
    this.trackKinds.clear();
  }

  dispose() {
    this.playGeneration += 1;
    this.stop();
    this.disconnectBuses();
    this.decodedByKey.clear();
    this.decodedCtx = null;
    this.onEnded = null;
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
  }
}
