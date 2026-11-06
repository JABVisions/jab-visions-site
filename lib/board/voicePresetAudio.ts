import { audioBufferToWav } from "@/lib/board/audioSession/wav";

export type VoicePresetKey =
  | "clean"
  | "warm"
  | "radio"
  | "concert"
  | "dream"
  | "deep"
  | "high"
  | "robot"
  | "distorted"
  | "chorus"
  | "echo"
  | "reverb"
  | "pitch";

export const VOICE_PRESETS: { key: VoicePresetKey; label: string; detail: string }[] = [
  { key: "clean", label: "Clean", detail: "Clear, balanced, controlled" },
  { key: "deep", label: "Deep", detail: "Lower body, warm weight" },
  { key: "high", label: "High", detail: "Brighter, lifted presence" },
  { key: "robot", label: "Robot", detail: "Metallic, gated, synthetic" },
  { key: "radio", label: "Radio", detail: "Tight broadcast tone" },
  { key: "dream", label: "Dream", detail: "Airy echo and floating space" },
  { key: "distorted", label: "Distorted", detail: "Driven grit and edge" },
  { key: "chorus", label: "Chorus", detail: "Wide doubled presence" },
  { key: "echo", label: "Echo", detail: "Rhythmic slap and repeats" },
  { key: "reverb", label: "Reverb", detail: "Open hall space" },
  { key: "pitch", label: "Pitch Correction", detail: "Gentle tuning glue" },
  { key: "warm", label: "Warm", detail: "Full lows, soft highs" },
  { key: "concert", label: "Concert", detail: "Wide hall vocal" },
];

/** Compact Studio alteration tray — primary presets shown first. */
export const STUDIO_ALTERATION_PRESETS: VoicePresetKey[] = [
  "clean",
  "deep",
  "high",
  "robot",
  "radio",
  "dream",
  "distorted",
  "chorus",
  "echo",
  "reverb",
  "pitch",
];

export type AlterationControlKey = "intensity" | "pitch" | "reverb" | "echo" | "distortion" | "correction";

export const ALTERATION_CONTROLS: Record<VoicePresetKey, AlterationControlKey[]> = {
  clean: ["intensity"],
  warm: ["intensity", "reverb"],
  radio: ["intensity", "distortion"],
  concert: ["intensity", "reverb"],
  dream: ["intensity", "reverb", "echo"],
  deep: ["intensity", "pitch"],
  high: ["intensity", "pitch"],
  robot: ["intensity", "distortion", "pitch"],
  distorted: ["intensity", "distortion"],
  chorus: ["intensity", "reverb"],
  echo: ["intensity", "echo"],
  reverb: ["intensity", "reverb"],
  pitch: ["intensity", "correction", "pitch"],
};

const VOICE_DECODE_TIMEOUT_MS = 12_000;
const VOICE_RENDER_MIN_TIMEOUT_MS = 15_000;
const VOICE_RENDER_MAX_TIMEOUT_MS = 45_000;

function withAudioTimeout<T>(promise: Promise<T>, timeoutMs: number, stage: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Voice preset ${stage} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

type PresetSettings = {
  hp: number;
  lp: number;
  lowFrequency: number;
  lowGain: number;
  highFrequency: number;
  highGain: number;
  peakFrequency: number;
  peakGain: number;
  peakQ: number;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  drive: number;
  dry: number;
  wet: number;
  reverbSeconds: number;
  reverbDecay: number;
  echo: number;
  delay: number;
  feedback: number;
  master: number;
  rate: number;
};

export const VOICE_PRESET_SETTINGS: Record<VoicePresetKey, PresetSettings> = {
  clean: {
    hp: 80, lp: 16_500, lowFrequency: 180, lowGain: 0, highFrequency: 7_500,
    highGain: 2.5, peakFrequency: 3_200, peakGain: 2.5, peakQ: 0.9,
    threshold: -22, ratio: 3, attack: 0.008, release: 0.16, drive: 1.15,
    dry: 1, wet: 0.015, reverbSeconds: 0.45, reverbDecay: 3,
    echo: 0, delay: 0.12, feedback: 0, master: 0.94, rate: 1,
  },
  warm: {
    hp: 50, lp: 9_000, lowFrequency: 230, lowGain: 9, highFrequency: 6_500,
    highGain: -5, peakFrequency: 1_500, peakGain: 3, peakQ: 0.9,
    threshold: -27, ratio: 4.5, attack: 0.012, release: 0.24, drive: 2.4,
    dry: 0.92, wet: 0.22, reverbSeconds: 1.1, reverbDecay: 3.2,
    echo: 0, delay: 0.14, feedback: 0, master: 0.76, rate: 0.98,
  },
  radio: {
    hp: 480, lp: 2_650, lowFrequency: 200, lowGain: -12, highFrequency: 4_500,
    highGain: -14, peakFrequency: 1_700, peakGain: 12, peakQ: 2.1,
    threshold: -34, ratio: 10, attack: 0.002, release: 0.08, drive: 7,
    dry: 1, wet: 0.025, reverbSeconds: 0.3, reverbDecay: 4,
    echo: 0, delay: 0.1, feedback: 0, master: 0.64, rate: 1.06,
  },
  concert: {
    hp: 70, lp: 17_000, lowFrequency: 190, lowGain: 1.2, highFrequency: 8_500,
    highGain: 2, peakFrequency: 2_900, peakGain: 1.4, peakQ: 0.75,
    threshold: -20, ratio: 2.4, attack: 0.014, release: 0.28, drive: 1.1,
    dry: 0.56, wet: 0.88, reverbSeconds: 4.2, reverbDecay: 1.8,
    echo: 0.16, delay: 0.23, feedback: 0.2, master: 0.62, rate: 1,
  },
  dream: {
    hp: 100, lp: 12_500, lowFrequency: 240, lowGain: 1.5, highFrequency: 9_000,
    highGain: 7, peakFrequency: 4_400, peakGain: -2, peakQ: 0.7,
    threshold: -18, ratio: 2, attack: 0.02, release: 0.35, drive: 1.05,
    dry: 0.82, wet: 0.18, reverbSeconds: 1.4, reverbDecay: 3.2,
    echo: 0, delay: 0.2, feedback: 0, master: 0.72, rate: 0.93,
  },
  deep: {
    hp: 40, lp: 8_500, lowFrequency: 160, lowGain: 11, highFrequency: 5_500,
    highGain: -8, peakFrequency: 900, peakGain: 4, peakQ: 0.8,
    threshold: -26, ratio: 4, attack: 0.015, release: 0.28, drive: 1.8,
    dry: 0.95, wet: 0.12, reverbSeconds: 0.9, reverbDecay: 3,
    echo: 0, delay: 0.12, feedback: 0, master: 0.78, rate: 0.94,
  },
  high: {
    hp: 140, lp: 17_500, lowFrequency: 220, lowGain: -4, highFrequency: 9_500,
    highGain: 8, peakFrequency: 4_800, peakGain: 5, peakQ: 1.1,
    threshold: -20, ratio: 2.6, attack: 0.006, release: 0.14, drive: 1.2,
    dry: 1, wet: 0.08, reverbSeconds: 0.7, reverbDecay: 2.6,
    echo: 0.05, delay: 0.11, feedback: 0.08, master: 0.86, rate: 1.04,
  },
  robot: {
    hp: 520, lp: 3_800, lowFrequency: 180, lowGain: -8, highFrequency: 3_200,
    highGain: -6, peakFrequency: 1_200, peakGain: 10, peakQ: 3.2,
    threshold: -30, ratio: 12, attack: 0.001, release: 0.05, drive: 9,
    dry: 0.9, wet: 0.05, reverbSeconds: 0.25, reverbDecay: 4,
    echo: 0.22, delay: 0.08, feedback: 0.35, master: 0.6, rate: 1.08,
  },
  distorted: {
    hp: 90, lp: 11_000, lowFrequency: 200, lowGain: 3, highFrequency: 6_000,
    highGain: 2, peakFrequency: 2_400, peakGain: 4, peakQ: 1.2,
    threshold: -28, ratio: 6, attack: 0.004, release: 0.12, drive: 11,
    dry: 1, wet: 0.04, reverbSeconds: 0.4, reverbDecay: 2.8,
    echo: 0, delay: 0.1, feedback: 0, master: 0.58, rate: 1,
  },
  chorus: {
    hp: 90, lp: 14_000, lowFrequency: 210, lowGain: 2, highFrequency: 8_000,
    highGain: 4, peakFrequency: 2_800, peakGain: 2, peakQ: 0.7,
    threshold: -21, ratio: 2.8, attack: 0.01, release: 0.2, drive: 1.3,
    dry: 0.7, wet: 0.42, reverbSeconds: 1.6, reverbDecay: 2.4,
    echo: 0.18, delay: 0.028, feedback: 0.22, master: 0.74, rate: 1.01,
  },
  echo: {
    hp: 100, lp: 13_000, lowFrequency: 200, lowGain: 0, highFrequency: 7_000,
    highGain: 2, peakFrequency: 3_000, peakGain: 1, peakQ: 0.8,
    threshold: -20, ratio: 2.5, attack: 0.01, release: 0.18, drive: 1.1,
    dry: 0.88, wet: 0.1, reverbSeconds: 0.5, reverbDecay: 2.5,
    echo: 0.55, delay: 0.28, feedback: 0.42, master: 0.78, rate: 1,
  },
  reverb: {
    hp: 75, lp: 16_000, lowFrequency: 190, lowGain: 1, highFrequency: 8_000,
    highGain: 2, peakFrequency: 2_700, peakGain: 1, peakQ: 0.7,
    threshold: -19, ratio: 2.2, attack: 0.015, release: 0.3, drive: 1.05,
    dry: 0.5, wet: 0.92, reverbSeconds: 3.6, reverbDecay: 1.9,
    echo: 0.08, delay: 0.16, feedback: 0.12, master: 0.66, rate: 1,
  },
  pitch: {
    hp: 90, lp: 15_000, lowFrequency: 200, lowGain: 1, highFrequency: 7_800,
    highGain: 3, peakFrequency: 2_600, peakGain: 3.5, peakQ: 1.4,
    threshold: -24, ratio: 5, attack: 0.004, release: 0.1, drive: 1.25,
    dry: 1, wet: 0.06, reverbSeconds: 0.55, reverbDecay: 2.8,
    echo: 0, delay: 0.1, feedback: 0, master: 0.88, rate: 1,
  },
};

export type VoicePresetNodes = {
  ctx: BaseAudioContext;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  low: BiquadFilterNode;
  high: BiquadFilterNode;
  peak: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  saturation: WaveShaperNode;
  convolver: ConvolverNode;
  dry: GainNode;
  wet: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  echo: GainNode;
  master: GainNode;
};

export function makeVoiceImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
    }
  }
  return buffer;
}

function saturationCurve(drive: number) {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const amount = 1 + Math.max(0, drive - 1) * 2;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export function applyVoicePreset(nodes: VoicePresetNodes, preset: VoicePresetKey, smooth = true) {
  const settings = VOICE_PRESET_SETTINGS[preset];
  const time = nodes.ctx.currentTime;
  const set = (param: AudioParam, value: number) => {
    if (smooth) param.setTargetAtTime(value, time, 0.025);
    else param.setValueAtTime(value, time);
  };

  nodes.hp.type = "highpass";
  nodes.lp.type = "lowpass";
  nodes.low.type = "lowshelf";
  nodes.high.type = "highshelf";
  nodes.peak.type = "peaking";
  set(nodes.hp.frequency, settings.hp);
  set(nodes.lp.frequency, settings.lp);
  set(nodes.low.frequency, settings.lowFrequency);
  set(nodes.low.gain, settings.lowGain);
  set(nodes.high.frequency, settings.highFrequency);
  set(nodes.high.gain, settings.highGain);
  set(nodes.peak.frequency, settings.peakFrequency);
  set(nodes.peak.gain, settings.peakGain);
  set(nodes.peak.Q, settings.peakQ);
  set(nodes.compressor.threshold, settings.threshold);
  set(nodes.compressor.ratio, settings.ratio);
  set(nodes.compressor.attack, settings.attack);
  set(nodes.compressor.release, settings.release);
  nodes.saturation.curve = saturationCurve(settings.drive);
  nodes.saturation.oversample = "4x";
  nodes.convolver.buffer = makeVoiceImpulse(
    nodes.ctx,
    settings.reverbSeconds,
    settings.reverbDecay
  );
  set(nodes.dry.gain, settings.dry);
  set(nodes.wet.gain, settings.wet);
  set(nodes.delay.delayTime, settings.delay);
  set(nodes.feedback.gain, settings.feedback);
  set(nodes.echo.gain, settings.echo);
  set(nodes.master.gain, settings.master);
}

export function createVoicePresetNodes(ctx: BaseAudioContext): VoicePresetNodes {
  return {
    ctx,
    hp: ctx.createBiquadFilter(),
    lp: ctx.createBiquadFilter(),
    low: ctx.createBiquadFilter(),
    high: ctx.createBiquadFilter(),
    peak: ctx.createBiquadFilter(),
    compressor: ctx.createDynamicsCompressor(),
    saturation: ctx.createWaveShaper(),
    convolver: ctx.createConvolver(),
    dry: ctx.createGain(),
    wet: ctx.createGain(),
    delay: ctx.createDelay(1),
    feedback: ctx.createGain(),
    echo: ctx.createGain(),
    master: ctx.createGain(),
  };
}

export function connectVoicePresetGraph(
  source: AudioNode,
  nodes: VoicePresetNodes,
  options: { toDestination?: boolean } = {}
) {
  const toDestination = options.toDestination !== false;
  source.connect(nodes.hp);
  nodes.hp.connect(nodes.lp);
  nodes.lp.connect(nodes.low);
  nodes.low.connect(nodes.high);
  nodes.high.connect(nodes.peak);
  nodes.peak.connect(nodes.compressor);
  nodes.compressor.connect(nodes.saturation);
  nodes.saturation.connect(nodes.dry);
  nodes.dry.connect(nodes.master);
  nodes.saturation.connect(nodes.convolver);
  nodes.convolver.connect(nodes.wet);
  nodes.wet.connect(nodes.master);
  nodes.saturation.connect(nodes.delay);
  nodes.delay.connect(nodes.echo);
  nodes.echo.connect(nodes.master);
  // Avoid a cyclic delay graph in OfflineAudioContext. Mobile Safari can leave
  // startRendering() pending forever when a feedback loop is present, even when
  // the selected preset's feedback gain is zero. Reverb + one delay tap keeps
  // the presets distinct without risking a permanently stalled render.
  if (toDestination) {
    nodes.master.connect(nodes.ctx.destination);
  }
}

export async function renderVoicePresetFile(file: File, preset: VoicePresetKey): Promise<File> {
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor || typeof OfflineAudioContext === "undefined") return file;

  const decodeContext = new AudioContextConstructor();
  try {
    const fileBuffer = await file.arrayBuffer();
    const decoded = await withAudioTimeout(
      decodeContext.decodeAudioData(fileBuffer),
      VOICE_DECODE_TIMEOUT_MS,
      "decode"
    );
    const settings = VOICE_PRESET_SETTINGS[preset];
    const tailSeconds = Math.max(settings.reverbSeconds, settings.delay * 4);
    const frameCount = Math.ceil((decoded.duration / settings.rate + tailSeconds) * decoded.sampleRate);
    const offline = new OfflineAudioContext(
      Math.min(2, Math.max(1, decoded.numberOfChannels)),
      frameCount,
      decoded.sampleRate
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = settings.rate;
    const nodes = createVoicePresetNodes(offline);
    connectVoicePresetGraph(source, nodes);
    applyVoicePreset(nodes, preset, false);
    source.start(0);
    const renderTimeout = Math.min(
      VOICE_RENDER_MAX_TIMEOUT_MS,
      Math.max(VOICE_RENDER_MIN_TIMEOUT_MS, Math.ceil(decoded.duration * 750))
    );
    const rendered = await withAudioTimeout(
      offline.startRendering(),
      renderTimeout,
      "render"
    );
    const baseName = file.name.replace(/\.[^.]+$/, "") || "voice-drop";
    return new File([audioBufferToWav(rendered)], `${baseName}-${preset}.wav`, {
      type: "audio/wav",
      lastModified: Date.now(),
    });
  } finally {
    void decodeContext.close().catch(() => {
      // Some mobile Web Audio implementations reject close() after a decode timeout.
    });
  }
}
