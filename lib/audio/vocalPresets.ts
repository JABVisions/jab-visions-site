// Vocal alteration presets for Voice Studio.
//
// Each preset is a small Web Audio graph builder, so the same definition drives
// both live preview and the offline mixdown. Adding a preset means adding one
// entry here — no UI or mix changes required.

export type VocalPresetKey =
  | "clean"
  | "warm"
  | "deep"
  | "bright"
  | "airy"
  | "radio"
  | "dream"
  | "echo"
  | "reverb"
  | "pitchUp"
  | "pitchDown"
  | "robot"
  | "distorted";

export type VocalPreset = {
  key: VocalPresetKey;
  label: string;
  hint: string;
  /** Resampling ratio applied to the take. 1 leaves pitch untouched. */
  playbackRate: number;
};

export const VOCAL_PRESETS: VocalPreset[] = [
  { key: "clean", label: "Clean", hint: "No colouring", playbackRate: 1 },
  { key: "warm", label: "Warm", hint: "Rounded lows", playbackRate: 1 },
  { key: "deep", label: "Deep", hint: "Chest weight", playbackRate: 0.94 },
  { key: "bright", label: "Bright", hint: "Forward highs", playbackRate: 1 },
  { key: "airy", label: "Airy", hint: "Open top end", playbackRate: 1 },
  { key: "radio", label: "Radio", hint: "Narrow band", playbackRate: 1 },
  { key: "dream", label: "Dream", hint: "Soft and wide", playbackRate: 1 },
  { key: "echo", label: "Echo", hint: "Slapback repeats", playbackRate: 1 },
  { key: "reverb", label: "Reverb", hint: "Room tail", playbackRate: 1 },
  { key: "pitchUp", label: "Pitch Up", hint: "Lifted", playbackRate: 1.12 },
  { key: "pitchDown", label: "Pitch Down", hint: "Dropped", playbackRate: 0.88 },
  { key: "robot", label: "Robot", hint: "Digital ring", playbackRate: 1 },
  { key: "distorted", label: "Distorted", hint: "Driven and gritty", playbackRate: 1 },
];

export function vocalPreset(key: VocalPresetKey): VocalPreset {
  return VOCAL_PRESETS.find((preset) => preset.key === key) ?? VOCAL_PRESETS[0];
}

function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function driveCurve(amount: number) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

function shelf(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  gainDb: number,
  q?: number
) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  if (typeof q === "number") filter.Q.value = q;
  if (type !== "highpass" && type !== "lowpass") filter.gain.value = gainDb;
  return filter;
}

/**
 * Wire `source` through the preset's processing and return the node to connect
 * onward. Returns `source` untouched for Clean.
 */
export function connectVocalPreset(
  ctx: BaseAudioContext,
  source: AudioNode,
  key: VocalPresetKey
): AudioNode {
  const chain = (...nodes: AudioNode[]) => {
    let node: AudioNode = source;
    nodes.forEach((next) => {
      node.connect(next);
      node = next;
    });
    return node;
  };

  switch (key) {
    case "warm":
      return chain(
        shelf(ctx, "lowshelf", 220, 4.5),
        shelf(ctx, "highshelf", 6200, -3),
        shelf(ctx, "peaking", 2600, -2, 1.1)
      );

    case "deep":
      return chain(shelf(ctx, "lowshelf", 160, 6), shelf(ctx, "lowpass", 7200, 0, 0.7));

    case "bright":
      return chain(
        shelf(ctx, "highshelf", 4800, 5.5),
        shelf(ctx, "peaking", 3200, 3, 1.2),
        shelf(ctx, "highpass", 110, 0, 0.7)
      );

    case "airy":
      return chain(shelf(ctx, "highshelf", 9000, 6), shelf(ctx, "highpass", 140, 0, 0.6));

    case "radio":
      return chain(
        shelf(ctx, "highpass", 480, 0, 0.9),
        shelf(ctx, "lowpass", 3200, 0, 0.9),
        shelf(ctx, "peaking", 1800, 5, 1.6)
      );

    case "distorted": {
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(28);
      shaper.oversample = "2x";
      const tame = shelf(ctx, "lowpass", 6800, 0, 0.8);
      const trim = ctx.createGain();
      trim.gain.value = 0.7;
      return chain(shaper, tame, trim);
    }

    case "robot": {
      // Ring modulation: an inaudible-on-its-own carrier multiplied into the take.
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(6);
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const carrier = ctx.createOscillator();
      carrier.type = "square";
      carrier.frequency.value = 58;
      carrier.connect(ring.gain);
      carrier.start();
      const band = shelf(ctx, "bandpass", 1400, 0, 0.8);
      return chain(shaper, ring, band);
    }

    case "echo": {
      const split = ctx.createGain();
      source.connect(split);
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = 0.26;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      const out = ctx.createGain();
      split.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      split.connect(out);
      wet.connect(out);
      return out;
    }

    case "reverb": {
      const split = ctx.createGain();
      source.connect(split);
      const convolver = ctx.createConvolver();
      convolver.buffer = impulseResponse(ctx, 2.4, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.38;
      const dry = ctx.createGain();
      dry.gain.value = 0.82;
      const out = ctx.createGain();
      split.connect(convolver);
      convolver.connect(wet);
      split.connect(dry);
      wet.connect(out);
      dry.connect(out);
      return out;
    }

    case "dream": {
      const split = ctx.createGain();
      source.connect(split);
      const soften = shelf(ctx, "lowpass", 8200, 0, 0.7);
      const convolver = ctx.createConvolver();
      convolver.buffer = impulseResponse(ctx, 3.4, 2);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      const dry = ctx.createGain();
      dry.gain.value = 0.7;
      const out = ctx.createGain();
      split.connect(soften);
      soften.connect(convolver);
      convolver.connect(wet);
      soften.connect(dry);
      wet.connect(out);
      dry.connect(out);
      return out;
    }

    case "pitchUp":
    case "pitchDown":
      // Pitch is handled by the source's playbackRate; keep the tone honest.
      return chain(shelf(ctx, "highpass", 90, 0, 0.7));

    case "clean":
    default:
      return source;
  }
}
