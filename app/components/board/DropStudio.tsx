"use client";

import type React from "react";
import { memo, useEffect, useRef, useState } from "react";
import {
  compactDropCustomizations,
  type DropCustomization,
  type DropStudioEffects,
} from "@/lib/board/dropCustomizations";
import {
  normalizeDropMediaRotation,
  resolveDropMediaFrame,
  type DropMediaFrame,
} from "@/lib/board/mediaFormat";
import { dropMediaRotationStyle } from "@/lib/board/dropMediaFrameDisplay";
import DropChipWorkbench from "./DropChipWorkbench";
import DropStudioArtPalette from "./DropStudioArtPalette";
import DropStudioOverlay from "./DropStudioOverlay";
import DropStudioPaletteDeck, { type ObjectTool } from "./DropStudioPaletteDeck";
import DropStudioV5Timeline from "./DropStudioV5Timeline";
import BoardPlayableVideo from "./BoardPlayableVideo";
import { useDropStudioV5Runtime } from "./useDropStudioV5Runtime";
import {
  aspectToMediaFrame,
  DROP_STUDIO_V5_ASPECTS,
  monitorAspectRatio,
} from "@/lib/board/dropStudioV5";
import {
  STICKER_PACKS,
  stickerTypeForPack,
  type StickerItem,
  type StickerPack,
} from "@/lib/board/stickerPacks";
import styles from "./DropStudio.module.css";

const ACTIONS = [
  "Join",
  "Book Me",
  "Message",
  "Listen",
  "Watch",
  "Audition",
  "Support",
  "View Project",
  "Add to Board",
];

const FILTERS = [
  { label: "None", value: null },
  { label: "Signal Glow", value: "signal-glow" },
  { label: "Dream Fog", value: "dream-fog" },
  { label: "Bucket Vision", value: "bucket-vision" },
  { label: "Pulse", value: "pulse" },
  { label: "Neon Signal", value: "neon-signal" },
  { label: "Night Glass", value: "night-glass" },
  { label: "Artifact", value: "artifact" },
  { label: "Clean Enhance", value: "clean-enhance" },
];

const OVERLAYS = [
  { label: "None", value: null },
  { label: "Sparkle", value: "sparkle" },
  { label: "Glow Frame", value: "glow-frame" },
  { label: "Film Grain", value: "film-grain" },
  { label: "Soft Vignette", value: "soft-vignette" },
  { label: "Scanlines", value: "scanlines" },
  { label: "Light Leak", value: "light-leak" },
  { label: "Aura Ring", value: "aura-ring" },
  { label: "Shimmer", value: "shimmer" },
];

type Tool = ObjectTool;

function toolLabel(item: Tool) {
  switch (item) {
    case "text":
      return "Text";
    case "stickers":
      return "Stickers";
    case "button":
      return "Button";
    case "effects":
      return "Effects";
    case "filters":
      return "Filters";
    case "enhance":
      return "Enhance";
    default:
      return item;
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function StudioPreviewVideo({
  src,
  contentType,
  style,
  onError,
  mediaTimeSeconds,
  trimOutSeconds,
  scrubbing = false,
  onDuration,
  onTimeUpdate,
  onClipBoundary,
  onPlayingChange,
}: {
  src: string;
  contentType?: string;
  style?: React.CSSProperties;
  onError?: () => void;
  mediaTimeSeconds?: number;
  trimOutSeconds?: number;
  scrubbing?: boolean;
  onDuration?: (seconds: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  onClipBoundary?: () => boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const shownFrameRef = useRef(false);
  const resumeRef = useRef(false);

  useEffect(() => {
    setPlaying(false);
    shownFrameRef.current = false;
  }, [src, contentType]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || mediaTimeSeconds == null) return;
    if (!scrubbing && shownFrameRef.current) return;
    try {
      if (Math.abs(el.currentTime - mediaTimeSeconds) > 0.12) {
        el.currentTime = mediaTimeSeconds;
      }
    } catch {
      // Some blobs reject a seek until more data arrives.
    }
  }, [src, mediaTimeSeconds, scrubbing]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) onDuration?.(el.duration);
    };
    const onTick = () => {
      if (
        trimOutSeconds &&
        trimOutSeconds > 0 &&
        el.currentTime >= trimOutSeconds - 0.04 &&
        !el.paused
      ) {
        el.pause();
        resumeRef.current = onClipBoundary?.() ?? false;
        return;
      }
      onTimeUpdate?.(el.currentTime);
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTick);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTick);
    };
  }, [src, onDuration, onTimeUpdate, onClipBoundary, trimOutSeconds]);

  function showFirstFrame() {
    const el = videoRef.current;
    if (!el || shownFrameRef.current || !el.paused || el.currentTime > 0) return;
    shownFrameRef.current = true;
    try {
      el.currentTime = mediaTimeSeconds && mediaTimeSeconds > 0 ? mediaTimeSeconds : 0.001;
    } catch {
      // Some blobs reject a seek until more data arrives.
    }
    if (Number.isFinite(el.duration) && el.duration > 0) onDuration?.(el.duration);
    if (resumeRef.current) {
      resumeRef.current = false;
      void el.play().catch(() => {});
    }
  }

  async function togglePlay(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        el.muted = false;
        el.volume = 1;
        await el.play();
      } else {
        el.pause();
      }
    } catch {
      onError?.();
    }
  }

  function markPlaying(next: boolean) {
    setPlaying(next);
    onPlayingChange?.(next);
  }

  return (
    <>
      <BoardPlayableVideo
        videoRef={videoRef}
        src={src}
        style={style}
        preload="auto"
        onPlay={() => markPlaying(true)}
        onPause={() => markPlaying(false)}
        onEnded={() => markPlaying(false)}
        onLoadedData={showFirstFrame}
        onPointerDown={(event) => event.stopPropagation()}
        onError={onError}
      />
      <button
        type="button"
        className={`${styles.videoPlayHit} ${playing ? styles.videoPlayHitPlaying : ""}`}
        onClick={togglePlay}
        aria-label={playing ? "Pause video" : "Play video"}
      >
        <span className={styles.videoPlayGlyph} aria-hidden>
          {playing ? "❚❚" : "▶"}
        </span>
      </button>
    </>
  );
}

function hasStudioEffects(effects?: DropStudioEffects | null) {
  if (!effects) return false;
  return Boolean(
    effects.filter ||
      effects.overlay ||
      effects.frame ||
      effects.rotation
  );
}

function DropStudio({
  mediaUrl,
  mediaKind,
  mediaContentType,
  value,
  onChange,
  compact = false,
  hideHeader = false,
  operatingTable = false,
  enableArtTools = false,
  artTools,
  onMediaError,
  studioV5 = false,
  studioDraftId,
}: {
  mediaUrl: string;
  mediaKind: "image" | "video";
  mediaContentType?: string;
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  compact?: boolean;
  hideHeader?: boolean;
  /** Uniform 4:5 monitor + Palette overlay (Drop Studio stage). */
  operatingTable?: boolean;
  /** Brush / Art Palette overlays — Vision, Video, and Art when V5 is on. */
  enableArtTools?: boolean;
  /** Art brush tools — rendered below object tool panels in the Palette drawer. */
  artTools?: React.ReactNode;
  /** Rebuild preview URL if a blob fails to paint (e.g. revoked object URL). */
  onMediaError?: () => void;
  /** Incremental V5 timeline. Off restores V4 layout and behavior. */
  studioV5?: boolean;
  studioDraftId?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>("text");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState<{
    kind: "text" | "sticker";
    id: string;
  } | null>(null);

  const normalized = compactDropCustomizations(value) ?? {};
  const timelineOn = Boolean(studioV5 && mediaKind === "video");
  const v5 = useDropStudioV5Runtime({
    enabled: timelineOn,
    mediaUrl,
    mediaKind,
    draftId: studioDraftId,
    filter: normalized.effects?.filter,
    overlay: normalized.effects?.overlay,
  });

  useEffect(() => {
    if (!timelineOn) return;
    const el = audioRef.current;
    if (!el || !v5.audioPreviewUrl) {
      el?.pause();
      return;
    }
    el.volume = Math.max(0, Math.min(1, v5.audioVolume));
    if (v5.scrubbing) {
      try {
        el.currentTime = v5.audioPreviewTimeSeconds;
      } catch {
        // Metadata may not be ready on a freshly imported take.
      }
    }
  }, [timelineOn, v5.audioPreviewTimeSeconds, v5.audioPreviewUrl, v5.audioVolume, v5.scrubbing]);

  function update(next: DropCustomization) {
    onChange(compactDropCustomizations(next) ?? {});
  }

  function addText() {
    const clean = text.trim().slice(0, 48);
    if (!clean) return;
    update({
      ...normalized,
      textLabels: [
        ...(normalized.textLabels ?? []),
        { id: makeId("text"), text: clean, x: 50, y: 28 },
      ],
    });
    setText("");
  }

  function addSticker(item: StickerItem, pack: StickerPack) {
    update({
      ...normalized,
      stickers: [
        ...(normalized.stickers ?? []),
        {
          id: makeId("sticker"),
          type: stickerTypeForPack(pack.kind),
          value: item.value,
          label: item.label,
          ...(item.src ? { src: item.src } : {}),
          pack: pack.id,
          x: 50,
          y: 52,
        },
      ],
    });
  }

  function setEffect(kind: "filter" | "overlay", selected: string | null) {
    const nextEffects = {
      ...(normalized.effects ?? {}),
      [kind]: selected,
    };
    update({
      ...normalized,
      effects: hasStudioEffects(nextEffects) ? nextEffects : undefined,
    });
    if (timelineOn) {
      v5.applyFilterToClip(
        kind === "filter" ? selected : v5.activeFilter,
        kind === "overlay" ? selected : v5.activeOverlay
      );
    }
  }

  function setMediaFrame(frame: DropMediaFrame) {
    const nextEffects = {
      ...(normalized.effects ?? {}),
      frame,
    };
    update({
      ...normalized,
      effects: hasStudioEffects(nextEffects) ? nextEffects : undefined,
    });
  }

  function rotateMedia() {
    const current = normalizeDropMediaRotation(normalized.effects?.rotation);
    const next = ((current + 90) % 360) as 0 | 90 | 180 | 270;
    const nextEffects = {
      ...(normalized.effects ?? {}),
      rotation: next || null,
    };
    update({
      ...normalized,
      effects: hasStudioEffects(nextEffects) ? nextEffects : undefined,
    });
  }

  const mediaFrame = resolveDropMediaFrame(normalized);
  const mediaRotationStyle = dropMediaRotationStyle(normalized.effects?.rotation ?? 0);

  function removeItem(kind: "text" | "sticker", id: string) {
    update({
      ...normalized,
      ...(kind === "text"
        ? { textLabels: normalized.textLabels?.filter((item) => item.id !== id) }
        : { stickers: normalized.stickers?.filter((item) => item.id !== id) }),
    });
  }

  function moveItem(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100));
    update({
      ...normalized,
      ...(dragging.kind === "text"
        ? {
            textLabels: normalized.textLabels?.map((item) =>
              item.id === dragging.id ? { ...item, x, y } : item
            ),
          }
        : {
            stickers: normalized.stickers?.map((item) =>
              item.id === dragging.id ? { ...item, x, y } : item
            ),
          }),
    });
  }

  const headerEl = hideHeader ? null : (
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Drop Studio</div>
        <div className={styles.title}>Customize this media drop.</div>
      </div>
      <span className={styles.version}>{studioV5 ? "Studio V5" : "Vision Tools"}</span>
    </div>
  );

  const previewFilter = timelineOn ? v5.activeFilter : normalized.effects?.filter;
  const previewOverlay = timelineOn ? v5.activeOverlay : normalized.effects?.overlay;
  const previewSrc = timelineOn ? v5.previewUrl || mediaUrl : mediaUrl;
  const previewMediaStyle = {
    ...mediaRotationStyle,
    ...(timelineOn && v5.previewClipPath ? { clipPath: v5.previewClipPath } : null),
  };

  const previewEl = (
    <div
      ref={previewRef}
      className={`${styles.preview} ${operatingTable ? styles.previewInFrame : ""} ${
        previewFilter ? styles[`filter_${previewFilter}`] ?? "" : ""
      } ${
        previewOverlay ? styles[`overlay_${previewOverlay}`] ?? "" : ""
      }`}
      onPointerMove={moveItem}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
    >
      {mediaUrl ? (
        <div className={styles.mediaLayer}>
          {mediaKind === "video" ? (
            <StudioPreviewVideo
              src={previewSrc}
              contentType={mediaContentType}
              style={previewMediaStyle}
              onError={() => {
                if (!timelineOn || previewSrc === mediaUrl) onMediaError?.();
              }}
              mediaTimeSeconds={timelineOn ? v5.previewMediaTimeSeconds : undefined}
              trimOutSeconds={timelineOn ? v5.previewTrimOutSeconds : undefined}
              scrubbing={timelineOn ? v5.scrubbing : false}
              onClipBoundary={timelineOn ? v5.crossClipBoundary : undefined}
              onDuration={timelineOn ? v5.applyDuration : undefined}
              onTimeUpdate={timelineOn ? v5.syncPlayheadFromVideo : undefined}
              onPlayingChange={
                timelineOn
                  ? (playing) => {
                      const el = audioRef.current;
                      if (!el || !v5.audioPreviewUrl) return;
                      if (playing) void el.play().catch(() => {});
                      else el.pause();
                    }
                  : undefined
              }
            />
          ) : (
            <img
              key={mediaUrl}
              src={mediaUrl}
              alt="Drop Studio media preview"
              style={mediaRotationStyle}
              onError={() => onMediaError?.()}
            />
          )}
        </div>
      ) : null}
      <DropStudioOverlay
        customizations={
          operatingTable && normalized.artOverlayUrl
            ? { ...normalized, artOverlayUrl: undefined }
            : normalized
        }
        editable
        onMove={(kind, id, event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging({ kind, id });
        }}
        onRemove={removeItem}
      />
    </div>
  );

  const hintEl = (
    <div className={styles.hint}>
      Drag labels and emojis. Use the layer list to remove anything on mobile.
    </div>
  );

  const toolsClassName = styles.tools;
  const drawerClassName = styles.drawer;
  const activeToolClassName = styles.activeTool;

  const toolbarEl = (
    <div className={toolsClassName} aria-label="Drop Studio tools">
      {(["text", "stickers", "button", "effects", "filters", "enhance"] as Tool[]).map((item) => (
        <button
          key={item}
          type="button"
          className={tool === item ? activeToolClassName : undefined}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onClick={() => setTool(item)}
          title={toolLabel(item)}
        >
          {toolLabel(item)}
        </button>
      ))}
    </div>
  );

  const drawerPanelsEl = (
    <>
        {tool === "text" ? (
          <div className={styles.toolStack}>
            <div className={styles.textTool}>
              <input
                value={text}
                maxLength={48}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addText();
                  }
                }}
                placeholder="Type a word or phrase to float on your drop"
              />
              <button type="button" onClick={addText} disabled={!text.trim()}>
                Add Text
              </button>
            </div>
            {(normalized.textLabels?.length ?? 0) > 0 ? (
              <div className={styles.layerList} aria-label="Text labels on this drop">
                {normalized.textLabels?.map((label) => (
                  <div className={styles.layerRow} key={label.id}>
                    <span>{label.text}</span>
                    <button type="button" onClick={() => removeItem("text", label.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tool === "stickers" ? (
          <div className={styles.toolStack}>
            <div className={styles.emojiPicker}>
              {STICKER_PACKS.map((pack) => (
                <div className={styles.emojiGroup} key={pack.id}>
                  <div className={styles.groupLabel}>{pack.name}</div>
                  <div className={styles.emojiGrid}>
                    {pack.items.map((item) => (
                      <button
                        type="button"
                        key={`${pack.id}-${item.value}`}
                        onClick={() => addSticker(item, pack)}
                        aria-label={`Add ${item.label} sticker`}
                      >
                        {item.src ? (
                          <img src={item.src} alt={item.label} />
                        ) : (
                          item.value
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {(normalized.stickers?.length ?? 0) > 0 ? (
              <div className={styles.layerList} aria-label="Stickers on this drop">
                {normalized.stickers?.map((sticker) => (
                  <div className={styles.layerRow} key={sticker.id}>
                    <span>{sticker.value ?? sticker.label}</span>
                    <button type="button" onClick={() => removeItem("sticker", sticker.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tool === "button" ? (
          <div className={styles.actionGrid}>
            {ACTIONS.map((action) => (
              <button
                type="button"
                key={action}
                className={normalized.actionButton?.label === action ? styles.selectedAction : ""}
                onClick={() =>
                  update({
                    ...normalized,
                    actionButton: {
                      label: action,
                      actionType: action.toLowerCase().replace(/\s+/g, "-"),
                    },
                  })
                }
              >
                {action}
              </button>
            ))}
            {normalized.actionButton ? (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => update({ ...normalized, actionButton: null })}
              >
                Remove Button
              </button>
            ) : null}
          </div>
        ) : null}

        {tool === "filters" ? (
          <div className={styles.effectsTool}>
            <div className={styles.effectSection}>
              <div>
                <div className={styles.groupLabel}>Filters</div>
                <p>Board-native color treatments for the media signal.</p>
              </div>
              <div className={styles.effectGrid}>
                {FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.label}
                    className={
                      (normalized.effects?.filter ?? null) === filter.value
                        ? styles.selectedAction
                        : ""
                    }
                    onClick={() => setEffect("filter", filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tool === "effects" ? (
          <div className={styles.effectsTool}>
            <div className={styles.effectSection}>
              <div>
                <div className={styles.groupLabel}>Visual Effects</div>
                <p>Lightweight overlays for a more alive drop tile.</p>
              </div>
              <div className={styles.effectGrid}>
                {OVERLAYS.map((overlay) => (
                  <button
                    type="button"
                    key={overlay.label}
                    className={
                      (normalized.effects?.overlay ?? null) === overlay.value
                        ? styles.selectedAction
                        : ""
                    }
                    onClick={() => setEffect("overlay", overlay.value)}
                  >
                    {overlay.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tool === "enhance" ? (
          <div className={styles.enhanceTool}>
            <div>
              <div className={styles.groupLabel}>Media Frame</div>
              <p>Portrait 4:5 is the Board default. Landscape fits wide photos and video.</p>
            </div>
            <div className={styles.effectGrid}>
              <button
                type="button"
                className={mediaFrame === "portrait" ? styles.selectedAction : ""}
                onClick={() => setMediaFrame("portrait")}
              >
                Portrait 4:5
              </button>
              <button
                type="button"
                className={mediaFrame === "landscape" ? styles.selectedAction : ""}
                onClick={() => setMediaFrame("landscape")}
              >
                Landscape 16:9
              </button>
              <button type="button" onClick={rotateMedia}>
                Rotate 90°
              </button>
            </div>
            <div>
              <div className={styles.groupLabel}>Quality Enhancement</div>
              <p>Apply a clean visual lift now. Future versions can route this to AI/media processing.</p>
            </div>
            <button
              type="button"
              className={styles.selectedAction}
              onClick={() => setEffect("filter", "clean-enhance")}
            >
              Apply Clean Enhance
            </button>
          </div>
        ) : null}
    </>
  );

  const drawerEl = <div className={drawerClassName}>{drawerPanelsEl}</div>;

  const inlineArtTools =
    operatingTable && enableArtTools ? (
      <>
        <DropStudioArtPalette
          hostRef={previewRef}
          initialOverlayUrl={normalized.artOverlayUrl}
          onOverlayChange={(artOverlayUrl) =>
            update({ ...normalized, artOverlayUrl })
          }
        />
        {artTools}
      </>
    ) : enableArtTools ? (
      artTools
    ) : null;

  const deckPanelEl = (
    <DropStudioPaletteDeck
      tool={tool}
      onToolChange={setTool}
      drawer={drawerPanelsEl}
      artTools={inlineArtTools}
    />
  );

  if (operatingTable) {
    const workbench = (
      <DropChipWorkbench
        chip={previewEl}
        deck={deckPanelEl}
        mediaFrame={mediaFrame}
        onToggleFrame={() => {
          const next = mediaFrame === "landscape" ? "portrait" : "landscape";
          if (timelineOn) v5.setAspect(next);
          setMediaFrame(next);
        }}
        monitorAspect={timelineOn ? DROP_STUDIO_V5_ASPECTS[v5.session.aspect].css : undefined}
        monitorRatio={timelineOn ? monitorAspectRatio(v5.session.aspect) : undefined}
      />
    );
    if (!timelineOn) return workbench;
    return (
      <div className={styles.v5Workbench} data-studio-v5="1">
        <div className={styles.v5MonitorSlot}>{workbench}</div>
        <DropStudioV5Timeline
          session={v5.session}
          selectedClipId={v5.selectedClipId}
          canUndo={v5.canUndo}
          canRedo={v5.canRedo}
          extraClipCount={v5.extraClipCount}
          onSelectClip={v5.setSelectedClipId}
          onScrub={v5.scrub}
          onImportVideo={(file) => void v5.importVideo(file)}
          onImportAudio={(file) => void v5.importAudio(file)}
          onSplit={v5.split}
          onReorder={v5.reorder}
          onDelete={v5.remove}
          onTrim={v5.trim}
          onUndo={v5.undo}
          onRedo={v5.redo}
          onAspect={(aspect) => {
            v5.setAspect(aspect);
            setMediaFrame(aspectToMediaFrame(aspect));
          }}
          onCropFit={v5.cropFit}
          onCropFill={v5.cropFill}
          onCropInset={v5.cropInset}
        />
        <audio
          ref={audioRef}
          hidden
          preload="metadata"
          src={v5.audioPreviewUrl}
        />
      </div>
    );
  }

  return (
    <section className={`${styles.studio} ${compact ? styles.compact : ""}`}>
      {headerEl}
      {previewEl}
      {hintEl}
      {toolbarEl}
      {drawerEl}

      {/* Future Drop Studio layers: deeper Aura Effects and animated Board sticker assets. */}
    </section>
  );
}

export default memo(DropStudio);
