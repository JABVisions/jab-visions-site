"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import ArtPaletteTools, { type ArtBrushMode } from "./ArtPaletteTools";
import ArtLayerStrip from "./ArtLayerStrip";
import { useArtLayerCanvases } from "./useArtLayerCanvases";
import { ART_BLEND_STRENGTH, grabArtSmudge, stampArtSmudge } from "@/lib/board/artSmudge";
import styles from "./DropStudio.module.css";

function hslToHex(h: number, s: number, l: number) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export default function DropStudioArtPalette({
  hostRef,
  initialOverlayUrl,
  onOverlayChange,
  restoreKey = "",
  restoreUrl,
  clearToken = 0,
  live = true,
  placement,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  initialOverlayUrl?: string;
  onOverlayChange: (url?: string) => void;
  /** Changes when the user selects a different art clip to keep editing. */
  restoreKey?: string;
  restoreUrl?: string;
  clearToken?: number;
  /** False while the playhead is outside the overlay being edited. */
  live?: boolean;
  placement?: { x: number; y: number; w: number; h: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const underRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const wheelDraggingRef = useRef(false);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const smudgeBufRef = useRef<HTMLCanvasElement | null>(null);
  const smudgeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const blendDiamRef = useRef(0);
  const dprRef = useRef(1);
  const initialPaintedRef = useRef(false);
  const [portalReady, setPortalReady] = useState(false);
  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const [brushMode, setBrushMode] = useState<ArtBrushMode>("paint");
  const [opacity, setOpacity] = useState(1);
  const artLayers = useArtLayerCanvases(canvasRef, contextRef);
  const [drawArmed, setDrawArmed] = useState(false);
  const restoreUrlRef = useRef(restoreUrl);
  restoreUrlRef.current = restoreUrl;

  function refreshArtChrome() {
    const draw = canvasRef.current;
    const under = underRef.current;
    const over = overRef.current;
    if (!draw || !under || !over || draw.width < 1) return;
    if (under.width !== draw.width || under.height !== draw.height) {
      under.width = draw.width;
      under.height = draw.height;
    }
    if (over.width !== draw.width || over.height !== draw.height) {
      over.width = draw.width;
      over.height = draw.height;
    }
    const underCtx = under.getContext("2d");
    const overCtx = over.getContext("2d");
    if (underCtx && overCtx) artLayers.paintLayerChrome(underCtx, overCtx);
  }

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = canvas;

    function syncCanvas() {
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (target.width === width && target.height === height && contextRef.current) return;

      const previous = document.createElement("canvas");
      previous.width = target.width || width;
      previous.height = target.height || height;
      if (target.width && target.height) previous.getContext("2d")?.drawImage(target, 0, 0);

      target.width = width;
      target.height = height;
      const context = target.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      contextRef.current = context;
      if (previous.width && previous.height) {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, width, height);
        context.restore();
      }
      refreshArtChrome();
    }

    syncCanvas();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncCanvas);
    observer?.observe(target);
    return () => observer?.disconnect();
    // Resize keeps the backing store aligned. Chrome refresh reads live layer refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalReady]);

  useEffect(() => {
    refreshArtChrome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artLayers.layers, artLayers.activeLayerId, portalReady]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
  }, [artLayers.activeLayerId]);

  useEffect(() => {
    if (!clearToken) return;
    artLayers.clearAll();
    refreshArtChrome();
    // New art starts from an empty transparent layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearToken]);

  useEffect(() => {
    if (!restoreKey) return;
    const url = restoreUrlRef.current;
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!url || !canvas || !context) return;
    const image = new Image();
    image.onload = () => {
      artLayers.clearAll();
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.restore();
      refreshArtChrome();
    };
    image.src = url;
    // Selecting another overlay reloads that PNG. Stroke updates must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey, portalReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context || !initialOverlayUrl || initialPaintedRef.current) return;
    const image = new Image();
    image.onload = () => {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.restore();
      initialPaintedRef.current = true;
    };
    image.src = initialOverlayUrl;
  }, [initialOverlayUrl, portalReady]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function snapshot() {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    undoRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (undoRef.current.length > 24) undoRef.current.shift();
    redoRef.current = [];
  }

  function configureBrush(context: CanvasRenderingContext2D) {
    context.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
    context.globalAlpha = brushMode === "erase" ? 1 : opacity;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = size;
  }

  function ensureSmudgeBuffer(diameter: number) {
    let buf = smudgeBufRef.current;
    if (!buf) {
      buf = document.createElement("canvas");
      smudgeBufRef.current = buf;
    }
    if (buf.width !== diameter || buf.height !== diameter) {
      buf.width = diameter;
      buf.height = diameter;
    }
    smudgeCtxRef.current = buf.getContext("2d");
  }

  function backgroundMedia() {
    const host = hostRef.current;
    const media = host?.querySelector("video, img");
    if (media instanceof HTMLVideoElement) {
      return {
        source: media,
        width: media.videoWidth,
        height: media.videoHeight,
      };
    }
    if (media instanceof HTMLImageElement) {
      return {
        source: media,
        width: media.naturalWidth,
        height: media.naturalHeight,
      };
    }
    return null;
  }

  function grabSmudge(cxDev: number, cyDev: number, diameter: number) {
    const buffer = smudgeCtxRef.current;
    const canvas = canvasRef.current;
    if (!buffer || !canvas) return;
    const background = backgroundMedia();
    grabArtSmudge({
      buffer,
      strokes: canvas,
      background: background?.source,
      backgroundWidth: background?.width,
      backgroundHeight: background?.height,
      sampleBackground: true,
      cxDev,
      cyDev,
      diameter,
    });
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawArmed) return;
    const context = contextRef.current;
    if (!context) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    snapshot();
    drawingRef.current = true;
    const next = point(event);
    lastPointRef.current = next;
    if (brushMode === "blend") {
      const diameter = Math.max(2, Math.round(size * dprRef.current));
      blendDiamRef.current = diameter;
      ensureSmudgeBuffer(diameter);
      grabSmudge(next.x * dprRef.current, next.y * dprRef.current, diameter);
      return;
    }
    configureBrush(context);
    context.beginPath();
    context.arc(next.x, next.y, size / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(next.x, next.y);
  }

  function moveDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = contextRef.current;
    if (!context || !drawingRef.current) return;
    event.preventDefault();
    const next = point(event);
    const previous = lastPointRef.current ?? next;
    if (brushMode === "blend") {
      const buffer = smudgeBufRef.current;
      if (!buffer) return;
      const rawPressure = event.pressure;
      const pressure = rawPressure > 0 ? rawPressure : 0.5;
      const strength = Math.max(0.55, Math.min(0.99, ART_BLEND_STRENGTH + (pressure - 0.5) * 0.5));
      stampArtSmudge({
        ctx: context,
        buffer,
        x0: previous.x,
        y0: previous.y,
        x1: next.x,
        y1: next.y,
        strength,
        dpr: dprRef.current,
        diameter: blendDiamRef.current,
        grab: (cxDev, cyDev) => grabSmudge(cxDev, cyDev, blendDiamRef.current),
      });
      lastPointRef.current = next;
      return;
    }
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + next.x) / 2, (previous.y + next.y) / 2);
    context.stroke();
    lastPointRef.current = next;
  }

  function applyArt() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    artLayers.compositeOnto(ctx, out.width, out.height);
    onOverlayChange(out.toDataURL("image/png"));
  }

  function stopDrawing() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const context = contextRef.current;
    if (context) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
    }
    applyArt();
  }

  function restore(stack: ImageData[], destination: ImageData[]) {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    const frame = stack.pop();
    if (!canvas || !context || !frame) return;
    destination.push(context.getImageData(0, 0, canvas.width, canvas.height));
    context.putImageData(frame, 0, 0);
    applyArt();
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    snapshot();
    context.clearRect(0, 0, canvas.width, canvas.height);
    onOverlayChange(undefined);
  }

  function pickFromWheel(clientX: number, clientY: number, nextLight = light) {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const rect = wheel.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = clientX - rect.left - radius;
    const dy = clientY - rect.top - radius;
    const hue = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
    const saturation = radius ? Math.min(100, Math.round((Math.hypot(dx, dy) / radius) * 100)) : 100;
    setWheelHue(hue);
    setWheelSat(saturation);
    setBrushMode("paint");
    setColor(hslToHex(hue, saturation, nextLight));
  }

  const canvas = (
    <div
      className={`${styles.artCanvasStack} ${drawArmed && live ? styles.artCanvasStackArmed : ""}`}
      style={
        placement
          ? {
              top: `${placement.y * 100}%`,
              left: `${placement.x * 100}%`,
              width: `${placement.w * 100}%`,
              height: `${placement.h * 100}%`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      hidden={!live}
    >
      <canvas ref={underRef} className={styles.artCanvasChrome} aria-hidden />
      <canvas
        ref={canvasRef}
        className={styles.artCanvasDraw}
        aria-label="Draw on this Drop"
        aria-hidden={!drawArmed || artLayers.layers.some((layer) => layer.id === artLayers.activeLayerId && layer.hidden)}
        style={
          artLayers.layers.some((layer) => layer.id === artLayers.activeLayerId && layer.hidden)
            ? { visibility: "hidden" }
            : undefined
        }
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <canvas ref={overRef} className={`${styles.artCanvasChrome} ${styles.artCanvasChromeOver}`} aria-hidden />
    </div>
  );

  return (
    <>
      {portalReady && hostRef.current ? createPortal(canvas, hostRef.current) : null}
      <div className={styles.inlineArtPalette}>
        <ArtLayerStrip
          layers={artLayers.layers}
          activeId={artLayers.activeLayerId}
          onSelect={artLayers.selectLayer}
          onAdd={() => {
            artLayers.addLayer();
            applyArt();
          }}
          onDelete={(id) => {
            artLayers.removeLayer(id);
            applyArt();
          }}
          onHide={(id) => {
            artLayers.hideLayer(id);
            applyArt();
          }}
          onDrop={(action) => {
            if (action.type === "merge") artLayers.mergeLayers(action.draggedId, action.targetId);
            else artLayers.reorderLayer(action.draggedId, action.index);
            applyArt();
          }}
        />
        <div className={styles.inlineArtHeadingRow}>
          <div className={styles.inlineArtHeading}>Art Palette</div>
          <button
            type="button"
            className={styles.artDrawArm}
            aria-pressed={drawArmed}
            onClick={() => setDrawArmed((armed) => !armed)}
          >
            {drawArmed ? "Drawing on" : "Draw"}
          </button>
        </div>
        <ArtPaletteTools
          wheelRef={wheelRef}
          color={color}
          size={size}
          opacity={opacity}
          light={light}
          wheelHue={wheelHue}
          wheelSat={wheelSat}
          brushMode={brushMode}
          paper={false}
          onPhoto
          saveLabel="Apply Art"
          onPickFromWheel={(x, y) => pickFromWheel(x, y)}
          onWheelPointerMove={(x, y) => wheelDraggingRef.current && pickFromWheel(x, y)}
          onWheelDragStart={() => { wheelDraggingRef.current = true; }}
          onWheelDragEnd={() => { wheelDraggingRef.current = false; }}
          onColorPick={(next) => { setBrushMode("paint"); setColor(next); setDrawArmed(true); }}
          onLightChange={(next) => { setLight(next); setColor(hslToHex(wheelHue, wheelSat, next)); }}
          onSizeChange={setSize}
          onOpacityChange={setOpacity}
          onBrushModeChange={(next) => {
            setBrushMode(next);
            setDrawArmed(true);
          }}
          onPaperToggle={() => {}}
          onUndo={() => restore(undoRef.current, redoRef.current)}
          onRedo={() => restore(redoRef.current, undoRef.current)}
          onClear={clear}
          onSave={applyArt}
        />
      </div>
    </>
  );
}
