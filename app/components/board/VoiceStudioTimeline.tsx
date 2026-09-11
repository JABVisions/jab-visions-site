"use client";

import { useRef, useState } from "react";
import type { AudioSession, SessionTrack } from "@/lib/board/audioSession";
import { clipPlayableMs, sessionDurationMs } from "@/lib/board/audioSession";
import styles from "./voiceStudioSession.module.css";

const LANE_LABEL_WIDTH = 78;

function clock(ms: number, precise = false) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const base = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  return precise ? `${base}.${String(safe % 1000).padStart(3, "0")}` : base;
}

export default function VoiceStudioTimeline({
  session,
  playheadMs,
  zoom,
  selected,
  onZoom,
  onSelect,
  onScrub,
  onMoveClip,
  onTrimClip,
  onSplit,
  onDelete,
  onDuplicate,
  onRestore,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAdlibUpload,
  onAdlibRecord,
  onAdlibStopRecord,
  adlibRecording,
}: {
  session: AudioSession;
  playheadMs: number;
  zoom: number;
  selected: { trackId: string; clipId: string } | null;
  onZoom: (zoom: number) => void;
  onSelect: (trackId: string, clipId: string) => void;
  onScrub: (ms: number) => void;
  onMoveClip: (trackId: string, clipId: string, offsetMs: number) => void;
  onTrimClip: (trackId: string, clipId: string, trimInMs: number, trimOutMs: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRestore: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAdlibUpload: (file: File) => void;
  onAdlibRecord: () => void;
  onAdlibStopRecord: () => void;
  adlibRecording: boolean;
}) {
  const adlibFileRef = useRef<HTMLInputElement | null>(null);
  const duration = Math.max(sessionDurationMs(session), 4_000);
  const pxPerMs = (0.04 * zoom) / 100;
  const width = Math.max(320, LANE_LABEL_WIDTH + duration * pxPerMs);
  const tracks = session.tracks.filter((track) => track.clips.length > 0);
  const selectedTrack = selected
    ? session.tracks.find((track) => track.id === selected.trackId)
    : undefined;
  const selectedClip = selectedTrack?.clips.find((clip) => clip.id === selected?.clipId);
  const tickMs = zoom >= 180 ? 500 : zoom <= 70 ? 2_000 : 1_000;
  const ticks = Array.from(
    { length: Math.floor(duration / tickMs) + 1 },
    (_, index) => index * tickMs
  );

  return (
    <section className={styles.timelineShell} aria-label="Voice timeline editor">
      <div className={styles.timelineHead}>
        <span>Timeline</span>
        <div className={styles.timelineTools}>
          <button type="button" disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={onRedo}>
            Redo
          </button>
          <button type="button" onClick={onSplit} disabled={!selected}>
            Split
          </button>
          <button type="button" onClick={onDuplicate} disabled={!selected}>
            Dup
          </button>
          <button type="button" onClick={onDelete} disabled={!selected}>
            Delete
          </button>
          <button type="button" onClick={onRestore} disabled={!selected}>
            Restore
          </button>
          <button type="button" onClick={() => adlibFileRef.current?.click()}>
            Ad-Lib +
          </button>
          <button
            type="button"
            aria-pressed={adlibRecording}
            onClick={adlibRecording ? onAdlibStopRecord : onAdlibRecord}
          >
            {adlibRecording ? "Stop FX" : "Record FX"}
          </button>
          <input
            ref={adlibFileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onAdlibUpload(file);
            }}
          />
          <label>
            Zoom
            <input
              type="range"
              min={50}
              max={250}
              value={zoom}
              onChange={(event) => onZoom(Number(event.currentTarget.value))}
            />
          </label>
        </div>
      </div>

      {selectedClip && selectedTrack ? (
        <div className={styles.clipPositionBar}>
          <span className={styles.clipPositionName}>
            {selectedClip.name || selectedTrack.label || selectedTrack.kind}
          </span>
          <span className={styles.clipPositionTime}>{clock(selectedClip.offsetMs, true)}</span>
          <button
            type="button"
            onClick={() =>
              onMoveClip(selectedTrack.id, selectedClip.id, Math.max(0, selectedClip.offsetMs - 250))
            }
          >
            −0.25s
          </button>
          <button
            type="button"
            onClick={() => onMoveClip(selectedTrack.id, selectedClip.id, selectedClip.offsetMs + 250)}
          >
            +0.25s
          </button>
          <button
            type="button"
            onClick={() => onMoveClip(selectedTrack.id, selectedClip.id, Math.max(0, playheadMs))}
          >
            At playhead
          </button>
        </div>
      ) : (
        <p className={styles.timelineHint}>Tap a clip to move it. Ad-libs are added at the playhead.</p>
      )}

      <div className={styles.timelineScroll}>
        <div
          className={styles.timelineCanvas}
          style={{ width }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left - LANE_LABEL_WIDTH;
            onScrub(Math.max(0, Math.min(duration, x / pxPerMs)));
          }}
        >
          <div className={styles.timelineRuler} aria-hidden>
            <span className={styles.timelineRulerLabel}>TIME</span>
            <div className={styles.timelineRulerTrack}>
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className={styles.timelineTick}
                  style={{ left: tick * pxPerMs }}
                >
                  <i />
                  <b>{clock(tick, tickMs < 1000)}</b>
                </span>
              ))}
            </div>
          </div>
          <div
            className={styles.playhead}
            style={{ left: LANE_LABEL_WIDTH + playheadMs * pxPerMs }}
          >
            <span>{clock(playheadMs, true)}</span>
          </div>
          {tracks.map((track) => (
            <TimelineLane
              key={track.id}
              track={track}
              pxPerMs={pxPerMs}
              selected={selected}
              onSelect={onSelect}
              onMoveClip={onMoveClip}
              onTrimClip={onTrimClip}
            />
          ))}
        </div>
      </div>
      <div className={styles.timelineMeta}>
        <span>{clock(playheadMs, true)}</span>
        <span>/ {clock(duration)}</span>
      </div>
    </section>
  );
}

function TimelineLane({
  track,
  pxPerMs,
  selected,
  onSelect,
  onMoveClip,
  onTrimClip,
}: {
  track: SessionTrack;
  pxPerMs: number;
  selected: { trackId: string; clipId: string } | null;
  onSelect: (trackId: string, clipId: string) => void;
  onMoveClip: (trackId: string, clipId: string, offsetMs: number) => void;
  onTrimClip: (trackId: string, clipId: string, trimInMs: number, trimOutMs: number) => void;
}) {
  const [movingClip, setMovingClip] = useState<{ clipId: string; offsetMs: number } | null>(null);

  return (
    <div className={`${styles.timelineLane} ${styles[`laneKind_${track.kind}`] || ""}`}>
      <span className={styles.timelineLaneLabel}>{track.label || track.kind}</span>
      <div className={styles.timelineLaneTrack}>
        {track.clips.map((clip) => {
          const playable = Math.max(120, clipPlayableMs(clip));
          const displayedOffset =
            movingClip?.clipId === clip.id ? movingClip.offsetMs : clip.offsetMs;
          const left = displayedOffset * pxPerMs;
          const width = playable * pxPerMs;
          const isOn = selected?.trackId === track.id && selected.clipId === clip.id;
          return (
            <div
              key={clip.id}
              className={`${styles.timelineClip} ${isOn ? styles.timelineClipOn : ""}`}
              style={{ left, width }}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(track.id, clip.id);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                onSelect(track.id, clip.id);
                const startX = event.clientX;
                const startOffset = clip.offsetMs;
                let finalOffset = startOffset;
                setMovingClip({ clipId: clip.id, offsetMs: startOffset });
                const move = (next: PointerEvent) => {
                  const deltaMs = (next.clientX - startX) / pxPerMs;
                  finalOffset = Math.max(0, startOffset + deltaMs);
                  setMovingClip({ clipId: clip.id, offsetMs: finalOffset });
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  window.removeEventListener("pointercancel", up);
                  setMovingClip(null);
                  if (Math.abs(finalOffset - startOffset) >= 1) {
                    onMoveClip(track.id, clip.id, finalOffset);
                  }
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
              }}
            >
              <button
                type="button"
                className={`${styles.trimHandle} ${styles.trimIn}`}
                aria-label="Trim start"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const startX = event.clientX;
                  const startTrim = clip.trimInMs;
                  const move = (next: PointerEvent) => {
                    const deltaMs = (next.clientX - startX) / pxPerMs;
                    onTrimClip(track.id, clip.id, Math.max(0, startTrim + deltaMs), clip.trimOutMs);
                  };
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
              <span>{clip.name || track.kind}</span>
              <button
                type="button"
                className={`${styles.trimHandle} ${styles.trimOut}`}
                aria-label="Trim end"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const startX = event.clientX;
                  const startOut =
                    clip.trimOutMs > 0 ? clip.trimOutMs : clip.trimInMs + playable;
                  const move = (next: PointerEvent) => {
                    const deltaMs = (next.clientX - startX) / pxPerMs;
                    onTrimClip(
                      track.id,
                      clip.id,
                      clip.trimInMs,
                      Math.max(clip.trimInMs + 80, startOut + deltaMs)
                    );
                  };
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
