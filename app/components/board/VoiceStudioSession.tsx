"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  AlterationParams,
  AudioSession,
  LaneKind,
  SessionTrack,
  StudioPresetKey,
} from "@/lib/board/audioSession";
import { sessionDurationMs, sessionHasLane } from "@/lib/board/audioSession";
import type { VoicePresetKey } from "@/lib/board/voicePresetAudio";
import VocalVisualizer, { type VocalVisualizerState } from "./VocalVisualizer";
import VoiceStudioAddDrawer from "./VoiceStudioAddDrawer";
import VoiceStudioAdlibBar from "./VoiceStudioAdlibBar";
import VoiceStudioAlterationPanel from "./VoiceStudioAlterationPanel";
import VoiceStudioTimeline from "./VoiceStudioTimeline";
import styles from "./voiceStudioSession.module.css";

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function LaneRow({
  track,
  title,
  emptyLabel,
  status,
  visualState,
  micStream,
  analyser,
  chipLabel,
  emptyAction,
  onMute,
  onVolume,
  onRemove,
  removeDisabled,
  footer,
}: {
  track?: SessionTrack;
  title: string;
  emptyLabel: string;
  status: string;
  visualState: VocalVisualizerState;
  micStream?: MediaStream | null;
  analyser?: AnalyserNode | null;
  chipLabel: string;
  emptyAction?: {
    label: string;
    disabled?: boolean;
    title?: string;
    onClick: () => void;
  };
  onMute?: () => void;
  onVolume?: (volume: number) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  footer?: ReactNode;
}) {
  const hasClip = Boolean(track?.clips.length);
  const showEq = Boolean(micStream || analyser || hasClip);

  return (
    <section className={`${styles.lane} ${visualState === "playback" || visualState === "recording" ? styles.laneLive : ""}`}>
      <div className={styles.laneHead}>
        <span>{title}</span>
        <span className={styles.laneStatus}>{status}</span>
      </div>
      <div className={`${styles.eq} ${showEq ? "" : styles.eqEmpty}`}>
        {showEq ? (
          <VocalVisualizer
            state={visualState}
            stream={micStream ?? null}
            analyser={analyser ?? null}
            label={chipLabel}
          />
        ) : emptyAction ? (
          <button
            type="button"
            className={styles.lanePlus}
            onClick={emptyAction.onClick}
            disabled={emptyAction.disabled}
            title={emptyAction.title ?? emptyAction.label}
            aria-label={emptyAction.label}
          >
            <span className={styles.lanePlusIcon} aria-hidden>
              +
            </span>
            <span className={styles.lanePlusText}>{emptyAction.label}</span>
          </button>
        ) : (
          <div className={`${styles.wave} ${styles.waveEmpty}`} aria-hidden />
        )}
      </div>
      {track && hasClip ? (
        <div className={styles.laneTools}>
          <button type="button" aria-pressed={track.mix.muted} onClick={onMute}>
            {track.mix.muted ? "Unmute" : "Mute"}
          </button>
          <label>
            Vol
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.02}
              value={track.mix.volume}
              onChange={(event) => onVolume?.(Number(event.currentTarget.value))}
            />
          </label>
          {onRemove ? (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={onRemove}
              disabled={removeDisabled}
              title="Remove this lane"
            >
              Remove
            </button>
          ) : null}
          {emptyAction && hasClip ? (
            <button
              type="button"
              onClick={emptyAction.onClick}
              disabled={emptyAction.disabled}
              title={emptyAction.title ?? emptyAction.label}
            >
              Replace
            </button>
          ) : null}
        </div>
      ) : (
        <p className={styles.hint}>{emptyLabel}</p>
      )}
      {footer}
    </section>
  );
}

export default function VoiceStudioSession({
  session,
  recording,
  playing,
  countIn,
  error,
  headphonesOk,
  latencyMs,
  canCollapse,
  micStream = null,
  laneAnalysers = {},
  recordElapsedMs = 0,
  canUndo = false,
  canRedo = false,
  onHeadphonesOk,
  onLatencyMs,
  onInstrumental,
  onMute,
  onSolo,
  onVolume,
  onRemove,
  onPlay,
  onStopPlay,
  onRecord,
  onStopRecord,
  onCollapse,
  onNotice,
  onAdlibUpload,
  onAdlibRecord,
  onAdlibStopRecord,
  adlibRecording = false,
  onAdlibPreview,
  onAdlibRename,
  onAdlibDuplicate,
  onAdlibDelete,
  onAdlibMove,
  onAdlibFade,
  onVocalPreset,
  onVocalAlteration,
  onPreviewPreset,
  presetPreviewing = false,
  onScrub,
  onMoveClip,
  onTrimClip,
  onSplitSelected,
  onDeleteSelected,
  onDuplicateSelected,
  onRestoreSelected,
  onUndo,
  onRedo,
  onLoopChange,
}: {
  session: AudioSession;
  recording: boolean;
  playing: boolean;
  countIn: number | null;
  error: string;
  headphonesOk: boolean;
  latencyMs: number;
  canCollapse: boolean;
  micStream?: MediaStream | null;
  laneAnalysers?: Partial<Record<LaneKind, AnalyserNode | null>>;
  recordElapsedMs?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onHeadphonesOk: (value: boolean) => void;
  onLatencyMs: (value: number) => void;
  onInstrumental: (file: File) => void;
  onMute: (trackId: string) => void;
  onSolo: (trackId: string) => void;
  onVolume: (trackId: string, volume: number) => void;
  onRemove: (kind: LaneKind) => void;
  onPlay: () => void;
  onStopPlay: () => void;
  onRecord: () => void;
  onStopRecord: () => void;
  onCollapse: () => void;
  onNotice: (message: string) => void;
  onAdlibUpload: (file: File) => void;
  onAdlibRecord: () => void;
  onAdlibStopRecord: () => void;
  adlibRecording?: boolean;
  onAdlibPreview: (trackId: string) => void;
  onAdlibRename: (trackId: string, name: string) => void;
  onAdlibDuplicate: (trackId: string) => void;
  onAdlibDelete: (trackId: string) => void;
  onAdlibMove: (trackId: string, direction: -1 | 1) => void;
  onAdlibFade: (trackId: string, fadeInMs: number, fadeOutMs: number) => void;
  onVocalPreset: (preset: VoicePresetKey) => void;
  onVocalAlteration: (patch: Partial<AlterationParams>) => void;
  onPreviewPreset: () => void;
  presetPreviewing?: boolean;
  onScrub: (ms: number) => void;
  onMoveClip: (trackId: string, clipId: string, offsetMs: number) => void;
  onTrimClip: (trackId: string, clipId: string, trimInMs: number, trimOutMs: number) => void;
  onSplitSelected: (trackId: string, clipId: string) => void;
  onDeleteSelected: (trackId: string, clipId: string) => void;
  onDuplicateSelected: (trackId: string, clipId: string) => void;
  onRestoreSelected: (trackId: string, clipId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoopChange?: (loop: boolean) => void;
}) {
  const [instrumentalPickerOpen, setInstrumentalPickerOpen] = useState(false);
  const [adlibsOpen, setAdlibsOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(null);
  const loopOn = Boolean(session.loop);

  const vocal = session.tracks.find((track) => track.kind === "vocal");
  const instrumental = session.tracks.find((track) => track.kind === "instrumental");
  const adlibs = session.tracks.filter((track) => track.kind === "adlib" || track.kind === "fx");
  const hasBeat = sessionHasLane(session, "instrumental");
  const hasVocal = sessionHasLane(session, "vocal");
  const countingIn = countIn != null;
  const canAddInstrumental = !recording && !countingIn;
  const vocalPreset: StudioPresetKey = vocal?.mix.preset ?? "clean";

  useEffect(() => {
    if (!recording) return;
    // Visual only — Stage owns the authoritative elapsed clock when provided.
  }, [recording]);

  const instrumentalLive =
    playing && Boolean(laneAnalysers.instrumental) && !(instrumental?.mix.muted);
  const vocalRecording =
    (recording || countingIn) && (Boolean(micStream) || Boolean(laneAnalysers.vocal));
  const vocalPlayback =
    playing && !recording && Boolean(laneAnalysers.vocal) && !(vocal?.mix.muted);

  let vocalState: VocalVisualizerState = "idle";
  let vocalStatus = "EMPTY";
  let vocalChip = "Vocals";
  if (vocalRecording) {
    vocalState = "recording";
    vocalStatus = countingIn ? "COUNT-IN" : "RECORDING";
    vocalChip = "Listening";
  } else if (vocalPlayback) {
    vocalState = "playback";
    vocalStatus = "PLAYING";
    vocalChip = "Playing";
  } else if (hasVocal) {
    vocalState = "saved";
    vocalStatus = vocal?.mix.muted ? "MUTED" : "READY";
    vocalChip = "Vocal";
  }

  let beatState: VocalVisualizerState = "idle";
  let beatStatus = "EMPTY";
  let beatChip = "Beat";
  if (instrumentalLive || (playing && hasBeat && countingIn)) {
    beatState = "playback";
    beatStatus = countingIn ? "COUNT-IN" : "PLAYING";
    beatChip = "Playing";
  } else if (hasBeat) {
    beatState = "saved";
    beatStatus = instrumental?.mix.muted ? "MUTED" : "READY";
    beatChip = "Instrumental";
  }

  return (
    <div className={styles.session}>
      <div className={styles.head}>
        <span className={styles.brand}>VOICE STUDIO</span>
        <span className={styles.clock}>
          {recording || countingIn
            ? `REC ${clock(recordElapsedMs)}`
            : `${clock(session.playheadMs)} / ${clock(sessionDurationMs(session))}`}
        </span>
      </div>

      {hasBeat ? (
        <div className={styles.headphones}>
          Tip: use headphones so the instrumental does not leak into the vocal mic.
          <label>
            <input
              type="checkbox"
              checked={headphonesOk}
              onChange={(event) => onHeadphonesOk(event.currentTarget.checked)}
            />
            Headphones are on
          </label>
        </div>
      ) : null}

      <LaneRow
        track={vocal}
        title="VOCALS"
        emptyLabel={
          hasBeat ? "Tap + to record your vocal over the beat" : "Tap + to record a vocal take"
        }
        status={vocalStatus}
        visualState={vocalState}
        micStream={null}
        analyser={vocalRecording || vocalPlayback ? laneAnalysers.vocal ?? null : null}
        chipLabel={vocalChip}
        emptyAction={
          !hasVocal && !vocalRecording
            ? {
                label: hasBeat ? "Record over beat" : "Record vocal",
                disabled: recording || countingIn,
                title: hasBeat ? "Record vocal over the beat" : "Record a vocal take",
                onClick: onRecord,
              }
            : undefined
        }
        onMute={vocal ? () => onMute(vocal.id) : undefined}
        onVolume={vocal ? (volume) => onVolume(vocal.id, volume) : undefined}
        onRemove={hasVocal ? () => onRemove("vocal") : undefined}
        removeDisabled={recording || countingIn}
      />
      <LaneRow
        track={instrumental}
        title="INSTRUMENTAL"
        emptyLabel="Tap + to add a song under this vocal"
        status={beatStatus}
        visualState={beatState}
        analyser={instrumentalLive || (playing && hasBeat) ? laneAnalysers.instrumental : null}
        chipLabel={beatChip}
        emptyAction={
          canAddInstrumental
            ? {
                label: "Add song",
                disabled: false,
                title: "Add an instrumental / song",
                onClick: () => setInstrumentalPickerOpen(true),
              }
            : undefined
        }
        onMute={instrumental ? () => onMute(instrumental.id) : undefined}
        onVolume={instrumental ? (volume) => onVolume(instrumental.id, volume) : undefined}
        onRemove={hasBeat ? () => onRemove("instrumental") : undefined}
        removeDisabled={recording || countingIn}
        footer={
          <VoiceStudioAddDrawer
            open={instrumentalPickerOpen}
            onOpenChange={setInstrumentalPickerOpen}
            hideTrigger
            onFile={(file) => {
              onInstrumental(file);
              setInstrumentalPickerOpen(false);
            }}
            onNotice={onNotice}
          />
        }
      />

      <VoiceStudioAdlibBar
        open={adlibsOpen}
        tracks={adlibs}
        recordingSlot={adlibRecording}
        onToggle={() => setAdlibsOpen((value) => !value)}
        onRecordSlot={onAdlibRecord}
        onStopRecord={onAdlibStopRecord}
        onUpload={onAdlibUpload}
        onPreview={onAdlibPreview}
        onRename={onAdlibRename}
        onDuplicate={onAdlibDuplicate}
        onMute={onMute}
        onSolo={onSolo}
        onVolume={onVolume}
        onFade={onAdlibFade}
        onDelete={onAdlibDelete}
        onMoveEarlier={(trackId) => onAdlibMove(trackId, -1)}
        onMoveLater={(trackId) => onAdlibMove(trackId, 1)}
      />

      <VoiceStudioTimeline
        session={session}
        playheadMs={session.playheadMs}
        zoom={zoom}
        selected={selected}
        onZoom={setZoom}
        onSelect={(trackId, clipId) => setSelected({ trackId, clipId })}
        onScrub={onScrub}
        onMoveClip={onMoveClip}
        onTrimClip={onTrimClip}
        onSplit={() => selected && onSplitSelected(selected.trackId, selected.clipId)}
        onDelete={() => selected && onDeleteSelected(selected.trackId, selected.clipId)}
        onDuplicate={() => selected && onDuplicateSelected(selected.trackId, selected.clipId)}
        onRestore={() => selected && onRestoreSelected(selected.trackId, selected.clipId)}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAdlibUpload={onAdlibUpload}
        onAdlibRecord={onAdlibRecord}
        onAdlibStopRecord={onAdlibStopRecord}
        adlibRecording={adlibRecording}
      />

      <VoiceStudioAlterationPanel
        open={voicePanelOpen}
        preset={vocalPreset}
        alteration={vocal?.mix.alteration}
        onClose={() => setVoicePanelOpen(false)}
        onPreset={onVocalPreset}
        onAlteration={onVocalAlteration}
        onPreview={onPreviewPreset}
        previewing={presetPreviewing}
      />

      {countIn != null ? <div className={styles.countIn}>{countIn}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <label className={styles.latency}>
        If the take feels late, nudge it earlier ({latencyMs}ms)
        <input
          type="range"
          min={0}
          max={400}
          step={10}
          value={latencyMs}
          onChange={(event) => onLatencyMs(Number(event.currentTarget.value))}
        />
      </label>

      <div className={styles.transport}>
        <button
          type="button"
          className={styles.ghost}
          onClick={playing ? onStopPlay : onPlay}
          disabled={recording || countingIn}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => onScrub(0)}
          disabled={recording || countingIn}
        >
          Restart
        </button>
        <button
          type="button"
          className={styles.ghost}
          aria-pressed={loopOn}
          onClick={() => onLoopChange?.(!loopOn)}
          disabled={recording || countingIn}
        >
          Loop
        </button>
        {recording || countingIn ? (
          <button type="button" className={`${styles.record} ${styles.recordLive}`} onClick={onStopRecord}>
            Stop {clock(recordElapsedMs)}
          </button>
        ) : (
          <button type="button" className={styles.record} onClick={onRecord}>
            Record
          </button>
        )}
        <button
          type="button"
          className={`${styles.ghost} ${voicePanelOpen ? styles.ghostOn : ""}`}
          onClick={() => setVoicePanelOpen((value) => !value)}
          disabled={recording || countingIn}
          title="Vocal alteration presets"
        >
          Voice
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={onCollapse}
          disabled={!canCollapse || recording || countingIn}
          title={canCollapse ? "Back to Voice Mode" : "This session has an instrumental — mix it from Studio"}
        >
          Back
        </button>
      </div>
    </div>
  );
}
