"use client";

import { useEffect, useRef, useState } from "react";

export type VoicePresetKey = "clean" | "warm" | "radio" | "concert" | "dream";

const PRESETS: { key: VoicePresetKey; label: string }[] = [
  { key: "clean", label: "Studio Clean" },
  { key: "warm", label: "Warm Vocal" },
  { key: "radio", label: "Radio Voice" },
  { key: "concert", label: "Concert Hall" },
  { key: "dream", label: "Dream Voice" },
];

type Nodes = {
  ctx: AudioContext;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  low: BiquadFilterNode;
  high: BiquadFilterNode;
  peak: BiquadFilterNode;
  dry: GainNode;
  wet: GainNode;
  master: GainNode;
};

// A short decaying-noise impulse → lightweight reverb for the hall/dream presets.
function makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function applyPreset(n: Nodes, preset: VoicePresetKey) {
  const t = n.ctx.currentTime;
  const set = (p: AudioParam, v: number) => {
    try {
      p.setTargetAtTime(v, t, 0.03);
    } catch {
      p.value = v;
    }
  };

  n.hp.type = "highpass";
  n.lp.type = "lowpass";
  n.low.type = "lowshelf";
  n.high.type = "highshelf";
  n.peak.type = "peaking";

  switch (preset) {
    case "warm":
      set(n.hp.frequency, 60);
      set(n.lp.frequency, 9000);
      set(n.low.frequency, 220);
      set(n.low.gain, 4.5);
      set(n.high.frequency, 8000);
      set(n.high.gain, -3);
      set(n.peak.frequency, 1500);
      set(n.peak.gain, 1.5);
      set(n.peak.Q, 1);
      set(n.wet.gain, 0.08);
      set(n.dry.gain, 1);
      break;
    case "radio":
      set(n.hp.frequency, 350);
      set(n.lp.frequency, 3200);
      set(n.low.frequency, 200);
      set(n.low.gain, -4);
      set(n.high.frequency, 6000);
      set(n.high.gain, -6);
      set(n.peak.frequency, 2000);
      set(n.peak.gain, 6);
      set(n.peak.Q, 1.4);
      set(n.wet.gain, 0.03);
      set(n.dry.gain, 1);
      break;
    case "concert":
      set(n.hp.frequency, 70);
      set(n.lp.frequency, 16000);
      set(n.low.frequency, 200);
      set(n.low.gain, 1);
      set(n.high.frequency, 9000);
      set(n.high.gain, 1.5);
      set(n.peak.frequency, 3000);
      set(n.peak.gain, 1);
      set(n.peak.Q, 0.8);
      set(n.wet.gain, 0.42);
      set(n.dry.gain, 0.85);
      break;
    case "dream":
      set(n.hp.frequency, 90);
      set(n.lp.frequency, 12000);
      set(n.low.frequency, 250);
      set(n.low.gain, 2);
      set(n.high.frequency, 10000);
      set(n.high.gain, 3.5);
      set(n.peak.frequency, 4000);
      set(n.peak.gain, 0);
      set(n.peak.Q, 0.7);
      set(n.wet.gain, 0.5);
      set(n.dry.gain, 0.8);
      break;
    case "clean":
    default:
      set(n.hp.frequency, 75);
      set(n.lp.frequency, 18000);
      set(n.low.frequency, 200);
      set(n.low.gain, 0);
      set(n.high.frequency, 8000);
      set(n.high.gain, 2);
      set(n.peak.frequency, 3000);
      set(n.peak.gain, 2);
      set(n.peak.Q, 0.9);
      set(n.wet.gain, 0);
      set(n.dry.gain, 1);
      break;
  }
}

/**
 * Voice playback with welcoming, named enhancement presets — built on a guarded
 * Web Audio filter chain. Owns its own <audio> element so the MediaElementSource
 * is created exactly once. Falls back to plain playback if Web Audio is missing.
 */
export default function VoicePresets({
  src,
  onPlayingChange,
}: {
  src: string;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nodesRef = useRef<Nodes | null>(null);
  const setupTriedRef = useRef(false);
  const [preset, setPreset] = useState<VoicePresetKey>("clean");

  function ensureGraph() {
    if (nodesRef.current || setupTriedRef.current) return nodesRef.current;
    setupTriedRef.current = true;
    const el = audioRef.current;
    if (!el || typeof window === "undefined") return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      const source = ctx.createMediaElementSource(el);
      const hp = ctx.createBiquadFilter();
      const lp = ctx.createBiquadFilter();
      const low = ctx.createBiquadFilter();
      const high = ctx.createBiquadFilter();
      const peak = ctx.createBiquadFilter();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const master = ctx.createGain();
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 2.6, 2.4);

      source.connect(hp);
      hp.connect(lp);
      lp.connect(low);
      low.connect(high);
      high.connect(peak);
      peak.connect(dry);
      dry.connect(master);
      peak.connect(conv);
      conv.connect(wet);
      wet.connect(master);
      master.connect(ctx.destination);

      const nodes: Nodes = { ctx, hp, lp, low, high, peak, dry, wet, master };
      nodesRef.current = nodes;
      applyPreset(nodes, preset);
      return nodes;
    } catch {
      return null;
    }
  }

  // NOTE: do NOT build the audio graph on mount. Creating an AudioContext before
  // any user gesture leaves it "suspended", which silences the FIRST playback.
  // The graph is built lazily on the first play / preset tap (a real gesture),
  // so the context starts running and audio is audible right away.

  useEffect(() => {
    if (nodesRef.current) applyPreset(nodesRef.current, preset);
  }, [preset]);

  useEffect(
    () => () => {
      // Suspend (never close) on unmount. A MediaElementSource can only be created
      // ONCE per <audio> element, ever — closing the context would permanently
      // strand the element on a dead graph (this is what made presets sound flat,
      // since React StrictMode mounts→cleans up→remounts the effect in dev).
      try {
        void nodesRef.current?.ctx.suspend();
      } catch {
        /* noop */
      }
    },
    []
  );

  return (
    <div className="vpRack">
      <div className="vpHead">
        <span className="vpEyebrow">Vocal Enhancement</span>
        <span className="vpHint">Pick a sound — no audio knobs required.</span>
      </div>
      <div className="vpChips" role="tablist" aria-label="Voice presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={preset === p.key}
            className={`vpChip ${preset === p.key ? "on" : ""}`}
            onClick={() => {
              ensureGraph();
              setPreset(p.key);
              void nodesRef.current?.ctx.resume?.();
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <audio
        ref={audioRef}
        src={src}
        controls
        preload="metadata"
        onPlay={() => {
          ensureGraph();
          void nodesRef.current?.ctx.resume?.();
          onPlayingChange?.(true);
        }}
        onPause={() => onPlayingChange?.(false)}
        onEnded={() => onPlayingChange?.(false)}
      />

      <style jsx>{`
        .vpRack {
          display: grid;
          gap: 10px;
        }
        .vpHead {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .vpEyebrow {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #7ff5e7;
        }
        .vpHint {
          font-size: 11px;
          color: rgba(220, 255, 248, 0.55);
        }
        .vpChips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .vpChip {
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: rgba(232, 255, 248, 0.78);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(167, 244, 232, 0.2);
          cursor: pointer;
          transition: transform 140ms ease, background 140ms ease;
        }
        .vpChip:hover {
          transform: translateY(-1px);
        }
        .vpChip.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.55);
          box-shadow: 0 0 14px rgba(126, 226, 255, 0.4);
        }
        .vpRack audio {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
