"use client";

import type React from "react";
import { memo, useRef, useState } from "react";
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
  value,
  onChange,
  compact = false,
  hideHeader = false,
  operatingTable = false,
  artTools,
  onMediaError,
}: {
  mediaUrl: string;
  mediaKind: "image" | "video";
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  compact?: boolean;
  hideHeader?: boolean;
  /** Uniform 4:5 monitor + Palette overlay (Drop Studio stage). */
  operatingTable?: boolean;
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

  const normalized = compactDropCustomizations(value) ?? {};

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
            <video
              key={mediaUrl}
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              style={mediaRotationStyle}
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

  const inlineArtTools = operatingTable ? (
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
  ) : (
    artTools
  );

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

      {/* Future Drop Studio layers: deeper Aura Effects and animated Board sticker assets. */}
    </section>
  );
}

export default memo(DropStudio);
