"use client";

import { useRef, type PointerEvent } from "react";
import {
  DROP_STUDIO_V5_ASPECTS,
  clipPlayableMs,
  sessionDurationMs,
  type DropStudioV5ArtAction,
  type DropStudioV5Aspect,
  type DropStudioV5Session,
} from "@/lib/board/dropStudioV5";
import styles from "./DropStudioV5Timeline.module.css";

const LANE_LABEL_WIDTH = 54;

function clock(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function DropStudioV5Timeline({
  session,
  selectedClipId,
  canUndo,
  canRedo,
  extraClipCount,
  onSelectClip,
  onScrub,
  onImportVideo,
  onImportAudio,
  onSplit,
  onReorder,
  onDelete,
  onTrim,
  onUndo,
  onRedo,
  onAspect,
  onCropFit,
  onCropFill,
  onCropInset,
  onArtAction,
}: {
  session: DropStudioV5Session;
  selectedClipId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  extraClipCount: number;
  onSelectClip: (clipId: string) => void;
  onScrub: (ms: number) => void;
  onImportVideo: (file: File) => void;
  onImportAudio: (file: File) => void;
  onSplit: () => void;
  onReorder: (direction: -1 | 1) => void;
  onDelete: () => void;
  onTrim: (edge: "in" | "out", deltaMs: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAspect: (aspect: DropStudioV5Aspect) => void;
  onCropFit: () => void;
  onCropFill: () => void;
  onCropInset: () => void;
  onArtAction?: (action: DropStudioV5ArtAction) => void;
}) {
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const selectedArt = session.tracks
    .find((track) => track.kind === "art")
    ?.clips.find((clip) => clip.id === selectedClipId);
  const duration = Math.max(sessionDurationMs(session), 4_000);
  const pxPerMs = 0.042;
  const width = Math.max(280, LANE_LABEL_WIDTH + duration * pxPerMs);
  const ticks = Array.from({ length: Math.floor(duration / 1000) + 1 }, (_, index) => index * 1000);

  function scrubFromEvent(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - LANE_LABEL_WIDTH;
    onScrub(Math.max(0, x / pxPerMs));
  }

  return (
    <section className={styles.timeline} aria-label="Drop Studio V5 timeline">
      <div className={styles.head}>
        <span className={styles.title}>Timeline</span>
        <div className={styles.tools}>
          <button type="button" disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={onRedo}>
            Redo
          </button>
          <button type="button" onClick={onSplit} disabled={!selectedClipId}>
            Split
          </button>
          <button type="button" onClick={() => onReorder(-1)} disabled={!selectedClipId}>
            {selectedArt ? "Lower" : "Left"}
          </button>
          <button type="button" onClick={() => onReorder(1)} disabled={!selectedClipId}>
            {selectedArt ? "Raise" : "Right"}
          </button>
          <button type="button" onClick={() => onTrim("in", 120)} disabled={!selectedClipId}>
            Trim In
          </button>
          <button type="button" onClick={() => onTrim("out", -120)} disabled={!selectedClipId}>
            Trim Out
          </button>
          <button type="button" onClick={onDelete} disabled={!selectedClipId}>
            Delete
          </button>
          <button type="button" onClick={() => videoInputRef.current?.click()}>
            Import clip
          </button>
          <button type="button" onClick={() => audioInputRef.current?.click()}>
            Audio track
          </button>
          <input
            ref={videoInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="video/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onImportVideo(file);
            }}
          />
          <input
            ref={audioInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onImportAudio(file);
            }}
          />
        </div>
      </div>

      <div className={styles.aspects} aria-label="Aspect ratios">
        <span className={styles.groupLabel}>Aspect</span>
        {(Object.keys(DROP_STUDIO_V5_ASPECTS) as DropStudioV5Aspect[]).map((aspect) => (
          <button
            key={aspect}
            type="button"
            aria-pressed={session.aspect === aspect}
            onClick={() => onAspect(aspect)}
          >
            {DROP_STUDIO_V5_ASPECTS[aspect].label}
          </button>
        ))}
      </div>

      {onArtAction ? (
        <div className={styles.cropRow} aria-label="Art overlay">
          <span className={styles.groupLabel}>Art</span>
          <button type="button" onClick={() => onArtAction("new")}>
            New
          </button>
          <button type="button" onClick={() => onArtAction("duplicate")} disabled={!selectedArt}>
            Duplicate
          </button>
          <button type="button" onClick={() => onArtAction("hide")} disabled={!selectedArt}>
            {selectedArt?.hidden ? "Show" : "Hide"}
          </button>
          <button type="button" onClick={() => onArtAction("start-earlier")} disabled={!selectedArt}>
            Start−
          </button>
          <button type="button" onClick={() => onArtAction("start-later")} disabled={!selectedArt}>
            Start+
          </button>
          <button type="button" onClick={() => onArtAction("end-earlier")} disabled={!selectedArt}>
            End−
          </button>
          <button type="button" onClick={() => onArtAction("end-later")} disabled={!selectedArt}>
            End+
          </button>
          <button type="button" onClick={() => onArtAction("earlier")} disabled={!selectedArt}>
            Earlier
          </button>
          <button type="button" onClick={() => onArtAction("later")} disabled={!selectedArt}>
            Later
          </button>
          <button type="button" onClick={() => onArtAction("smaller")} disabled={!selectedArt}>
            Smaller
          </button>
          <button type="button" onClick={() => onArtAction("larger")} disabled={!selectedArt}>
            Larger
          </button>
          <button type="button" onClick={() => onArtAction("nudge-left")} disabled={!selectedArt}>
            Nudge left
          </button>
          <button type="button" onClick={() => onArtAction("nudge-right")} disabled={!selectedArt}>
            Nudge right
          </button>
          <button type="button" onClick={() => onArtAction("nudge-up")} disabled={!selectedArt}>
            Nudge up
          </button>
          <button type="button" onClick={() => onArtAction("nudge-down")} disabled={!selectedArt}>
            Nudge down
          </button>
        </div>
      ) : null}

      <div className={styles.cropRow} aria-label="Crop">
        <span className={styles.groupLabel}>Crop</span>
        <button type="button" onClick={onCropFill}>
          Fill
        </button>
        <button type="button" onClick={onCropFit}>
          Fit
        </button>
        <button type="button" onClick={onCropInset}>
          Inset
        </button>
      </div>

      <div className={styles.rulerWrap}>
        <div
          className={styles.ruler}
          style={{ width }}
          onPointerDown={scrubFromEvent}
        >
          <div className={styles.ticks}>
            {ticks.map((tick) => (
              <span
                key={tick}
                className={styles.tick}
                style={{ left: LANE_LABEL_WIDTH + tick * pxPerMs }}
              >
                {clock(tick)}
              </span>
            ))}
          </div>
          {session.tracks.map((track) => (
            <div className={styles.lane} key={track.id}>
              <div className={styles.laneLabel}>{track.label}</div>
              <div className={styles.laneClips}>
                {track.clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    className={`${styles.clip} ${track.kind === "audio" ? styles.clipAudio : ""} ${
                      track.kind === "art" ? styles.clipArt : ""
                    } ${clip.hidden ? styles.clipHidden : ""} ${
                      selectedClipId === clip.id ? styles.clipSelected : ""
                    }`}
                    style={{
                      left: clip.offsetMs * pxPerMs,
                      width: Math.max(28, clipPlayableMs(clip) * pxPerMs),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectClip(clip.id);
                    }}
                  >
                    {clip.name || track.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div
            className={styles.playhead}
            style={{ left: LANE_LABEL_WIDTH + session.playheadMs * pxPerMs }}
          />
        </div>
      </div>
      <p className={styles.note}>
        {extraClipCount > 0
          ? "Done renders this timeline with one decoder. The draft stays if that render fails."
          : "One decoder preview. Trim, crop, and extra audio render on Done."}
      </p>
    </section>
  );
}
