"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DROP_STUDIO_V5_ASPECTS,
  V5_SPEEDS,
  clipPlayableMs,
  clipEndMs,
  MAX_V5_VIDEO_CLIPS,
  sessionDurationMs,
  type DropStudioV5ArtAction,
  type DropStudioV5Aspect,
  type DropStudioV5Clip,
  type DropStudioV5Session,
} from "@/lib/board/dropStudioV5";
import { V5_GRADE_PRESETS, V5_MOTIONS, type DropStudioV5Motion } from "@/lib/board/dropStudioV5Grade";
import type { DropStudioV5Layout } from "@/lib/board/dropStudioV5Layout";
import {
  dropIndexForClip,
  nextTimelineZoom,
  PHONE_EDIT_TOOLS,
  timelinePxPerMs,
  trimDeltaMs,
  trimEdgeByDelta,
  type PhoneEditTool,
} from "@/lib/board/dropStudioV5Timeline";
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
  onImportAudio,
  onImportVideo,
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
  onSpeed,
  onDuplicate,
  onFade,
  onPreset,
  onClearGrade,
  onAddEffect,
  onDeleteClip,
  onVolume,
  onRecordVoice,
  voiceState,
  layout = "phone",
  onReorderTo,
  onMoveBy,
  onMuteTrack,
  onFocusStudioTool,
  onStep,
}: {
  session: DropStudioV5Session;
  selectedClipId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  extraClipCount: number;
  onSelectClip: (clipId: string) => void;
  onScrub: (ms: number) => void;
  onImportAudio: (file: File) => void;
  onImportVideo?: (files: File[]) => void;
  onSplit: () => void;
  onReorder: (direction: -1 | 1) => void;
  onDelete: () => void;
  onTrim: (edge: "in" | "out", deltaMs: number, clipId?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAspect: (aspect: DropStudioV5Aspect) => void;
  onCropFit: () => void;
  onCropFill: () => void;
  onCropInset: () => void;
  onArtAction?: (action: DropStudioV5ArtAction) => void;
  onSpeed?: (speed: number) => void;
  onDuplicate?: () => void;
  onFade?: (fadeInMs: number, fadeOutMs: number) => void;
  onPreset?: (name: string, intensity: number) => void;
  onClearGrade?: () => void;
  onAddEffect?: (motion: DropStudioV5Motion) => void;
  onDeleteClip?: (clipId: string) => void;
  onVolume?: (volume: number) => void;
  onRecordVoice?: () => void;
  voiceState?: "idle" | "recording" | "denied";
  layout?: DropStudioV5Layout;
  onReorderTo?: (clipId: string, index: number) => void;
  onMoveBy?: (clipId: string, deltaMs: number) => void;
  onMuteTrack?: (trackId: string, muted: boolean) => void;
  onFocusStudioTool?: (tool: "art" | "text" | "stickers") => void;
  onStep?: (direction: -1 | 1) => void;
}) {
  const presetRef = useRef("cinematic");
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const clipNodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<PhoneEditTool>("trim");
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [trimPreview, setTrimPreview] = useState<{ id: string; edge: "in" | "out"; deltaMs: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<number | null>(null);
  const selectedClip = session.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId);
  const selectedArt = session.tracks
    .find((track) => track.kind === "art")
    ?.clips.find((clip) => clip.id === selectedClipId);
  const effectClips = session.tracks.find((track) => track.kind === "effect")?.clips ?? [];
  const selectedEffect = effectClips.find((clip) => clip.id === selectedClipId);
  const duration = Math.max(sessionDurationMs(session), 4_000);
  const pxPerMs = timelinePxPerMs(zoom);
  const videoClipCount = session.tracks.find((track) => track.kind === "video")?.clips.length ?? 0;
  const videoFull = videoClipCount >= MAX_V5_VIDEO_CLIPS;
  const width = Math.max(280, LANE_LABEL_WIDTH + duration * pxPerMs + 108);

  function pickVideos() {
    if (videoFull) return;
    videoInputRef.current?.click();
  }
  const ticks = Array.from({ length: Math.floor(duration / 1000) + 1 }, (_, index) => index * 1000);

  function scrubFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-clip]")) return;
    if (pointers.current.size > 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - LANE_LABEL_WIDTH;
    onScrub(Math.max(0, x / pxPerMs));
  }

  function shownClip(clip: DropStudioV5Clip) {
    if (!trimPreview || trimPreview.id !== clip.id) return clip;
    const next = trimEdgeByDelta(clip, trimPreview.edge, trimPreview.deltaMs);
    return { ...clip, trimInMs: next.trimInMs, trimOutMs: next.trimOutMs };
  }

  function clipBoxes() {
    return session.tracks.flatMap((track) =>
      track.clips.flatMap((clip) => {
        const node = clipNodes.current.get(clip.id);
        if (!node) return [];
        const rect = node.getBoundingClientRect();
        return [{ id: clip.id, left: rect.left, right: rect.right }];
      })
    );
  }

  function trackPointers(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function zoomFromPointers(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!previous || pointers.current.size < 2 || pinchRef.current == null) return;
    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchRef.current > 0 && Math.abs(distance - pinchRef.current) > 8) {
      setZoom((current) => nextTimelineZoom(current, distance / pinchRef.current!));
      pinchRef.current = distance;
    }
  }

  function releasePointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  }

  const dragRef = useRef<null | { id: string; kind: string; x: number; edge?: "in" | "out" }>(null);

  function beginTrim(event: ReactPointerEvent<HTMLButtonElement>, clip: DropStudioV5Clip, edge: "in" | "out") {
    event.preventDefault();
    event.stopPropagation();
    onSelectClip(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: clip.id, kind: "trim", x: event.clientX, edge };
  }

  function moveTrim(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag?.edge) return;
    setTrimPreview({ id: drag.id, edge: drag.edge, deltaMs: trimDeltaMs(event.clientX - drag.x, pxPerMs) });
  }

  function endTrim(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.edge) return;
    const delta = trimDeltaMs(event.clientX - drag.x, pxPerMs);
    setTrimPreview(null);
    if (Math.abs(delta) > 12) onTrim(drag.edge, delta, drag.id);
  }

  function beginMove(event: ReactPointerEvent<HTMLDivElement>, clip: DropStudioV5Clip, kind: string) {
    if (event.button === 2) return;
    event.stopPropagation();
    onSelectClip(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: clip.id, kind, x: event.clientX };
  }

  function endMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.kind === "trim") return;
    dragRef.current = null;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) < 8) return;
    if (drag.kind === "video" || drag.kind === "audio") onReorderTo?.(drag.id, dropIndexForClip(clipBoxes(), drag.id, event.clientX));
    else onMoveBy?.(drag.id, trimDeltaMs(dx, pxPerMs));
  }

  function openMenu(event: ReactPointerEvent<HTMLDivElement> | { clientX: number; clientY: number; preventDefault: () => void }, clipId: string) {
    event.preventDefault();
    onSelectClip(clipId);
    setMenu({ x: event.clientX, y: event.clientY, clipId });
  }

  return (
    <section className={styles.timeline} data-layout={layout} aria-label="Drop Studio V5 timeline">
      <div className={styles.rail} aria-label="Editing tools">
        {PHONE_EDIT_TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            aria-pressed={activeTool === tool}
            onClick={() => {
              setActiveTool(tool);
              if (tool === "art" || tool === "text" || tool === "stickers") onFocusStudioTool?.(tool);
              if (tool === "split") onSplit();
            }}
          >
            {tool}
          </button>
        ))}
      </div>
      <div className={styles.stage}>
      <div className={styles.head}>
        <span className={styles.title}>{clock(session.playheadMs)} / {clock(duration)}</span>
        <div className={styles.tools}>
          <button type="button" onClick={() => onStep?.(-1)} aria-label="Previous frame">
            Frame−
          </button>
          <button type="button" onClick={() => onStep?.(1)} aria-label="Next frame">
            Frame+
          </button>
          <button type="button" onClick={() => setZoom((current) => nextTimelineZoom(current, 0.8))} aria-label="Zoom timeline out">
            −
          </button>
          <button type="button" onClick={() => setZoom((current) => nextTimelineZoom(current, 1.25))} aria-label="Zoom timeline in">
            +
          </button>
          <button type="button" disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={onRedo}>
            Redo
          </button>
          <button type="button" onClick={pickVideos} disabled={videoFull || !onImportVideo} title={videoFull ? "The timeline holds 8 video clips" : "Add a video after the last clip"}>
            Add clip
          </button>
          <input
            ref={videoInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="video/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) onImportVideo?.(files);
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

      <div className={styles.rulerWrap}>
        <div
          className={styles.ruler}
          style={{ width }}
          onPointerDown={(event) => {
            trackPointers(event);
            scrubFromEvent(event);
          }}
          onPointerMove={zoomFromPointers}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            setZoom((current) => nextTimelineZoom(current, event.deltaY < 0 ? 1.12 : 0.88));
          }}
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
                {track.kind === "video" ? (
                  <button
                    type="button"
                    className={styles.addClip}
                    style={{ left: Math.max(...track.clips.map((clip) => clipEndMs(clip)), 0) * pxPerMs }}
                    disabled={videoFull || !onImportVideo}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={pickVideos}
                  >
                    {videoFull ? "Full" : "Add clip"}
                  </button>
                ) : null}
                {track.clips.map((sourceClip) => {
                  const clip = shownClip(sourceClip);
                  const clipClass = `${styles.clip} ${track.kind === "audio" ? styles.clipAudio : ""} ${
                    track.kind === "art" ? styles.clipArt : ""
                  } ${track.kind === "effect" ? styles.clipEffect : ""} ${clip.hidden ? styles.clipHidden : ""} ${
                    selectedClipId === clip.id ? styles.clipSelected : ""
                  }`;
                  const clipStyle = {
                    left: clip.offsetMs * pxPerMs,
                    width: Math.max(36, clipPlayableMs(clip) * pxPerMs),
                  };
                  return (
                    <div
                      key={clip.id}
                      data-clip={clip.id}
                      ref={(node) => {
                        if (node) clipNodes.current.set(clip.id, node);
                        else clipNodes.current.delete(clip.id);
                      }}
                      className={clipClass}
                      style={clipStyle}
                      onPointerDown={(event) => beginMove(event, sourceClip, track.kind)}
                      onPointerUp={endMove}
                      onPointerCancel={() => {
                        dragRef.current = null;
                      }}
                      onContextMenu={(event) => openMenu(event, clip.id)}
                    >
                      <button
                        type="button"
                        className={`${styles.handle} ${styles.handleIn}`}
                        aria-label={`Trim the start of ${clip.name || track.label}`}
                        onPointerDown={(event) => beginTrim(event, sourceClip, "in")}
                        onPointerMove={moveTrim}
                        onPointerUp={endTrim}
                        onPointerCancel={endTrim}
                      />
                      <span className={styles.clipLabel}>{clip.name || track.label}</span>
                      <button
                        type="button"
                        className={`${styles.handle} ${styles.handleOut}`}
                        aria-label={`Trim the end of ${clip.name || track.label}`}
                        onPointerDown={(event) => beginTrim(event, sourceClip, "out")}
                        onPointerMove={moveTrim}
                        onPointerUp={endTrim}
                        onPointerCancel={endTrim}
                      />
                    </div>
                  );
                })}
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
        {videoFull
          ? "This timeline holds 8 video clips. Delete one to add another."
          : activeTool === "trim"
            ? "Add clip places another video after the last one. Drag an edge to trim."
            : extraClipCount > 0
              ? "Done renders this timeline with one decoder. The draft stays if that render fails."
              : "Add clip places another video after this one."}
      </p>
      </div>
      <aside className={styles.inspector} aria-label="Clip settings">

      {activeTool === "trim" ? (
        <div className={styles.cropRow} aria-label="Trim">
          <span className={styles.groupLabel}>Trim</span>
          <button type="button" onClick={() => onTrim("in", 120)} disabled={!selectedClipId}>Trim in</button>
          <button type="button" onClick={() => onTrim("out", -120)} disabled={!selectedClipId}>Trim out</button>
          <button type="button" onClick={() => onReorder(-1)} disabled={!selectedClipId}>Earlier</button>
          <button type="button" onClick={() => onReorder(1)} disabled={!selectedClipId}>Later</button>
          <button type="button" onClick={onDuplicate} disabled={!selectedClipId || !onDuplicate}>Duplicate</button>
          <button type="button" onClick={onDelete} disabled={!selectedClipId}>Delete</button>
        </div>
      ) : null}

      {activeTool === "split" ? (
        <div className={styles.cropRow} aria-label="Split">
          <span className={styles.groupLabel}>Split</span>
          <button type="button" onClick={onSplit} disabled={!selectedClipId}>Split at playhead</button>
        </div>
      ) : null}

      {activeTool === "speed" && onSpeed ? (
        <div className={styles.cropRow} aria-label="Speed">
          <span className={styles.groupLabel}>Speed</span>
          {V5_SPEEDS.map((speed) => (
            <button key={speed} type="button" aria-pressed={(selectedClip?.speed ?? 1) === speed} onClick={() => onSpeed(speed)} disabled={!selectedClipId}>
              {speed}x
            </button>
          ))}
        </div>
      ) : null}

      {activeTool === "filters" && onPreset ? (
        <div className={styles.cropRow} aria-label="Grade">
          <span className={styles.groupLabel}>Filters</span>
          {V5_GRADE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                presetRef.current = preset;
                onPreset(preset, 1);
              }}
              disabled={!selectedClipId}
            >
              {preset}
            </button>
          ))}
          <button type="button" onClick={onClearGrade} disabled={!selectedClipId}>Clear</button>
          <label className={styles.sliderLabel}>
            Intensity
            <input
              type="range"
              min={15}
              max={100}
              defaultValue={100}
              aria-label="Grade intensity"
              disabled={!selectedClipId}
              onChange={(event) => onPreset(presetRef.current, Number(event.target.value) / 100)}
            />
          </label>
        </div>
      ) : null}

      {activeTool === "effects" && onAddEffect ? (
        <div className={styles.cropRow} aria-label="Effects">
          <span className={styles.groupLabel}>Effect</span>
          {V5_MOTIONS.map((motion) => (
            <button key={motion} type="button" onClick={() => onAddEffect(motion)}>
              {motion}
            </button>
          ))}
          <button type="button" onClick={() => selectedEffect && onDeleteClip?.(selectedEffect.id)} disabled={!selectedEffect}>
            Delete effect
          </button>
        </div>
      ) : null}

      {activeTool === "audio" && onFade ? (
        <div className={styles.cropRow} aria-label="Audio">
          <span className={styles.groupLabel}>Audio</span>
          <button type="button" onClick={onRecordVoice} disabled={!onRecordVoice}>
            {voiceState === "recording" ? "Stop voice" : voiceState === "denied" ? "Mic blocked" : "Record voice"}
          </button>
          <label className={styles.sliderLabel}>
            Volume
            <input
              key={selectedClipId || "volume"}
              type="range"
              min={0}
              max={100}
              defaultValue={100}
              aria-label="Clip volume"
              disabled={!selectedClipId}
              onChange={(event) => onVolume?.(Number(event.target.value) / 100)}
            />
          </label>
        </div>
      ) : null}

      {activeTool === "audio" && onFade ? (
        <div className={styles.cropRow} aria-label="Fade">
          <span className={styles.groupLabel}>Fade</span>
          <label className={styles.sliderLabel}>
            Fade in
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              defaultValue={0}
              aria-label="Fade in"
              disabled={!selectedClipId}
              onChange={(event) => onFade(Number(event.target.value), selectedClip?.fadeOutMs ?? 0)}
            />
          </label>
          <label className={styles.sliderLabel}>
            Fade out
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              defaultValue={0}
              aria-label="Fade out"
              disabled={!selectedClipId}
              onChange={(event) => onFade(selectedClip?.fadeInMs ?? 0, Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}

      {activeTool === "crop" ? (
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
      ) : null}

      {activeTool === "art" && onArtAction ? (
        <div className={styles.cropRow} aria-label="Art overlay">
          <span className={styles.groupLabel}>Art</span>
          <button type="button" onClick={() => onFocusStudioTool?.("art")}>
            Draw
          </button>
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

      {activeTool === "crop" ? (
      <div className={styles.cropRow} aria-label="Crop">
        <span className={styles.groupLabel}>Crop</span>
        <button type="button" onClick={onCropFill}>Fill</button>
        <button type="button" onClick={onCropFit}>Fit</button>
        <button type="button" onClick={onCropInset}>Inset</button>
      </div>
      ) : null}

      {activeTool === "text" ? (
        <div className={styles.cropRow}>
          <button type="button" onClick={() => onFocusStudioTool?.("text")}>Edit text</button>
        </div>
      ) : null}
      {activeTool === "stickers" ? (
        <div className={styles.cropRow}>
          <button type="button" onClick={() => onFocusStudioTool?.("stickers")}>Edit stickers</button>
        </div>
      ) : null}
      {activeTool === "layers" && onMuteTrack ? (
        <div className={styles.cropRow} aria-label="Tracks">
          <span className={styles.groupLabel}>Layers</span>
          {session.tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              aria-pressed={!track.muted}
              onClick={() => onMuteTrack(track.id, !track.muted)}
            >
              {track.muted ? `Show ${track.label}` : `Mute ${track.label}`}
            </button>
          ))}
        </div>
      ) : null}
      {activeTool === "audio" ? (
        <div className={styles.cropRow}>
          <button type="button" onClick={() => audioInputRef.current?.click()}>Import audio</button>
        </div>
      ) : null}
      </aside>
      {menu ? (
        <div className={styles.menu} style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" onClick={() => { onSplit(); setMenu(null); }}>Split</button>
          <button type="button" onClick={() => { onDuplicate?.(); setMenu(null); }}>Duplicate</button>
          <button type="button" onClick={() => { onDeleteClip?.(menu.clipId); setMenu(null); }}>Delete</button>
          <button type="button" onClick={() => setMenu(null)}>Close</button>
        </div>
      ) : null}
    </section>
  );
}
