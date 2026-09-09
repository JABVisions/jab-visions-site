// File: app/components/board/VoiceStudio.tsx
// Drop Studio 3 — Voice Studio booth.
// Record lead vocals over an instrumental, stack adlib takes, then mix down
// into a single Voice Drop that continues through the existing audio pipeline.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VocalVisualizer from "./VocalVisualizer";
import styles from "./voiceStudio.module.css";

type TrackKind = "instrumental" | "lead" | "adlib";

type StudioTrack = {
  id: string;
  kind: TrackKind;
  label: string;
  blob: Blob;
  url: string;
  /** Seconds into the instrumental when this take started. */
  offsetSec: number;
  durationSec: number;
  muted: boolean;
};

function pickAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
      MediaRecorder.isTypeSupported(t)
    ) ?? ""
  );
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function blobToAudioBuffer(ctx: BaseAudioContext, blob: Blob) {
  const ab = await blob.arrayBuffer();
  return ctx.decodeAudioData(ab.slice(0));
}

/** Encode an AudioBuffer as a 16-bit PCM WAV File. */
function audioBufferToWavFile(buffer: AudioBuffer, name = "voice-studio-mix.wav") {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const samples = buffer.length;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new File([arrayBuffer], name, { type: "audio/wav" });
}

async function mixTracksToFile(tracks: StudioTrack[]): Promise<File> {
  const live = tracks.filter((t) => !t.muted && t.blob.size > 0);
  if (!live.length) throw new Error("Nothing to mix — unmute or record a take first.");

  const probeCtx = new OfflineAudioContext(2, 1, 44100);
  const decoded = await Promise.all(
    live.map(async (t) => ({
      track: t,
      buffer: await blobToAudioBuffer(probeCtx, t.blob),
    }))
  );

  let endSec = 0;
  for (const { track, buffer } of decoded) {
    endSec = Math.max(endSec, track.offsetSec + buffer.duration);
  }
  const sampleRate = decoded[0]?.buffer.sampleRate ?? 44100;
  const length = Math.max(1, Math.ceil(endSec * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);

  for (const { track, buffer } of decoded) {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const gain = offline.createGain();
    // Instrumental sits a touch under the vocals so leads/adlibs cut through.
    gain.gain.value = track.kind === "instrumental" ? 0.72 : track.kind === "adlib" ? 0.92 : 1;
    source.connect(gain);
    gain.connect(offline.destination);
    source.start(track.offsetSec);
  }

  const rendered = await offline.startRendering();
  return audioBufferToWavFile(rendered, `voice-studio-${Date.now()}.wav`);
}

export default function VoiceStudio({
  onComplete,
  onCancel,
}: {
  onComplete: (file: File) => void;
  onCancel?: () => void;
}) {
  const [instrumental, setInstrumental] = useState<StudioTrack | null>(null);
  const [lead, setLead] = useState<StudioTrack | null>(null);
  const [adlibs, setAdlibs] = useState<StudioTrack[]>([]);
  const [recordingKind, setRecordingKind] = useState<"lead" | "adlib" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [instPlaying, setInstPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("Load a beat, then record your lead and adlibs over it.");

  const instAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordStartOffsetRef = useRef(0);
  const recordStartedAtRef = useRef(0);

  const stopMic = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => {
    stopMic();
    if (instrumental?.url) URL.revokeObjectURL(instrumental.url);
    if (lead?.url) URL.revokeObjectURL(lead.url);
    adlibs.forEach((t) => URL.revokeObjectURL(t.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function revokeTrack(track: StudioTrack | null) {
    if (track?.url) URL.revokeObjectURL(track.url);
  }

  async function onInstrumentalFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Pick an audio instrumental (mp3, wav, m4a…).");
      return;
    }
    setError("");
    revokeTrack(instrumental);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    await new Promise<void>((resolve) => {
      audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
      audio.addEventListener("error", () => resolve(), { once: true });
    });
    setInstrumental({
      id: uid("inst"),
      kind: "instrumental",
      label: file.name.replace(/\.[^.]+$/, "") || "Instrumental",
      blob: file,
      url,
      offsetSec: 0,
      durationSec: Number.isFinite(audio.duration) ? audio.duration : 0,
      muted: false,
    });
    setNote("Instrumental locked. Record your lead vocal over the beat.");
    setInstPlaying(false);
  }

  function toggleInstrumental() {
    const el = instAudioRef.current;
    if (!el || !instrumental) return;
    if (el.paused) {
      void el.play().then(() => setInstPlaying(true)).catch(() => setError("Couldn’t play instrumental."));
    } else {
      el.pause();
      setInstPlaying(false);
    }
  }

  async function startTake(kind: "lead" | "adlib") {
    if (recordingKind) return;
    if (!instrumental) {
      setError("Load an instrumental first.");
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording isn’t supported in this browser.");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickAudioMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;

      const inst = instAudioRef.current;
      if (inst) {
        // Restart the beat from the top so takes stay aligned for the booth feel.
        inst.currentTime = 0;
        await inst.play().catch(() => undefined);
        setInstPlaying(true);
      }
      recordStartOffsetRef.current = 0;
      recordStartedAtRef.current = performance.now();

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const durationSec = Math.max(0.2, (performance.now() - recordStartedAtRef.current) / 1000);
        const url = URL.createObjectURL(blob);
        const track: StudioTrack = {
          id: uid(kind),
          kind,
          label: kind === "lead" ? "Lead Vocal" : `Adlib ${adlibs.length + 1}`,
          blob,
          url,
          offsetSec: recordStartOffsetRef.current,
          durationSec,
          muted: false,
        };
        if (kind === "lead") {
          revokeTrack(lead);
          setLead(track);
          setNote("Lead captured. Punch in adlibs, or mix when you’re ready.");
        } else {
          setAdlibs((prev) => [...prev, track]);
          setNote("Adlib stacked. Add more, or mix your session.");
        }
        stopMic();
        setRecordingKind(null);
        setElapsed(0);
        if (instAudioRef.current) {
          instAudioRef.current.pause();
          setInstPlaying(false);
        }
      };

      rec.start(100);
      setRecordingKind(kind);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      stopMic();
      setError("Microphone blocked. Allow mic access to record.");
    }
  }

  function stopTake() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function toggleMute(id: string) {
    if (instrumental?.id === id) {
      setInstrumental({ ...instrumental, muted: !instrumental.muted });
      return;
    }
    if (lead?.id === id) {
      setLead({ ...lead, muted: !lead.muted });
      return;
    }
    setAdlibs((prev) => prev.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
  }

  function removeTrack(id: string) {
    if (lead?.id === id) {
      revokeTrack(lead);
      setLead(null);
      return;
    }
    setAdlibs((prev) => {
      const hit = prev.find((t) => t.id === id);
      if (hit) revokeTrack(hit);
      return prev.filter((t) => t.id !== id);
    });
  }

  async function mixAndUse() {
    const stack: StudioTrack[] = [];
    if (instrumental) stack.push(instrumental);
    if (lead) stack.push(lead);
    stack.push(...adlibs);
    if (!lead && adlibs.length === 0) {
      setError("Record a lead vocal or at least one adlib before mixing.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("Mixing session…");
    try {
      const file = await mixTracksToFile(stack);
      setNote("Mix ready — handing off to Drop Studio.");
      onComplete(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mix failed.");
      setNote("Mix failed — try recording again.");
    } finally {
      setBusy(false);
    }
  }

  const allTracks: StudioTrack[] = [
    ...(instrumental ? [instrumental] : []),
    ...(lead ? [lead] : []),
    ...adlibs,
  ];

  return (
    <div className={styles.booth} aria-label="Voice Studio">
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Drop Studio 3 · Voice Studio</div>
          <h2 className={styles.title}>Recording Booth</h2>
          <p className={styles.sub}>{note}</p>
        </div>
        {onCancel ? (
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Close
          </button>
        ) : null}
      </header>

      <div className={styles.vizWrap}>
        <VocalVisualizer
          state={recordingKind ? "recording" : instPlaying ? "playback" : "idle"}
          stream={recordingKind ? streamRef.current : null}
        />
        {recordingKind ? (
          <div className={styles.recBadge} aria-live="polite">
            <span className={styles.recDot} />
            REC {recordingKind === "lead" ? "LEAD" : "ADLIB"} · {fmtTime(elapsed)}
          </div>
        ) : null}
      </div>

      <section className={styles.instPanel}>
        <div className={styles.panelLabel}>Instrumental</div>
        {instrumental ? (
          <div className={styles.instRow}>
            <button
              type="button"
              className={styles.playBtn}
              onClick={toggleInstrumental}
              disabled={!!recordingKind}
              aria-label={instPlaying ? "Pause instrumental" : "Play instrumental"}
            >
              {instPlaying ? "Pause" : "Play"}
            </button>
            <div className={styles.instMeta}>
              <div className={styles.instName}>{instrumental.label}</div>
              <div className={styles.instDur}>{fmtTime(instrumental.durationSec)}</div>
            </div>
            <label className={styles.swapBtn}>
              Replace
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                hidden
                disabled={!!recordingKind || busy}
                onChange={(e) => {
                  void onInstrumentalFile(e.currentTarget.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <audio
              ref={instAudioRef}
              src={instrumental.url}
              preload="metadata"
              onEnded={() => setInstPlaying(false)}
              onPause={() => setInstPlaying(false)}
              onPlay={() => setInstPlaying(true)}
            />
          </div>
        ) : (
          <label className={styles.uploadCard}>
            <span className={styles.uploadGlyph} aria-hidden>
              ♫
            </span>
            <span className={styles.uploadTitle}>Load instrumental</span>
            <span className={styles.uploadHint}>mp3 · wav · m4a — the beat you write over</span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
              hidden
              onChange={(e) => {
                void onInstrumentalFile(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </section>

      <section className={styles.actions}>
        {recordingKind ? (
          <button type="button" className={styles.stopBtn} onClick={stopTake}>
            Stop take
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.leadBtn}
              disabled={!instrumental || busy}
              onClick={() => void startTake("lead")}
            >
              {lead ? "Re-record Lead" : "Record Lead"}
            </button>
            <button
              type="button"
              className={styles.adlibBtn}
              disabled={!instrumental || busy}
              onClick={() => void startTake("adlib")}
            >
              Add Adlib
            </button>
          </>
        )}
      </section>

      <section className={styles.trackList} aria-label="Session tracks">
        <div className={styles.panelLabel}>Session</div>
        {allTracks.length === 0 ? (
          <div className={styles.emptyTracks}>No takes yet — load a beat to open the booth.</div>
        ) : (
          allTracks.map((t) => (
            <div key={t.id} className={`${styles.trackRow} ${t.muted ? styles.trackMuted : ""}`}>
              <span className={styles.trackKind}>
                {t.kind === "instrumental" ? "BEAT" : t.kind === "lead" ? "LEAD" : "ADLIB"}
              </span>
              <span className={styles.trackName}>{t.label}</span>
              <span className={styles.trackDur}>{fmtTime(t.durationSec)}</span>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => toggleMute(t.id)}
                disabled={!!recordingKind}
              >
                {t.muted ? "Unmute" : "Mute"}
              </button>
              {t.kind !== "instrumental" ? (
                <button
                  type="button"
                  className={styles.miniBtnDanger}
                  onClick={() => removeTrack(t.id)}
                  disabled={!!recordingKind}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))
        )}
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.mixBtn}
          disabled={busy || !!recordingKind || (!lead && adlibs.length === 0)}
          onClick={() => void mixAndUse()}
        >
          {busy ? "Mixing…" : "Mix & Use Vocal →"}
        </button>
      </footer>
    </div>
  );
}
