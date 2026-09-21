"use client";

import type React from "react";
import {
  normalizeDropCustomizations,
  resolveArtLayerSrc,
  resolveLayerStack,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import styles from "./DropStudioOverlay.module.css";

export default function DropStudioOverlay({
  customizations,
  editable = false,
  skipArtLayers = false,
  onMove,
  onRemove,
}: {
  customizations?: DropCustomization | null;
  editable?: boolean;
  /** True while a live drawing canvas is already rendering art layers on top (avoids a double-draw). */
  skipArtLayers?: boolean;
  onMove?: (
    kind: "text" | "sticker",
    id: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
  onRemove?: (kind: "text" | "sticker", id: string) => void;
}) {
  const value = normalizeDropCustomizations(customizations);
  if (!value) return null;

  const filterClass = value.effects?.filter
    ? styles[`filter_${value.effects.filter}`] ?? ""
    : "";
  const overlayClass = value.effects?.overlay
    ? styles[`overlay_${value.effects.overlay}`] ?? ""
    : "";

  // The full z-order across art layers, text labels, and stickers, interleaved
  // and freely reorderable via the Layers panel (bottom → top).
  const stack = resolveLayerStack(value);
  const textById = new Map((value.textLabels ?? []).map((t) => [t.id, t]));
  const stickerById = new Map((value.stickers ?? []).map((s) => [s.id, s]));

  const items = stack.map((ref, index) => {
    const zIndex = 10 + index;

    if (ref.kind === "art") {
      if (skipArtLayers) return null;
      const src = resolveArtLayerSrc(value, ref);
      if (!src) return null;
      const layer = value.artLayers?.find((l) => l.id === ref.id);
      const visible = layer ? layer.visible : true;
      if (!visible && !editable) return null;
      const opacity = layer ? layer.opacity : 1;
      return (
        <img
          key={`art-${ref.id}`}
          className={`${styles.artOverlay} ${!visible ? styles.hiddenLayer : ""}`}
          style={{ zIndex, opacity: visible ? opacity : opacity * 0.35 }}
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={(event) => {
            console.warn("[DropStudioOverlay] Art layer could not be displayed");
            event.currentTarget.hidden = true;
          }}
        />
      );
    }

    if (ref.kind === "text") {
      const label = textById.get(ref.id);
      if (!label) return null;
      const visible = label.visible !== false;
      if (!visible && !editable) return null;
      const locked = Boolean(label.locked);
      const opacity = label.opacity ?? 1;
      return (
        <button
          key={`text-${ref.id}`}
          type="button"
          className={`${styles.item} ${styles.textLabel} ${editable && !locked ? styles.editable : ""} ${
            !visible ? styles.hiddenLayer : ""
          }`}
          style={{ left: `${label.x}%`, top: `${label.y}%`, zIndex, opacity: visible ? opacity : opacity * 0.35 }}
          onPointerDown={editable && !locked ? (event) => onMove?.("text", label.id, event) : undefined}
          onDoubleClick={editable && !locked ? () => onRemove?.("text", label.id) : undefined}
          tabIndex={editable ? 0 : -1}
          aria-label={editable ? `Move ${label.text}. Double click to remove.` : label.text}
        >
          {label.text}
        </button>
      );
    }

    const sticker = stickerById.get(ref.id);
    if (!sticker) return null;
    const visible = sticker.visible !== false;
    if (!visible && !editable) return null;
    const locked = Boolean(sticker.locked);
    const opacity = sticker.opacity ?? 1;
    return (
      <button
        key={`sticker-${ref.id}`}
        type="button"
        className={`${styles.item} ${styles.sticker} ${editable && !locked ? styles.editable : ""} ${
          !visible ? styles.hiddenLayer : ""
        }`}
        style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, zIndex, opacity: visible ? opacity : opacity * 0.35 }}
        onPointerDown={editable && !locked ? (event) => onMove?.("sticker", sticker.id, event) : undefined}
        onDoubleClick={editable && !locked ? () => onRemove?.("sticker", sticker.id) : undefined}
        tabIndex={editable ? 0 : -1}
        aria-label={
          editable
            ? `Move ${sticker.value ?? sticker.label}. Double click to remove.`
            : sticker.value ?? sticker.label
        }
      >
        {sticker.src ? (
          <img
            src={sticker.src}
            alt={sticker.label ?? ""}
            className={styles.stickerImage}
            draggable={false}
          />
        ) : (
          sticker.value ?? sticker.label
        )}
      </button>
    );
  });

  return (
    <div
      className={`${styles.overlay} ${editable ? "" : styles.lite} ${filterClass} ${overlayClass}`}
      aria-label="Drop Studio customizations"
    >
      {value.effects?.filter || value.effects?.overlay ? (
        <span className={styles.effectLayer} aria-hidden="true" />
      ) : null}

      {items}

      {value.actionButton ? (
        <span className={styles.actionButton}>{value.actionButton.label}</span>
      ) : null}
    </div>
  );
}
