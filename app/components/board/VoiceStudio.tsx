// Voice Studio — the recording booth that extends Drop Studio's Voice mode.
//
// Layers stay separate (instrumental, lead, ad-libs) with their own trim window
// and placement until you mix down, so takes remain editable right up to save.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VocalVisualizer from "./VocalVisualizer";
import {
  formatClock,
  peaksFromBlob,
  preferredRecordingMime,
  probeDuration,
  renderVoiceMixFile,
  trimmedDuration,
  type VoiceTrack,
  type VoiceTrackKind,
} from "@/lib/audio/voiceMix";
import { VOCAL_PRESETS, type VocalPresetKey } from "@/lib/audio/vocalPresets";
import styles from "./voiceStudio.module.css";

const MAX_OFFSET_SEC = 30;

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultGain(kind: VoiceTrackKind) {
  if (kind === "instrumental") return 0.72;
  if (kind === "adlib") return 0.92;
  return 1;
}

function ClipWave({ track, peaks }: { track: VoiceTrack; peaks: number[] | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!peaks?.length) {
      ctx.fillStyle = "rgba(236, 255, 251, 0.18)";
      ctx.fillRect(0, height / 2 - 1, width, 2);
      return;
    }

    const startRatio = track.durationSec ? track.trimStartSec / track.durationSec : 0;
    const endRatio = track.durationSec ? track.trimEndSec / track.durationSec : 1;
    const barWidth = width / peaks.length;

    peaks.forEach((peak, index) => {
      const ratio = index / peaks.length;
      const inWindow = ratio >= startRatio && ratio <= endRatio;
      const barHeight = Math.max(2, peak * (height - 4));
      ctx.fillStyle = inWindow ? "rgba(126, 226, 255, 0.85)" : "rgba(236, 255, 251, 0.16)";
      ctx.fillRect(index * barWidth, (height - barHeight) / 2, Math.max(1, barWidth - 1), barHeight);
    });
  }, [peaks, track.trimStartSec, track.trimEndSec, track.durationSec]);

  return <canvas ref={canvasRef} className={styles.wave} aria-hidden />;
}

export default function VoiceStudio({
  onComplete,
  onCancel,
}: {
  onComplete: (file: File) => void;
  onCancel?: () => void;
}) {
  const [tracks, setTracks] = useState<VoiceTrack[]>([]);
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [presetKey, setPresetKey] = useState<VocalPresetKey>("clean");
  const [presetOpen, setPresetOpen] = useState(false);
  const [recordingKind, setRecordingKind] = useState<VoiceTrackKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [auditionId, setAuditionId] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);
  const auditionRef = useRef<HTMLAudioElement | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");

  const instrumental = tracks.find((track) => track.kind === "instrumental");
  const lead = tracks.find((track) => track.kind === "lead");
  const adlibs = useMemo(() => tracks.filter((track) => track.kind === "adlib"), [tracks]);

  const timelineSec = useMemo(
    () =>
      tracks.reduce(
        (longest, track) => Math.max(longest, track.offsetSec + trimmedDuration(track)),
        0
      ),
    [tracks]
  );

  const stopElapsed = useCallback(() => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }, []);

  useEffect(
    () => () => {
      stopElapsed();
      releaseMic();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [stopElapsed, releaseMic]
  );

  const addTrack = useCallback(
    async (kind: VoiceTrackKind, blob: Blob, label: string) => {
      const durationSec = (await probeDuration(blob)) || 0;
      const id = uid(kind);
      const track: VoiceTrack = {
        id,
        kind,
        label,
        blob,
        url: URL.createObjectURL(blob),
        offsetSec: 0,
        trimStartSec: 0,
        trimEndSec: durationSec,
        durationSec,
        muted: false,
        gain: defaultGain(kind),
      };
      setTracks((prev) => [...prev.filter((t) => !(kind !== "adlib" && t.kind === kind)), track]);
      clearPreview();
      void peaksFromBlob(blob).then((data) => {
        if (data) setPeaks((prev) => ({ ...prev, [id]: Array.from(data) }));
      });
    },
    [clearPreview]
  );

  const updateTrack = useCallback((id: string, patch: Partial<VoiceTrack>) => {
    setTracks((prev) => prev.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }, []);

  const removeTrack = useCallback(
    (id: string) => {
      setTracks((prev) => {
        const target = prev.find((track) => track.id === id);
        if (target?.url) URL.revokeObjectURL(target.url);
        return prev.filter((track) => track.id !== id);
      });
      setPeaks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      clearPreview();
    },
    [clearPreview]
  );

  const stopTake = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const startTake = useCallback(
    async (kind: VoiceTrackKind) => {
      if (recordingKind) return;
      setError("");
      clearPreview();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mimeType = preferredRecordingMime();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          stopElapsed();
          releaseMic();
          const beat = instrumentalRef.current;
          if (beat) {
            beat.pause();
            beat.currentTime = 0;
          }
          const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
          chunksRef.current = [];
          setRecordingKind(null);
          setElapsed(0);
          if (blob.size > 0) {
            void addTrack(kind, blob, kind === "lead" ? "Lead vocal" : `Ad-lib ${adlibs.length + 1}`);
          }
        };

        // The beat restarts with every take so layers line up at zero.
        const beat = instrumentalRef.current;
        if (beat && instrumental && !instrumental.muted) {
          beat.currentTime = instrumental.trimStartSec;
          void beat.play().catch(() => undefined);
        }

        recorder.start(100);
        setRecordingKind(kind);
        setElapsed(0);
        const startedAt = Date.now();
        elapsedTimerRef.current = window.setInterval(() => {
          setElapsed((Date.now() - startedAt) / 1000);
        }, 200);
      } catch {
        releaseMic();
        setError("Board needs microphone access to record.");
      }
    },
    [recordingKind, adlibs.length, instrumental, addTrack, clearPreview, releaseMic, stopElapsed]
  );

  const auditionClip = useCallback(
    (track: VoiceTrack) => {
      const player = auditionRef.current;
      if (!player) return;
      if (auditionId === track.id) {
        player.pause();
        setAuditionId("");
        return;
      }
      player.src = track.url;
      player.currentTime = track.trimStartSec;
      setAuditionId(track.id);
      void player.play().catch(() => setAuditionId(""));
    },
    [auditionId]
  );

  const buildPreview = useCallback(async () => {
    setError("");
    setBusy("Mixing preview…");
    try {
      const file = await renderVoiceMixFile(tracks, presetKey);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (mixError) {
      setError(mixError instanceof Error ? mixError.message : "Couldn't build the preview.");
    } finally {
      setBusy("");
    }
  }, [tracks, presetKey]);

  const saveMix = useCallback(async () => {
    setError("");
    setBusy("Mixing down…");
    try {
      const file = await renderVoiceMixFile(tracks, presetKey);
      onComplete(file);
    } catch (mixError) {
      setError(mixError instanceof Error ? mixError.message : "Couldn't mix this down.");
    } finally {
      setBusy("");
    }
  }, [tracks, presetKey, onComplete]);

  const renderClip = (track: VoiceTrack, options?: { compact?: boolean }) => {
    const window = trimmedDuration(track);
    return (
      <div key={track.id} className={`${styles.clip} ${options?.compact ? styles.clipCompact : ""}`}>
        <div className={styles.clipHead}>
          <span className={styles.clipLabel}>{track.label}</span>
          <span className={styles.clipTime}>
            {formatClock(window)} / {formatClock(track.durationSec)}
          </span>
          <div className={styles.clipActions}>
            <button
              type="button"
              className={styles.clipBtn}
              onClick={() => auditionClip(track)}
              aria-label={auditionId === track.id ? `Stop ${track.label}` : `Play ${track.label}`}
            >
              {auditionId === track.id ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              className={`${styles.clipBtn} ${track.muted ? styles.clipBtnOn : ""}`}
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              aria-pressed={track.muted}
              aria-label={`${track.muted ? "Unmute" : "Mute"} ${track.label}`}
            >
              {track.muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              className={styles.clipBtn}
              onClick={() => removeTrack(track.id)}
              aria-label={`Delete ${track.label}`}
            >
              ✕
            </button>
          </div>
        </div>

        <ClipWave track={track} peaks={peaks[track.id]} />

        <div className={styles.clipControls}>
          <label className={styles.clipRange}>
            <span>In</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, track.durationSec)}
              step={0.05}
              value={track.trimStartSec}
              onChange={(e) => {
                const next = Math.min(Number(e.target.value), track.trimEndSec - 0.1);
                updateTrack(track.id, { trimStartSec: Math.max(0, next) });
                clearPreview();
              }}
            />
          </label>
          <label className={styles.clipRange}>
            <span>Out</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, track.durationSec)}
              step={0.05}
              value={track.trimEndSec}
              onChange={(e) => {
                const next = Math.max(Number(e.target.value), track.trimStartSec + 0.1);
                updateTrack(track.id, { trimEndSec: Math.min(track.durationSec, next) });
                clearPreview();
              }}
            />
          </label>
          {track.kind === "instrumental" ? null : (
            <label className={styles.clipRange}>
              <span>Place</span>
              <input
                type="range"
                min={0}
                max={MAX_OFFSET_SEC}
                step={0.05}
                value={track.offsetSec}
                onChange={(e) => {
                  updateTrack(track.id, { offsetSec: Number(e.target.value) });
                  clearPreview();
                }}
              />
            </label>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.booth} aria-label="Voice Studio">
      <div className={styles.boothHead}>
        <div className={styles.boothTitle}>
          <span className={styles.boothDot} aria-hidden />
          VOICE STUDIO
        </div>
        <span className={styles.boothMeta}>
          {recordingKind
            ? `Recording ${formatClock(elapsed)}`
            : timelineSec > 0
              ? `Timeline ${formatClock(timelineSec)}`
              : "Layer a beat, a lead, and ad-libs"}
        </span>
      </div>

      <div className={styles.viz}>
        <VocalVisualizer
          state={recordingKind ? "recording" : tracks.length ? "saved" : "idle"}
          stream={recordingKind ? streamRef.current : null}
        />
      </div>

      <div className={styles.transport}>
        <button
          type="button"
          className={styles.importBtn}
          onClick={() => importRef.current?.click()}
          disabled={!!recordingKind}
        >
          🎼 {instrumental ? "Replace beat" : "Add beat"}
        </button>
        <input
          ref={importRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void addTrack("instrumental", file, file.name || "Instrumental");
          }}
        />

        <button
          type="button"
          className={`${styles.recordBtn} ${recordingKind === "lead" ? styles.recordBtnOn : ""}`}
          onClick={() => (recordingKind ? stopTake() : void startTake("lead"))}
          aria-label={recordingKind ? "Stop recording" : lead ? "Re-record lead vocal" : "Record lead vocal"}
        >
          {recordingKind ? "■" : "●"}
        </button>

        <button
          type="button"
          className={`${styles.voiceBtn} ${presetOpen ? styles.voiceBtnOn : ""}`}
          onClick={() => setPresetOpen((open) => !open)}
          aria-expanded={presetOpen}
        >
          🎚 Voice
        </button>
      </div>

      {presetOpen ? (
        <div className={styles.presets} role="listbox" aria-label="Vocal presets">
          {VOCAL_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              role="option"
              aria-selected={presetKey === preset.key}
              className={`${styles.preset} ${presetKey === preset.key ? styles.presetOn : ""}`}
              onClick={() => {
                setPresetKey(preset.key);
                clearPreview();
              }}
              title={preset.hint}
            >
              <span className={styles.presetName}>{preset.label}</span>
              <small className={styles.presetHint}>{preset.hint}</small>
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.layers}>
        {instrumental ? renderClip(instrumental) : null}
        {lead ? renderClip(lead) : null}
      </div>

      <div className={styles.adlibBar}>
        <div className={styles.adlibHead}>
          <span className={styles.adlibTitle}>Ad-Libs</span>
          <button
            type="button"
            className={styles.adlibAdd}
            onClick={() => (recordingKind ? stopTake() : void startTake("adlib"))}
            disabled={recordingKind === "lead"}
          >
            {recordingKind === "adlib" ? "■ Stop" : "● Record ad-lib"}
          </button>
        </div>
        {adlibs.length ? (
          <div className={styles.adlibClips}>
            {adlibs.map((track) => renderClip(track, { compact: true }))}
          </div>
        ) : (
          <p className={styles.adlibEmpty}>
            Stack short takes here — each stays trimmable and movable until you mix down.
          </p>
        )}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {busy ? <div className={styles.busy}>{busy}</div> : null}

      {previewUrl ? (
        <audio className={styles.preview} src={previewUrl} controls preload="metadata" />
      ) : null}

      <div className={styles.boothActions}>
        {onCancel ? (
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className={styles.ghost}
          onClick={() => void buildPreview()}
          disabled={!tracks.length || !!recordingKind || !!busy}
        >
          Preview mix
        </button>
        <button
          type="button"
          className={styles.save}
          onClick={() => void saveMix()}
          disabled={!tracks.length || !!recordingKind || !!busy}
        >
          Use this mix →
        </button>
      </div>

      <audio ref={instrumentalRef} src={instrumental?.url} preload="auto" hidden />
      <audio ref={auditionRef} onEnded={() => setAuditionId("")} preload="none" hidden />
    </div>
  );
}
