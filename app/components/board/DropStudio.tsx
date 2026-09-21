"use client";

import type React from "react";
import { memo, useEffect, useRef, useState } from "react";
import {
  compactDropCustomizations,
  resolveLayerStack,
  type DropCustomization,
  type DropStudioArtLayer,
  type DropStudioEffects,
  type DropStudioLayerRef,
} from "@/lib/board/dropCustomizations";
import {
  compositeArtLayers,
  createEmptyArtLayer,
  duplicateArtLayer,
  flattenArtLayers,
  mergeArtLayerDown,
} from "@/lib/board/dropArtLayers";
import {
  normalizeDropMediaRotation,
  resolveDropMediaFrame,
  type DropMediaFrame,
} from "@/lib/board/mediaFormat";
import { dropMediaRotationStyle } from "@/lib/board/dropMediaFrameDisplay";
import DropChipWorkbench from "./DropChipWorkbench";
import DropStudioArtPalette from "./DropStudioArtPalette";
import DropStudioLayersPanel, { type LayerRow } from "./DropStudioLayersPanel";
import DropStudioOverlay from "./DropStudioOverlay";
import DropStudioPaletteDeck, { type ObjectTool } from "./DropStudioPaletteDeck";
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

/** Stable id for the one implicit "Background" layer a brand-new drop starts with. */
const DEFAULT_ART_LAYER_ID = "art-default";
/** Stable id Drop Studio always used for the single flattened pre-layers art overlay. */
const LEGACY_ART_LAYER_ID = "art-legacy";

type Tool = ObjectTool;

function toolLabel(item: Tool) {
  switch (item) {
    case "layers":
      return "Layers";
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
}: {
  src: string;
  contentType?: string;
  style?: React.CSSProperties;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.load();
  }, [src, contentType]);

  function showFirstFrame() {
    const el = videoRef.current;
    if (!el) return;
    if (el.currentTime === 0) {
      try {
        el.currentTime = 0.05;
      } catch {
        // Some blobs reject a seek until more data arrives.
      }
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

  return (
    <>
      <video
        ref={videoRef}
        key={src}
        src={src}
        controls
        playsInline
        preload="auto"
        style={style}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={showFirstFrame}
        onLoadedData={showFirstFrame}
        onPointerDown={(event) => event.stopPropagation()}
        onError={() => onError?.()}
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
  /** Brush / Art Palette overlays — only when the Art mode button is on. */
  enableArtTools?: boolean;
  /** Art brush tools — rendered below object tool panels in the Palette drawer. */
  artTools?: React.ReactNode;
  /** Rebuild preview URL if a blob fails to paint (e.g. revoked object URL). */
  onMediaError?: () => void;
}) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>("text");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState<{
    kind: "text" | "sticker";
    id: string;
  } | null>(null);
  const [activeArtLayerId, setActiveArtLayerId] = useState<string | null>(null);

  const normalized = compactDropCustomizations(value) ?? {};

  function update(next: DropCustomization) {
    onChange(compactDropCustomizations(next) ?? {});
  }

  // ---- Art Mode layers -----------------------------------------------
  // A brand-new drop implicitly has one empty "Background" layer; an older
  // drop with only a flattened `artOverlayUrl` implicitly has one "Artwork"
  // layer built from it. Neither is written to the customization until the
  // user actually does something with it (draws, renames, reorders, …).
  const effectiveArtLayers: DropStudioArtLayer[] = normalized.artLayers?.length
    ? normalized.artLayers
    : normalized.artOverlayUrl
      ? [
          {
            id: LEGACY_ART_LAYER_ID,
            name: "Artwork",
            dataUrl: normalized.artOverlayUrl,
            visible: true,
            locked: false,
            opacity: 1,
          },
        ]
      : [
          {
            id: DEFAULT_ART_LAYER_ID,
            name: "Background",
            visible: true,
            locked: false,
            opacity: 1,
          },
        ];

  const effectiveArtLayerIds = effectiveArtLayers.map((l) => l.id).join(",");
  useEffect(() => {
    setActiveArtLayerId((current) => {
      if (current && effectiveArtLayers.some((l) => l.id === current)) return current;
      return effectiveArtLayers[effectiveArtLayers.length - 1]?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveArtLayerIds]);

  const stackWithEffectiveArt = resolveLayerStack({ ...normalized, artLayers: effectiveArtLayers });
  const artOnlyOrder = stackWithEffectiveArt.filter((r) => r.kind === "art").map((r) => r.id);
  const artLayersInStackOrder = artOnlyOrder
    .map((id) => effectiveArtLayers.find((l) => l.id === id))
    .filter((l): l is DropStudioArtLayer => Boolean(l));

  function freezeStack(nextStack?: DropStudioLayerRef[]) {
    return nextStack ?? stackWithEffectiveArt;
  }

  async function commitArtLayers(nextArtLayers: DropStudioArtLayer[], nextStack?: DropStudioLayerRef[]) {
    const layerStack = freezeStack(nextStack);
    const artOverlayUrl = await compositeArtLayers(nextArtLayers);
    update({ ...normalized, artLayers: nextArtLayers, layerStack, artOverlayUrl });
  }

  function mergeArtIntoStack(nextLayers: DropStudioArtLayer[], insertAfterId: string | null) {
    const nextIds = new Set(nextLayers.map((l) => l.id));
    const kept = stackWithEffectiveArt.filter((ref) => ref.kind !== "art" || nextIds.has(ref.id));
    const keptArtIds = new Set(kept.filter((r) => r.kind === "art").map((r) => r.id));
    const newRefs: DropStudioLayerRef[] = nextLayers
      .filter((l) => !keptArtIds.has(l.id))
      .map((l) => ({ id: l.id, kind: "art" as const }));
    if (!newRefs.length) return kept;
    const insertIndex = insertAfterId ? kept.findIndex((r) => r.id === insertAfterId) : -1;
    if (insertIndex === -1) return [...newRefs, ...kept];
    return [...kept.slice(0, insertIndex + 1), ...newRefs, ...kept.slice(insertIndex + 1)];
  }

  function handleArtStrokeCommit(nextLayers: DropStudioArtLayer[]) {
    // Stroke commits never change membership, so the stack never needs remerging.
    void commitArtLayers(nextLayers);
  }

  function handleNewArtLayer() {
    const layer = createEmptyArtLayer(`Layer ${effectiveArtLayers.length + 1}`);
    const next = [...effectiveArtLayers, layer];
    const nextStack = mergeArtIntoStack(next, activeArtLayerId);
    setActiveArtLayerId(layer.id);
    void commitArtLayers(next, nextStack);
  }

  function handleDuplicateArtLayer(id: string) {
    const original = effectiveArtLayers.find((l) => l.id === id);
    if (!original) return;
    const copy = duplicateArtLayer(original);
    const next = [...effectiveArtLayers, copy];
    const nextStack = mergeArtIntoStack(next, id);
    setActiveArtLayerId(copy.id);
    void commitArtLayers(next, nextStack);
  }

  function handleDeleteArtLayer(id: string) {
    if (effectiveArtLayers.length <= 1) return; // always keep at least one layer
    const next = effectiveArtLayers.filter((l) => l.id !== id);
    const nextStack = stackWithEffectiveArt.filter((r) => r.id !== id);
    void commitArtLayers(next, nextStack);
  }

  function handleRenameArtLayer(id: string, name: string) {
    const next = effectiveArtLayers.map((l) => (l.id === id ? { ...l, name } : l));
    void commitArtLayers(next);
  }

  function handleToggleArtVisible(id: string) {
    const next = effectiveArtLayers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
    void commitArtLayers(next);
  }

  function handleToggleArtLocked(id: string) {
    const next = effectiveArtLayers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l));
    void commitArtLayers(next);
  }

  function handleArtOpacity(id: string, opacity: number) {
    const next = effectiveArtLayers.map((l) => (l.id === id ? { ...l, opacity } : l));
    void commitArtLayers(next);
  }

  async function handleMergeArtDown(id: string) {
    const merged = await mergeArtLayerDown(artLayersInStackOrder, id);
    const nextStack = stackWithEffectiveArt.filter((r) => r.id !== id);
    setActiveArtLayerId((current) => (current === id ? merged[merged.length - 1]?.id ?? null : current));
    void commitArtLayers(merged, nextStack);
  }

  async function handleFlattenArt() {
    const flat = await flattenArtLayers(artLayersInStackOrder);
    if (flat.length === artLayersInStackOrder.length) return;
    const nextStack = stackWithEffectiveArt.filter((r) => r.kind !== "art");
    const finalStack = [{ id: flat[0].id, kind: "art" as const }, ...nextStack];
    setActiveArtLayerId(flat[0].id);
    void commitArtLayers(flat, finalStack);
  }

  // ---- Text / stickers (existing model, now layer-aware) --------------

  function addText() {
    const clean = text.trim().slice(0, 48);
    if (!clean) return;
    const id = makeId("text");
    const nextStack = [...stackWithEffectiveArt, { id, kind: "text" as const }];
    update({
      ...normalized,
      artLayers: effectiveArtLayers,
      textLabels: [...(normalized.textLabels ?? []), { id, text: clean, x: 50, y: 28, visible: true, locked: false, opacity: 1 }],
      layerStack: nextStack,
    });
    setText("");
  }

  function addSticker(item: StickerItem, pack: StickerPack) {
    const id = makeId("sticker");
    const nextStack = [...stackWithEffectiveArt, { id, kind: "sticker" as const }];
    update({
      ...normalized,
      artLayers: effectiveArtLayers,
      stickers: [
        ...(normalized.stickers ?? []),
        {
          id,
          type: stickerTypeForPack(pack.kind),
          value: item.value,
          label: item.label,
          ...(item.src ? { src: item.src } : {}),
          pack: pack.id,
          x: 50,
          y: 52,
          visible: true,
          locked: false,
          opacity: 1,
        },
      ],
      layerStack: nextStack,
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

  function toggleMediaFrame() {
    setMediaFrame(mediaFrame === "landscape" ? "portrait" : "landscape");
  }

  function removeItem(kind: "text" | "sticker", id: string) {
    update({
      ...normalized,
      ...(kind === "text"
        ? { textLabels: normalized.textLabels?.filter((item) => item.id !== id) }
        : { stickers: normalized.stickers?.filter((item) => item.id !== id) }),
      layerStack: stackWithEffectiveArt.filter((r) => r.id !== id),
    });
  }

  function duplicateItem(kind: "text" | "sticker", id: string) {
    if (kind === "text") {
      const original = normalized.textLabels?.find((t) => t.id === id);
      if (!original) return;
      const copy = { ...original, id: makeId("text"), x: Math.min(96, original.x + 4), y: Math.min(96, original.y + 4) };
      const index = stackWithEffectiveArt.findIndex((r) => r.id === id);
      const nextStack = [...stackWithEffectiveArt];
      nextStack.splice(index + 1, 0, { id: copy.id, kind: "text" });
      update({ ...normalized, textLabels: [...(normalized.textLabels ?? []), copy], layerStack: nextStack });
    } else {
      const original = normalized.stickers?.find((s) => s.id === id);
      if (!original) return;
      const copy = { ...original, id: makeId("sticker"), x: Math.min(96, original.x + 4), y: Math.min(96, original.y + 4) };
      const index = stackWithEffectiveArt.findIndex((r) => r.id === id);
      const nextStack = [...stackWithEffectiveArt];
      nextStack.splice(index + 1, 0, { id: copy.id, kind: "sticker" });
      update({ ...normalized, stickers: [...(normalized.stickers ?? []), copy], layerStack: nextStack });
    }
  }

  function renameItem(kind: "text" | "sticker", id: string, name: string) {
    const clean = name.trim().slice(0, 48);
    if (!clean) return;
    if (kind === "text") {
      update({
        ...normalized,
        textLabels: normalized.textLabels?.map((t) => (t.id === id ? { ...t, text: clean } : t)),
      });
    } else {
      update({
        ...normalized,
        stickers: normalized.stickers?.map((s) => (s.id === id ? { ...s, label: clean.slice(0, 24) } : s)),
      });
    }
  }

  function toggleItemVisible(kind: "text" | "sticker", id: string) {
    if (kind === "text") {
      update({
        ...normalized,
        textLabels: normalized.textLabels?.map((t) => (t.id === id ? { ...t, visible: t.visible === false } : t)),
      });
    } else {
      update({
        ...normalized,
        stickers: normalized.stickers?.map((s) => (s.id === id ? { ...s, visible: s.visible === false } : s)),
      });
    }
  }

  function toggleItemLocked(kind: "text" | "sticker", id: string) {
    if (kind === "text") {
      update({
        ...normalized,
        textLabels: normalized.textLabels?.map((t) => (t.id === id ? { ...t, locked: !t.locked } : t)),
      });
    } else {
      update({
        ...normalized,
        stickers: normalized.stickers?.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)),
      });
    }
  }

  function itemOpacity(kind: "text" | "sticker", id: string, opacity: number) {
    if (kind === "text") {
      update({
        ...normalized,
        textLabels: normalized.textLabels?.map((t) => (t.id === id ? { ...t, opacity } : t)),
      });
    } else {
      update({
        ...normalized,
        stickers: normalized.stickers?.map((s) => (s.id === id ? { ...s, opacity } : s)),
      });
    }
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

  // ---- Unified Layers panel rows ---------------------------------------

  const layerRows: LayerRow[] = stackWithEffectiveArt
    .map((ref): LayerRow | null => {
      if (ref.kind === "art") {
        const layer = effectiveArtLayers.find((l) => l.id === ref.id);
        if (!layer) return null;
        return {
          id: layer.id,
          kind: "art",
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
          thumb: layer.dataUrl ? { type: "image", src: layer.dataUrl } : { type: "empty" },
          isActive: layer.id === activeArtLayerId,
          canMergeDown: artOnlyOrder.indexOf(layer.id) > 0,
        };
      }
      if (ref.kind === "text") {
        const label = normalized.textLabels?.find((t) => t.id === ref.id);
        if (!label) return null;
        return {
          id: label.id,
          kind: "text",
          name: label.text,
          visible: label.visible !== false,
          locked: Boolean(label.locked),
          opacity: label.opacity ?? 1,
          thumb: { type: "text", value: label.text },
          isActive: false,
          canMergeDown: false,
        };
      }
      const sticker = normalized.stickers?.find((s) => s.id === ref.id);
      if (!sticker) return null;
      return {
        id: sticker.id,
        kind: "sticker",
        name: sticker.label || sticker.value,
        visible: sticker.visible !== false,
        locked: Boolean(sticker.locked),
        opacity: sticker.opacity ?? 1,
        thumb: sticker.src ? { type: "image", src: sticker.src } : { type: "emoji", value: sticker.value },
        isActive: false,
        canMergeDown: false,
      };
    })
    .filter((row): row is LayerRow => Boolean(row));

  function rowKind(id: string): "art" | "text" | "sticker" | undefined {
    return layerRows.find((r) => r.id === id)?.kind;
  }

  function handleLayerSelect(id: string) {
    const kind = rowKind(id);
    if (kind === "art") setActiveArtLayerId(id);
  }
  function handleLayerRename(id: string, name: string) {
    const kind = rowKind(id);
    if (kind === "art") handleRenameArtLayer(id, name);
    else if (kind === "text" || kind === "sticker") renameItem(kind, id, name);
  }
  function handleLayerToggleVisible(id: string) {
    const kind = rowKind(id);
    if (kind === "art") handleToggleArtVisible(id);
    else if (kind === "text" || kind === "sticker") toggleItemVisible(kind, id);
  }
  function handleLayerToggleLock(id: string) {
    const kind = rowKind(id);
    if (kind === "art") handleToggleArtLocked(id);
    else if (kind === "text" || kind === "sticker") toggleItemLocked(kind, id);
  }
  function handleLayerOpacity(id: string, opacity: number) {
    const kind = rowKind(id);
    if (kind === "art") handleArtOpacity(id, opacity);
    else if (kind === "text" || kind === "sticker") itemOpacity(kind, id, opacity);
  }
  function handleLayerDuplicate(id: string) {
    const kind = rowKind(id);
    if (kind === "art") handleDuplicateArtLayer(id);
    else if (kind === "text" || kind === "sticker") duplicateItem(kind, id);
  }
  function handleLayerDelete(id: string) {
    const kind = rowKind(id);
    if (kind === "art") handleDeleteArtLayer(id);
    else if (kind === "text" || kind === "sticker") removeItem(kind, id);
  }
  function handleLayerMergeDown(id: string) {
    if (rowKind(id) === "art") void handleMergeArtDown(id);
  }
  function handleLayerReorder(orderedIds: string[]) {
    const kindById = new Map(layerRows.map((r) => [r.id, r.kind]));
    const nextStack: DropStudioLayerRef[] = orderedIds
      .map((id) => {
        const kind = kindById.get(id);
        return kind ? { id, kind } : null;
      })
      .filter((r): r is DropStudioLayerRef => Boolean(r));
    update({ ...normalized, artLayers: effectiveArtLayers, layerStack: nextStack });
  }

  const headerEl = hideHeader ? null : (
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Drop Studio</div>
        <div className={styles.title}>Customize this media drop.</div>
      </div>
      <span className={styles.version}>Vision Tools</span>
    </div>
  );

  const previewEl = (
    <div
      ref={previewRef}
      className={`${styles.preview} ${operatingTable ? styles.previewInFrame : ""} ${
        normalized.effects?.filter ? styles[`filter_${normalized.effects.filter}`] ?? "" : ""
      } ${
        normalized.effects?.overlay ? styles[`overlay_${normalized.effects.overlay}`] ?? "" : ""
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
              src={mediaUrl}
              contentType={mediaContentType}
              style={mediaRotationStyle}
              onError={() => onMediaError?.()}
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
        customizations={{ ...normalized, artLayers: effectiveArtLayers }}
        editable
        skipArtLayers={operatingTable && enableArtTools}
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
      Drag labels and emojis. Open Layers to reorder, hide, lock, or fine-tune anything on this drop.
    </div>
  );

  const toolsClassName = styles.tools;
  const drawerClassName = styles.drawer;
  const activeToolClassName = styles.activeTool;

  const toolbarEl = (
    <div className={toolsClassName} aria-label="Drop Studio tools">
      {(["layers", "text", "stickers", "button", "effects", "filters", "enhance"] as Tool[]).map((item) => (
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
        {tool === "layers" ? (
          <DropStudioLayersPanel
            rows={layerRows}
            onSelect={handleLayerSelect}
            onRename={handleLayerRename}
            onToggleVisible={handleLayerToggleVisible}
            onToggleLock={handleLayerToggleLock}
            onOpacityChange={handleLayerOpacity}
            onDuplicate={handleLayerDuplicate}
            onDelete={handleLayerDelete}
            onMergeDown={handleLayerMergeDown}
            onReorder={handleLayerReorder}
            onNewArtLayer={handleNewArtLayer}
            onFlattenArt={() => void handleFlattenArt()}
          />
        ) : null}

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
          layers={effectiveArtLayers}
          activeLayerId={activeArtLayerId}
          onActiveLayerChange={setActiveArtLayerId}
          onLayersChange={handleArtStrokeCommit}
          onNewLayerAbove={handleNewArtLayer}
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
    return (
      <DropChipWorkbench
        chip={previewEl}
        deck={deckPanelEl}
        mediaFrame={mediaFrame}
        onToggleFrame={toggleMediaFrame}
      />
    );
  }

  return (
    <section className={`${styles.studio} ${compact ? styles.compact : ""}`}>
      {headerEl}
      {previewEl}
      {hintEl}
      {toolbarEl}
      {drawerEl}
    </section>
  );
}

export default memo(DropStudio);
