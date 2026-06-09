"use client";

import type React from "react";
import { useRef, useState } from "react";
import {
  compactDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import DropStudioOverlay from "./DropStudioOverlay";
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

type Tool = "text" | "stickers" | "button" | "effects" | "filters" | "enhance";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DropStudio({
  mediaUrl,
  mediaKind,
  value,
  onChange,
  compact = false,
}: {
  mediaUrl: string;
  mediaKind: "image" | "video";
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  compact?: boolean;
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
      effects:
        nextEffects.filter || nextEffects.overlay
          ? nextEffects
          : undefined,
    });
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

  return (
    <section className={`${styles.studio} ${compact ? styles.compact : ""}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Drop Studio</div>
          <div className={styles.title}>Customize this media drop.</div>
        </div>
        <span className={styles.version}>Vision Tools</span>
      </div>

      <div
        ref={previewRef}
        className={`${styles.preview} ${
          normalized.effects?.filter ? styles[`filter_${normalized.effects.filter}`] ?? "" : ""
        } ${
          normalized.effects?.overlay ? styles[`overlay_${normalized.effects.overlay}`] ?? "" : ""
        }`}
        onPointerMove={moveItem}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {mediaKind === "video" ? (
          <video src={mediaUrl} controls playsInline preload="metadata" />
        ) : (
          <img src={mediaUrl} alt="Drop Studio media preview" />
        )}
        <DropStudioOverlay
          customizations={normalized}
          editable
          onMove={(kind, id, event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging({ kind, id });
          }}
          onRemove={removeItem}
        />
      </div>

      <div className={styles.hint}>
        Drag labels and emojis. Use the layer list to remove anything on mobile.
      </div>

      <div className={styles.tools} aria-label="Drop Studio tools">
        {(["text", "stickers", "button", "effects", "filters", "enhance"] as Tool[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tool === item ? styles.activeTool : ""}
            onClick={() => setTool(item)}
          >
            {item === "text"
              ? "Text"
              : item === "stickers"
                ? "Stickers"
                : item === "button"
                  ? "Button"
                  : item === "effects"
                    ? "Effects"
                    : item === "filters"
                      ? "Filters"
                      : "Enhance"}
          </button>
        ))}
      </div>

      <div className={styles.drawer}>
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
                placeholder="Add a short floating label"
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
      </div>

      {/* Future Drop Studio layers: deeper Aura Effects and animated Board sticker assets. */}
    </section>
  );
}
