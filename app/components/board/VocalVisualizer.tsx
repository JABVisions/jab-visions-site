"use client";

import { useEffect, useRef } from "react";
import styles from "./VocalVisualizer.module.css";

export type VocalVisualizerState = "idle" | "recording" | "playback" | "saved";

type StateConfig = { amp: number; speed: number; pulse: number; boost: number };

function configFor(state: VocalVisualizerState): StateConfig {
  switch (state) {
    case "recording":
      return { amp: 0.9, speed: 2.2, pulse: 3.0, boost: 1.4 };
    case "playback":
      return { amp: 0.55, speed: 1.8, pulse: 1.7, boost: 1.05 };
    case "saved":
      return { amp: 0.26, speed: 0.55, pulse: 0.45, boost: 1.0 };
    case "idle":
    default:
      return { amp: 0.16, speed: 0.85, pulse: 0.6, boost: 1.0 };
  }
}

// Three thin, translucent line glyphs — cyan / magenta / lime — phase-offset so
// they weave into a living, pointy waveform.
const LINES = [
  { hue: 188, alpha: 0.58, scale: 1.0, offset: 0, phase: 0 },
  { hue: 318, alpha: 0.46, scale: 0.82, offset: 0, phase: 7 },
  { hue: 150, alpha: 0.32, scale: 0.64, offset: 0, phase: 14 },
];

/**
 * Vocal Visualizer — thin, pointy, colored waveform lines that fill their
 * container. Renders the live microphone waveform (time-domain) while recording,
 * and a smooth simulated waveform for idle / playback / saved states.
 */
export default function VocalVisualizer({
  state,
  stream = null,
}: {
  state: VocalVisualizerState;
  stream?: MediaStream | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Live audio analysis while recording (guarded for SSR / no mic / no WebAudio).
  useEffect(() => {
    const teardown = () => {
      try {
        sourceRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        void audioCtxRef.current?.close();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
      audioCtxRef.current = null;
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      src.connect(analyser);
      audioCtxRef.current = ac;
      sourceRef.current = src;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);
    } catch {
      teardown();
    }

    return teardown;
  }, [state, stream]);

  // Draw loop. Fills the container (re-measures each frame) and reads the latest
  // state so state changes never restart the loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);

    const POINTS = 168;
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

      const cfg = configFor(stateRef.current);
      const t = performance.now() / 1000;
      const analyser = analyserRef.current;
      const data = dataRef.current;

      const wave: number[] = new Array(POINTS);
      if (analyser && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analyser.getByteTimeDomainData(data as any);
        for (let j = 0; j < POINTS; j++) {
          const idx = Math.floor((j / POINTS) * data.length);
          wave[j] = ((data[idx] ?? 128) - 128) / 128;
        }
      } else {
        const env = cfg.amp * (0.55 + 0.45 * Math.sin(t * cfg.pulse));
        for (let j = 0; j < POINTS; j++) {
          const x = j / POINTS;
          // Sharper harmonic mix → pointier peaks.
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
          // Gentle edge taper so lines resolve to the centerline at the sides.
          const taper = 0.35 + 0.65 * Math.sin((j / (POINTS - 1)) * Math.PI);
          const wv = wave[(j + line.phase) % POINTS] ?? wave[j];
          const y = midY + wv * maxAmp * line.scale * cfg.boost * taper + line.offset;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = Math.max(0.14, Math.min(0.9, line.alpha * (0.5 + level * 1.7)));
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
