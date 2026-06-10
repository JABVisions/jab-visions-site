"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "./VocalVisualizer.module.css";

export type VocalVisualizerState = "idle" | "recording" | "playback" | "saved";

type StateConfig = { amp: number; speed: number; pulse: number; boost: number };

function configFor(state: VocalVisualizerState): StateConfig {
  switch (state) {
    case "recording":
      return { amp: 0.9, speed: 2.2, pulse: 3.0, boost: 1.4 };
    case "playback":
      return { amp: 0.72, speed: 1.8, pulse: 1.7, boost: 1.45 };
    case "saved":
      return { amp: 0.26, speed: 0.55, pulse: 0.45, boost: 1.0 };
    case "idle":
    default:
      return { amp: 0.16, speed: 0.85, pulse: 0.6, boost: 1.0 };
  }
}

// MediaElementSource can only be created once per <audio> element — cache graphs.
type PlaybackGraph = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
};
const playbackGraphs = new WeakMap<HTMLAudioElement, PlaybackGraph>();

// Three thin, translucent line glyphs — cyan / magenta / lime — phase-offset so
// they weave into a living, pointy waveform.
const LINES = [
  { hue: 188, alpha: 0.58, scale: 1.0, offset: 0, phase: 0 },
  { hue: 318, alpha: 0.46, scale: 0.82, offset: 0, phase: 7 },
  { hue: 150, alpha: 0.32, scale: 0.64, offset: 0, phase: 14 },
];

const POINTS = 168;

/** Map analyser time-domain samples into a pointy waveform that tracks voice energy. */
function sampleTimeDomainWave(data: Uint8Array, points: number, gain = 1): number[] {
  const wave: number[] = new Array(points);
  const len = data.length;
  for (let j = 0; j < points; j++) {
    const start = Math.floor((j / points) * len);
    const end = Math.max(start + 1, Math.floor(((j + 1) / points) * len));
    let min = 128;
    let max = 128;
    for (let i = start; i < end; i++) {
      const v = data[i] ?? 128;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const peak = ((max - min) / 255) * gain;
    const center = ((data[start] ?? 128) - 128) / 128;
    const sign = center >= 0 ? 1 : -1;
    wave[j] = Math.max(-1, Math.min(1, peak * sign * 1.25 + center * 0.35));
  }
  return wave;
}

/**
 * Vocal Visualizer — thin, pointy, colored waveform lines that fill their
 * container. Uses live microphone data while recording and live playback
 * analysis while an audio clip plays on the feed.
 */
export default function VocalVisualizer({
  state,
  stream = null,
  playbackAudioRef = null,
}: {
  state: VocalVisualizerState;
  stream?: MediaStream | null;
  /** When playing a voice/audio drop, pass the <audio> ref for real-time waveform. */
  playbackAudioRef?: RefObject<HTMLAudioElement | null> | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const micCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array | null>(null);

  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackDataRef = useRef<Uint8Array | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Live microphone analysis while recording.
  useEffect(() => {
    const teardown = () => {
      try {
        micSourceRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        micAnalyserRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        void micCtxRef.current?.close();
      } catch {
        /* noop */
      }
      micSourceRef.current = null;
      micAnalyserRef.current = null;
      micDataRef.current = null;
      micCtxRef.current = null;
    };

    if (state !== "recording" || !stream || typeof window === "undefined") {
      teardown();
      return;
    }

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    try {
      const ac = new AC();
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.42;
      src.connect(analyser);
      micCtxRef.current = ac;
      micSourceRef.current = src;
      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(analyser.fftSize);
      void ac.resume();
    } catch {
      teardown();
    }

    return teardown;
  }, [state, stream]);

  // Live playback analysis — waveform follows the actual voice in the clip.
  useEffect(() => {
    const clearPlaybackRefs = () => {
      playbackAnalyserRef.current = null;
      playbackDataRef.current = null;
    };

    if (state !== "playback" || typeof window === "undefined") {
      clearPlaybackRefs();
      return;
    }

    const el = playbackAudioRef?.current;
    if (!el) {
      clearPlaybackRefs();
      return;
    }

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    try {
      let graph = playbackGraphs.get(el);
      if (!graph) {
        const ctx = new AC();
        const source = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.28;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        graph = { ctx, source, analyser };
        playbackGraphs.set(el, graph);
      }

      playbackAnalyserRef.current = graph.analyser;
      playbackDataRef.current = new Uint8Array(graph.analyser.fftSize);
      void graph.ctx.resume();
    } catch {
      clearPlaybackRefs();
    }

    return clearPlaybackRefs;
  }, [state, playbackAudioRef]);

  // Draw loop — reads live mic or playback analysers when available.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);

    let running = true;

    const draw = () => {
      if (!running) return;
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const needW = Math.round(cssW * dpr);
      const needH = Math.round(cssH * dpr);
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW;
        canvas.height = needH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const currentState = stateRef.current;
      const cfg = configFor(currentState);
      const t = performance.now() / 1000;

      let analyser: AnalyserNode | null = null;
      let data: Uint8Array | null = null;
      let liveGain = 1;

      if (currentState === "recording" && micAnalyserRef.current && micDataRef.current) {
        analyser = micAnalyserRef.current;
        data = micDataRef.current;
        liveGain = 1.15;
      } else if (currentState === "playback" && playbackAnalyserRef.current && playbackDataRef.current) {
        analyser = playbackAnalyserRef.current;
        data = playbackDataRef.current;
        liveGain = 1.35;
      }

      let wave: number[];
      if (analyser && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analyser.getByteTimeDomainData(data as any);
        wave = sampleTimeDomainWave(data, POINTS, liveGain);
      } else {
        const env = cfg.amp * (0.55 + 0.45 * Math.sin(t * cfg.pulse));
        wave = new Array(POINTS);
        for (let j = 0; j < POINTS; j++) {
          const x = j / POINTS;
          wave[j] =
            env *
            (Math.sin(x * Math.PI * 2 * 3 + t * cfg.speed) * 0.5 +
              Math.sin(x * Math.PI * 2 * 5.5 + t * cfg.speed * 1.4) * 0.32 +
              Math.sin(x * Math.PI * 2 * 9 + t * cfg.speed * 2.1) * 0.18);
        }
      }

      let level = 0;
      for (let j = 0; j < POINTS; j++) level += Math.abs(wave[j]);
      level /= POINTS;

      const midY = cssH / 2;
      const maxAmp = cssH * 0.46;

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";

      for (const line of LINES) {
        ctx.beginPath();
        for (let j = 0; j < POINTS; j++) {
          const x = (j / (POINTS - 1)) * cssW;
          const taper = 0.35 + 0.65 * Math.sin((j / (POINTS - 1)) * Math.PI);
          const wv = wave[(j + line.phase) % POINTS] ?? wave[j];
          const y = midY + wv * maxAmp * line.scale * cfg.boost * taper + line.offset;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = Math.max(0.14, Math.min(0.95, line.alpha * (0.42 + level * 2.1)));
        ctx.strokeStyle = `hsla(${line.hue}, 100%, 68%, ${alpha})`;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = `hsla(${line.hue}, 100%, 64%, 0.8)`;
        ctx.shadowBlur = 7;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const label =
    state === "recording"
      ? "Listening"
      : state === "playback"
        ? "Playing"
        : state === "saved"
          ? "Voice Drop"
          : "Voice Mode";

  return (
    <div className={`${styles.shell} ${styles[state] ?? ""}`}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
      <span className={styles.tag}>{label}</span>
    </div>
  );
}
