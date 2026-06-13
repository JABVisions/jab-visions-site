"use client";

import { memo, useState, type ReactNode } from "react";
import type { DropMediaFrame } from "@/lib/board/mediaFormat";
import { FrameRotateIcon } from "./icons/FrameRotateIcon";
import { PaletteIcon } from "./icons/PaletteIcon";
import styles from "./dropChipWorkbench.module.css";

/** The drop chip — full 4:5 monitor (camera, preview, canvas, vocal viz). */
export function DropChipMonitor({
  children,
  overlay,
  className,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.dropChipMonitor} ${className ?? ""}`.trim()}>
      <div className={styles.dropChipMonitorFill}>{children}</div>
      {overlay}
    </div>
  );
}

/** Capture/create — chip only, centered (no Palette). */
export function DropChipStage({
  children,
  overlay,
  mediaFrame = "portrait",
}: {
  children: ReactNode;
  overlay?: ReactNode;
  mediaFrame?: DropMediaFrame;
}) {
  return (
    <div className={`${styles.root} ${styles.chipOnlyRoot}`.trim()} data-drop-chip-host>
      <div className={styles.chipSlot}>
        <div className={styles.chipFrame} data-frame={mediaFrame}>
          <DropChipMonitor overlay={overlay}>{children}</DropChipMonitor>
        </div>
      </div>
    </div>
  );
}

/** Edit phase — Palette opens from the dock; tap the canvas to dismiss and return to editing. */
export default function DropChipWorkbench({
  chip,
  deck,
  mediaFrame = "portrait",
  onToggleFrame,
}: {
  chip: ReactNode;
  deck: ReactNode;
  defaultDeckOpen?: boolean;
  mediaFrame?: DropMediaFrame;
  /** Portrait ↔ landscape — shown as the rotate dock button above Palette. */
  onToggleFrame?: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [frameSpinning, setFrameSpinning] = useState(false);
  const [frameSpinFrom, setFrameSpinFrom] = useState(0);

  function handleToggleFrame() {
    if (!onToggleFrame) return;
    setFrameSpinFrom(mediaFrame === "landscape" ? 90 : 0);
    setFrameSpinning(true);
    onToggleFrame();
    window.setTimeout(() => setFrameSpinning(false), 420);
  }

  return (
    <div
      className={`${styles.root} ${styles.workbench} ${paletteOpen ? styles.paletteOpen : ""}`.trim()}
      data-drop-chip-host
      data-palette-open={paletteOpen ? "true" : "false"}
      data-deck-open={paletteOpen ? "true" : "false"}
    >
      <div className={styles.chipSlot}>
        <div className={styles.chipAssembly}>
          <div className={styles.chipFrame} data-frame={mediaFrame}>
            <DropChipMonitor
              overlay={
                <>
                  {paletteOpen ? (
                    <button
                      type="button"
                      className={styles.paletteDismiss}
                      aria-label="Return to canvas"
                      title="Return to canvas"
                      onClick={() => setPaletteOpen(false)}
                    />
                  ) : null}
                  <aside
                    id="drop-studio-palette"
                    className={styles.palettePanel}
                    aria-label="Palette"
                    aria-hidden={!paletteOpen}
                  >
                    <div className={styles.paletteBody}>{deck}</div>
                  </aside>
                </>
              }
            >
              {chip}
            </DropChipMonitor>
          </div>

          {!paletteOpen ? (
            <div className={styles.chipDock}>
              {onToggleFrame ? (
                <button
                  type="button"
                  className={styles.chipDockBtn}
                  data-frame={mediaFrame}
                  disabled={frameSpinning}
                  onClick={handleToggleFrame}
                  aria-label={
                    mediaFrame === "landscape"
                      ? "Switch to portrait frame"
                      : "Switch to landscape frame"
                  }
                  title={mediaFrame === "landscape" ? "Portrait 4:5" : "Landscape 16:9"}
                >
                  <FrameRotateIcon
                    size={21}
                    landscape={mediaFrame === "landscape"}
                    spinning={frameSpinning}
                    spinFromDeg={frameSpinFrom}
                  />
                </button>
              ) : null}
              <button
                type="button"
                className={styles.chipDockBtn}
                onClick={() => setPaletteOpen(true)}
                aria-expanded={false}
                aria-controls="drop-studio-palette"
                aria-label="Open Palette"
                title="Open Palette"
              >
                <PaletteIcon size={21} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
