/** Mic constraints for singing/rapping over a beat. Soft ideals — hard `false`
 *  values get rejected on some devices and can yield a dead input. */
export const MUSIC_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: false },
  noiseSuppression: { ideal: false },
  // Keep AGC available — laptop mics are often very quiet without it.
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
};

export const STUDIO_COUNT_IN_MS = 3000;
/** Preamp into the PCM capture path (raw laptop mics run very cold). */
export const STUDIO_MIC_INPUT_GAIN = 10;
/** Peak-normalize quiet takes up toward this level (0..1). */
export const STUDIO_TAKE_TARGET_PEAK = 0.88;
/** Cap on normalize boost so a near-silent room doesn't become hiss. */
export const STUDIO_TAKE_MAX_NORMALIZE = 14;

export function preferredStudioAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) ?? ""
  );
}

export function studioAudioExtension(mime: string) {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export async function getMusicMicStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording is not supported in this browser.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: MUSIC_MIC_CONSTRAINTS });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/** Clone mic tracks for meters that must not share the capture stream. */
export function cloneStreamForMeter(stream: MediaStream) {
  const tracks = stream.getAudioTracks().map((track) => track.clone());
  return new MediaStream(tracks);
}

function normalizeTake(samples: Float32Array, peak: number): Float32Array {
  if (!samples.length || peak < 0.0008) return samples;
  if (peak >= STUDIO_TAKE_TARGET_PEAK) return samples;
  const gain = Math.min(STUDIO_TAKE_MAX_NORMALIZE, STUDIO_TAKE_TARGET_PEAK / peak);
  if (gain <= 1.05) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = (samples[i] ?? 0) * gain;
    if (sample > 1) out[i] = 1;
    else if (sample < -1) out[i] = -1;
    else out[i] = sample;
  }
  return out;
}

function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const frames = samples.length;
  if (!frames) return new Blob([], { type: "audio/wav" });

  const channels = 1;
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
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([output], { type: "audio/wav" });
}

/**
 * Capture the mic as PCM through the same AudioContext that plays the beat.
 * MediaRecorder is intentionally avoided — Chromium often records silence from
 * getUserMedia / MediaStreamDestination while Web Audio is outputting.
 */
export type StudioTakeCapture = {
  mimeType: "audio/wav";
  analyser: AnalyserNode;
  start: () => void;
  isRecording: () => boolean;
  /** Peak mic level seen while armed (0..1). */
  peakLevel: () => number;
  stop: () => Blob;
  dispose: () => void;
};

export function createStudioTakeCapture(
  ctx: AudioContext,
  micStream: MediaStream
): StudioTakeCapture {
  const source = ctx.createMediaStreamSource(micStream);
  const inputGain = ctx.createGain();
  inputGain.gain.value = STUDIO_MIC_INPUT_GAIN;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.42;

  // ScriptProcessor is deprecated but is the reliable cross-browser path for
  // PCM capture while another graph is playing through the same context.
  // It MUST be connected to destination (even muted) or Chrome skips callbacks.
  const bufferSize = 8192;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  let captured = new Float32Array(Math.max(1, Math.floor(ctx.sampleRate * 8)));
  let capturedLength = 0;
  let armed = false;
  let disposed = false;
  let peak = 0;

  processor.onaudioprocess = (event) => {
    if (!armed || disposed) return;
    const input = event.inputBuffer.getChannelData(0);
    const nextLen = capturedLength + input.length;
    if (nextLen > captured.length) {
      const grown = new Float32Array(Math.max(nextLen, captured.length * 2));
      grown.set(captured.subarray(0, capturedLength));
      captured = grown;
    }
    captured.set(input, capturedLength);
    capturedLength = nextLen;
    for (let i = 0; i < input.length; i += 1) {
      const v = Math.abs(input[i] ?? 0);
      if (v > peak) peak = v;
    }
  };

  // Mic → preamp → meter + PCM capture (never monitored to speakers).
  source.connect(inputGain);
  inputGain.connect(analyser);
  inputGain.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  return {
    mimeType: "audio/wav",
    analyser,
    start() {
      if (disposed) return;
      armed = true;
      peak = 0;
      capturedLength = 0;
    },
    isRecording() {
      return armed && !disposed;
    },
    peakLevel() {
      return peak;
    },
    stop() {
      armed = false;
      const samples = capturedLength
        ? captured.subarray(0, capturedLength)
        : new Float32Array(0);
      const normalized = normalizeTake(samples, peak);
      return floatToWavBlob(normalized, ctx.sampleRate);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      armed = false;
      processor.onaudioprocess = null;
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      try {
        inputGain.disconnect();
      } catch {
        // already disconnected
      }
      try {
        analyser.disconnect();
      } catch {
        // already disconnected
      }
      try {
        processor.disconnect();
      } catch {
        // already disconnected
      }
      try {
        mute.disconnect();
      } catch {
        // already disconnected
      }
      micStream.getTracks().forEach((track) => track.stop());
    },
  };
}

/** Legacy MediaRecorder helper for non-studio paths. */
export function createStudioRecorder(
  stream: MediaStream,
  onChunk: (blob: Blob) => void
) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Recording isn't supported in this browser.");
  }
  const mimeType = preferredStudioAudioMime();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) onChunk(event.data);
  };
  return {
    recorder,
    mimeType: recorder.mimeType || mimeType || "audio/webm",
    start() {
      if (recorder.state !== "inactive") return;
      try {
        recorder.start(250);
      } catch {
        try {
          recorder.start();
        } catch {
          // Caller will see an empty take.
        }
      }
    },
  };
}
