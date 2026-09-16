"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { DropMediaFrame } from "@/lib/board/mediaFormat";
import { FrameRotateIcon } from "./icons/FrameRotateIcon";
import { PaletteIcon } from "./icons/PaletteIcon";
import styles from "./dropChipWorkbench.module.css";

const PALETTE_HALF = 50;
const PALETTE_FULL = 100;
const PALETTE_SNAP = 72;

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

/** Edit phase — Palette slides in from the left over the monitor. */
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
  const [paletteFull, setPaletteFull] = useState(false);
  const [paletteDragging, setPaletteDragging] = useState(false);
  const [frameSpinning, setFrameSpinning] = useState(false);
  const [frameSpinFrom, setFrameSpinFrom] = useState(0);
  const assemblyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragPctRef = useRef(PALETTE_HALF);

  function handleToggleFrame() {
    if (!onToggleFrame) return;
    setFrameSpinFrom(mediaFrame === "landscape" ? 90 : 0);
    setFrameSpinning(true);
    onToggleFrame();
    window.setTimeout(() => setFrameSpinning(false), 420);
  }

  const openPalette = useCallback(() => {
    setPaletteFull(false);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteFull(false);
    setPaletteDragging(false);
    panelRef.current?.style.removeProperty("width");
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePalette();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, closePalette]);

  function applyWidth(pct: number) {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.width = `${pct}%`;
  }

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!paletteOpen) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPctRef.current = paletteFull ? PALETTE_FULL : PALETTE_HALF;
    setPaletteDragging(true);
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const assembly = assemblyRef.current;
    if (!assembly) return;
    const rect = assembly.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const clamped = Math.min(PALETTE_FULL, Math.max(PALETTE_HALF, pct));
    dragPctRef.current = clamped;
    applyWidth(clamped);
  }

  function onHandlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const nextFull = dragPctRef.current >= PALETTE_SNAP;
    setPaletteFull(nextFull);
    setPaletteDragging(false);
    panelRef.current?.style.removeProperty("width");
  }

  const showDock = !paletteFull;

  return (
    <div
      className={`${styles.root} ${styles.workbench} ${paletteOpen ? styles.paletteOpen : ""} ${
        paletteFull ? styles.paletteFull : ""
      }`.trim()}
      data-drop-chip-host
      data-palette-open={paletteOpen ? "true" : "false"}
      data-palette-size={paletteFull ? "full" : "half"}
      data-deck-open={paletteOpen ? "true" : "false"}
    >
      <div className={styles.chipSlot}>
        <div ref={assemblyRef} className={styles.chipAssembly}>
          <div className={styles.chipFrame} data-frame={mediaFrame}>
            <DropChipMonitor
              overlay={
                showDock ? (
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
                      onClick={openPalette}
                      aria-expanded={paletteOpen}
                      aria-controls="drop-studio-palette"
                      aria-label="Open Palette"
                      title="Open Palette"
                    >
                      <PaletteIcon size={21} />
                    </button>
                  </div>
                ) : null
              }
            >
              {chip}
            </DropChipMonitor>
          </div>

          <aside
            ref={panelRef}
            id="drop-studio-palette"
            className={`${styles.palettePanel} ${paletteDragging ? styles.palettePanelDragging : ""}`.trim()}
            aria-label="Palette"
            aria-hidden={!paletteOpen}
            data-palette-size={paletteFull ? "full" : "half"}
          >
            <div className={styles.paletteChrome}>
              <span className={styles.paletteChromeTitle}>Palette</span>
              <div className={styles.paletteChromeBtns}>
                <button
                  type="button"
                  className={styles.paletteExpand}
                  onClick={() => setPaletteFull((open) => !open)}
                  aria-pressed={paletteFull}
                  aria-label={paletteFull ? "Shrink palette to half" : "Expand palette to full screen"}
                  title={paletteFull ? "Half screen" : "Full screen"}
                >
                  {paletteFull ? "Half" : "Full"}
                </button>
                <button
                  type="button"
                  className={styles.paletteClose}
                  onClick={closePalette}
                  aria-label="Close Palette"
                  title="Close Palette"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={styles.paletteBody}>{deck}</div>
            <div
              className={styles.paletteHandle}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              onDoubleClick={() => setPaletteFull((open) => !open)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize palette"
              aria-valuemin={PALETTE_HALF}
              aria-valuemax={PALETTE_FULL}
              aria-valuenow={paletteFull ? PALETTE_FULL : PALETTE_HALF}
              title="Drag to expand"
            >
              <span className={styles.paletteHandleGrip} aria-hidden />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
