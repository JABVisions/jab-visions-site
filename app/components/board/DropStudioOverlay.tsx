"use client";

import type React from "react";
import {
  normalizeDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import styles from "./DropStudioOverlay.module.css";

export default function DropStudioOverlay({
  customizations,
  editable = false,
  onMove,
  onRemove,
}: {
  customizations?: DropCustomization | null;
  editable?: boolean;
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

  return (
    <div
      className={`${styles.overlay} ${editable ? "" : styles.lite} ${filterClass} ${overlayClass}`}
      aria-label="Drop Studio customizations"
    >
      {value.effects?.filter || value.effects?.overlay ? (
        <span className={styles.effectLayer} aria-hidden="true" />
      ) : null}

      {value.artOverlayUrl ? (
        <img
          className={styles.artOverlay}
          src={value.artOverlayUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={(event) => {
            console.warn("[DropStudioOverlay] Art Palette layer could not be displayed");
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}

      {value.textLabels?.map((label) => (
        <div key={label.id} className={styles.itemWrap} style={{ left: `${label.x}%`, top: `${label.y}%` }}>
          <button
            type="button"
            className={`${styles.item} ${styles.textLabel} ${editable ? styles.editable : ""}`}
            onPointerDown={editable ? (event) => onMove?.("text", label.id, event) : undefined}
            onDoubleClick={editable ? () => onRemove?.("text", label.id) : undefined}
            tabIndex={editable ? 0 : -1}
            aria-label={editable ? `Move ${label.text}. Double click to remove.` : label.text}
          >
            {label.text}
          </button>
          {editable ? (
            <button
              type="button"
              className={styles.removeItem}
              aria-label={`Remove ${label.text}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onRemove?.("text", label.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}

      {value.stickers?.map((sticker) => (
        <div
          key={sticker.id}
          className={styles.itemWrap}
          style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }}
        >
          <button
            type="button"
            className={`${styles.item} ${styles.sticker} ${editable ? styles.editable : ""}`}
            onPointerDown={editable ? (event) => onMove?.("sticker", sticker.id, event) : undefined}
            onDoubleClick={editable ? () => onRemove?.("sticker", sticker.id) : undefined}
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
          {editable ? (
            <button
              type="button"
              className={styles.removeItem}
              aria-label={`Remove ${sticker.value ?? sticker.label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onRemove?.("sticker", sticker.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}

      {value.actionButton ? (
        <span className={styles.actionButton}>{value.actionButton.label}</span>
      ) : null}
    </div>
  );
}
