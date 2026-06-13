"use client";

import type { RefObject } from "react";
import styles from "./boardArtCanvas.module.css";

export type ArtBrushMode = "paint" | "blend" | "erase";

type ArtPaletteToolsProps = {
  wheelRef: RefObject<HTMLDivElement | null>;
  color: string;
  size: number;
  light: number;
  wheelHue: number;
  wheelSat: number;
  brushMode: ArtBrushMode;
  paper: boolean;
  onPhoto: boolean;
  saveLabel: string;
  onPickFromWheel: (clientX: number, clientY: number) => void;
  onWheelPointerMove: (clientX: number, clientY: number) => void;
  onWheelDragStart: () => void;
  onWheelDragEnd: () => void;
  onColorPick: (color: string) => void;
  onLightChange: (light: number, color: string) => void;
  onSizeChange: (size: number) => void;
  onBrushModeChange: (mode: ArtBrushMode) => void;
  onPaperToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
};

const BOARD_COLORS = [
  "#FF4FD8",
  "#7EE2FF",
  "#B7FF2D",
  "#FFD12D",
  "#FF2D6D",
  "#7A44FF",
  "#FFFFFF",
  "#111111",
];

/** Brush + color controls for the Drop Studio Palette drawer. */
export default function ArtPaletteTools({
  wheelRef,
  color,
  size,
  light,
  wheelHue,
  wheelSat,
  brushMode,
  paper,
  onPhoto,
  saveLabel,
  onPickFromWheel,
  onWheelPointerMove,
  onWheelDragStart,
  onWheelDragEnd,
  onColorPick,
  onLightChange,
  onSizeChange,
  onBrushModeChange,
  onPaperToggle,
  onUndo,
  onRedo,
  onClear,
  onSave,
}: ArtPaletteToolsProps) {
  return (
    <div className={[styles.paletteToolsRoot, styles.toolsDeck, styles.toolsPalette].join(" ")}>
      <div className={styles.wheelRow}>
        <div
          ref={wheelRef}
          className={styles.wheel}
          role="slider"
          aria-label="Color wheel"
          aria-valuetext={color}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onWheelDragStart();
            onPickFromWheel(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => onWheelPointerMove(e.clientX, e.clientY)}
          onPointerUp={onWheelDragEnd}
          onPointerCancel={onWheelDragEnd}
        >
          <span
            className={styles.wheelDot}
            style={{
              left: `${50 + Math.cos((wheelHue * Math.PI) / 180) * (wheelSat / 2)}%`,
              top: `${50 + Math.sin((wheelHue * Math.PI) / 180) * (wheelSat / 2)}%`,
              background: color,
            }}
            aria-hidden
          />
        </div>

        <div className={styles.wheelSide}>
          <div className={styles.colors}>
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={[
                  styles.swatch,
                  brushMode !== "erase" && color.toLowerCase() === c.toLowerCase() ? styles.swatchOn : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ background: c }}
                onClick={() => onColorPick(c)}
                aria-label={`Color ${c}`}
              />
            ))}
            {onPhoto ? null : (
              <button
                type="button"
                className={`${styles.bgToggle} ${styles.bgToggleInline}`}
                onClick={onPaperToggle}
                aria-pressed={paper}
              >
                {paper ? "Paper" : "Dark"}
              </button>
            )}
          </div>
          <div className={styles.light}>
            <span className={styles.fieldLabel}>Light</span>
            <input
              type="range"
              min={10}
              max={92}
              value={light}
              onChange={(e) => onLightChange(Number(e.target.value), color)}
              aria-label="Lightness"
            />
          </div>
          <div className={styles.brush}>
            <div className={styles.brushRow}>
              <span className={styles.fieldLabel}>Brush</span>
              <span
                className={styles.brushDot}
                style={{
                  width: Math.max(6, size),
                  height: Math.max(6, size),
                  background: brushMode === "erase" ? "transparent" : color,
                  border: brushMode === "erase" ? "2px dashed rgba(255,255,255,0.7)" : undefined,
                  boxShadow:
                    brushMode === "blend"
                      ? `0 0 14px ${color}, 0 0 6px rgba(255,255,255,0.45)`
                      : undefined,
                }}
                aria-hidden
              />
              <input
                type="range"
                min={2}
                max={48}
                value={size}
                onChange={(e) => onSizeChange(Number(e.target.value))}
                aria-label="Brush size"
              />
            </div>
            <button
              type="button"
              className={[styles.blendBrushBtn, brushMode === "blend" ? styles.blendBrushBtnOn : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onBrushModeChange("blend")}
              aria-pressed={brushMode === "blend"}
            >
              Blend Brush
            </button>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={[styles.ghost, brushMode === "paint" ? styles.ghostOn : ""].filter(Boolean).join(" ")}
          onClick={() => onBrushModeChange("paint")}
          aria-pressed={brushMode === "paint"}
        >
          Paint
        </button>
        <button
          type="button"
          className={[styles.ghost, brushMode === "erase" ? styles.ghostOn : ""].filter(Boolean).join(" ")}
          onClick={() => onBrushModeChange("erase")}
          aria-pressed={brushMode === "erase"}
        >
          Eraser
        </button>
        <button type="button" className={styles.ghost} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={styles.ghost} onClick={onRedo}>
          Redo
        </button>
        <button type="button" className={styles.ghost} onClick={onClear}>
          Clear
        </button>
        <button type="button" className={styles.save} onClick={onSave}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
