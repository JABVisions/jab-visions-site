"use client";

// Drop Studio — Art Mode drawing engine. Unlike the old single-canvas version,
// this composites an ORDERED STACK of independent layer canvases (one per
// `DropStudioArtLayer`) onto one visible stage canvas, so strokes on one layer
// never touch another. Structural layer edits (new/delete/duplicate/reorder/
// rename/visibility/lock/opacity/merge) live in DropStudio.tsx and operate
// directly on the `artLayers` array — this component only needs to (a) paint
// pointer strokes onto the ACTIVE layer's own canvas and (b) stay visually in
// sync with whatever `layers` it's handed.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Layers3 } from "lucide-react";
import ArtPaletteTools, { type ArtBrushMode } from "./ArtPaletteTools";
import styles from "./DropStudio.module.css";
import type { DropStudioArtLayer } from "@/lib/board/dropCustomizations";

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

const BLEND_STRENGTH = 0.94;

export default function DropStudioArtPalette({
  hostRef,
  layers,
  activeLayerId,
  onActiveLayerChange,
  onLayersChange,
  onNewLayerAbove,
  layersOpen,
  onToggleLayers,
  layerPanel,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  /** Ordered bottom → top. Source of truth lives in the parent's DropCustomization. */
  layers: DropStudioArtLayer[];
  activeLayerId: string | null;
  onActiveLayerChange: (id: string) => void;
  /** Fired after a stroke / undo / redo / clear commits new pixels to one layer. */
  onLayersChange: (layers: DropStudioArtLayer[]) => void;
  /** "New layer for blend" — non-destructive branch for the Blend Brush. */
  onNewLayerAbove: () => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
  layerPanel: ReactNode;
}) {
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const loadedUrlRef = useRef<Map<string, string | undefined>>(new Map());
  const undoRef = useRef<Map<string, ImageData[]>>(new Map());
  const redoRef = useRef<Map<string, ImageData[]>>(new Map());
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const dimsRef = useRef({ w: 0, h: 0 });
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelDraggingRef = useRef(false);
  const smudgeBufRef = useRef<HTMLCanvasElement | null>(null);
  const smudgeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const blendDiamRef = useRef(0);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const activeIdRef = useRef(activeLayerId);
  activeIdRef.current = activeLayerId;

  const [portalReady, setPortalReady] = useState(false);
  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const [brushMode, setBrushMode] = useState<ArtBrushMode>("paint");
  const [lockedShake, setLockedShake] = useState(false);

  useEffect(() => setPortalReady(true), []);

  function activeLayerMeta(): DropStudioArtLayer | undefined {
    return layersRef.current.find((l) => l.id === activeIdRef.current);
  }

  function prepCtx(ctx: CanvasRenderingContext2D) {
    const dpr = dprRef.current || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function getLayerCanvas(id: string): HTMLCanvasElement {
    let canvas = layerCanvasesRef.current.get(id);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = dimsRef.current.w || 1;
      canvas.height = dimsRef.current.h || 1;
      const ctx = canvas.getContext("2d");
      if (ctx) prepCtx(ctx);
      layerCanvasesRef.current.set(id, canvas);
    }
    return canvas;
  }

  function activeCanvas(): HTMLCanvasElement | null {
    if (!activeIdRef.current) return null;
    return layerCanvasesRef.current.get(activeIdRef.current) || null;
  }

  function recomposite() {
    const stage = stageCanvasRef.current;
    const ctx = stageCtxRef.current;
    if (!stage || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      const canvas = layerCanvasesRef.current.get(layer.id);
      if (!canvas) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      ctx.drawImage(canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  // Keep every layer's backing store matched to the displayed size (DPR-aware),
  // preserving pixels across resize the same way the single-canvas version did.
  function syncDimensions() {
    const stage = stageCanvasRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (dimsRef.current.w === nextW && dimsRef.current.h === nextH && stageCtxRef.current) return;

    const resize = (canvas: HTMLCanvasElement) => {
      let prev: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        prev = document.createElement("canvas");
        prev.width = canvas.width;
        prev.height = canvas.height;
        prev.getContext("2d")?.drawImage(canvas, 0, 0);
      }
      canvas.width = nextW;
      canvas.height = nextH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (prev) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, nextW, nextH);
        ctx.restore();
      }
    };

    resize(stage);
    stageCtxRef.current = stage.getContext("2d");
    dprRef.current = dpr;
    layerCanvasesRef.current.forEach((canvas) => {
      resize(canvas);
      const ctx = canvas.getContext("2d");
      if (ctx) prepCtx(ctx);
    });
    dimsRef.current = { w: nextW, h: nextH };
    undoRef.current.clear();
    redoRef.current.clear();
    recomposite();
  }

  useEffect(() => {
    syncDimensions();
    const stage = stageCanvasRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncDimensions());
    ro.observe(stage);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalReady]);

  // Reconcile offscreen layer canvases with the `layers` prop: paint any layer
  // whose data changed underneath us (new layer, undo/merge elsewhere), drop
  // canvases for removed layers, then recomposite.
  useEffect(() => {
    if (!portalReady) return;
    const currentIds = new Set(layers.map((l) => l.id));
    layerCanvasesRef.current.forEach((_canvas, id) => {
      if (!currentIds.has(id)) {
        layerCanvasesRef.current.delete(id);
        loadedUrlRef.current.delete(id);
        undoRef.current.delete(id);
        redoRef.current.delete(id);
      }
    });

    let cancelled = false;
    (async () => {
      for (const layer of layers) {
        const canvas = getLayerCanvas(layer.id);
        const lastUrl = loadedUrlRef.current.get(layer.id);
        if (layer.dataUrl && layer.dataUrl !== lastUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = layer.dataUrl!;
          });
          if (cancelled) return;
          const ctx = canvas.getContext("2d");
          if (ctx && img.naturalWidth) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
          loadedUrlRef.current.set(layer.id, layer.dataUrl);
        } else if (!layer.dataUrl && lastUrl) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          loadedUrlRef.current.set(layer.id, undefined);
        }
      }
      if (!cancelled) recomposite();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, portalReady]);

  function pointFromXY(clientX: number, clientY: number) {
    const rect = stageCanvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function pushUndo() {
    const id = activeIdRef.current;
    const canvas = activeCanvas();
    if (!id || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const stack = undoRef.current.get(id) ?? [];
    stack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (stack.length > 24) stack.shift();
    undoRef.current.set(id, stack);
    redoRef.current.set(id, []);
  }

  function commitActiveLayer() {
    const id = activeIdRef.current;
    const canvas = activeCanvas();
    if (!id || !canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    loadedUrlRef.current.set(id, dataUrl);
    onLayersChange(layersRef.current.map((l) => (l.id === id ? { ...l, dataUrl } : l)));
  }

  // ---- Smudge / blend brush — samples the visible STAGE composite (so it can
  // drag colors from layers underneath) and deposits only onto the active
  // layer, so blending stays non-destructive to everything else. ----------
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

  function grabSmudge(cxDev: number, cyDev: number, D: number) {
    const bctx = smudgeCtxRef.current;
    const stage = stageCanvasRef.current;
    if (!bctx || !stage) return;
    const sx = cxDev - D / 2;
    const sy = cyDev - D / 2;
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, D, D);
    const ix = Math.max(0, sx);
    const iy = Math.max(0, sy);
    const iw = Math.min(stage.width, sx + D) - ix;
    const ih = Math.min(stage.height, sy + D) - iy;
    if (iw > 0 && ih > 0) {
      bctx.drawImage(stage, ix, iy, iw, ih, ix - sx, iy - sy, iw, ih);
    }
    bctx.globalCompositeOperation = "destination-in";
    const g = bctx.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.95)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, D, D);
    bctx.globalCompositeOperation = "source-over";
  }

  function blendSegment(x0: number, y0: number, x1: number, y1: number, strength: number) {
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    const buf = smudgeBufRef.current;
    if (!ctx || !buf) return;
    const dpr = dprRef.current;
    const D = blendDiamRef.current;
    if (D <= 0) return;
    const r = D / 2;
    const stepCss = Math.max(1, (D * 0.1) / dpr);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(dist / stepCss));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cxDev = (x0 + (x1 - x0) * t) * dpr;
      const cyDev = (y0 + (y1 - y0) * t) * dpr;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = strength;
      ctx.drawImage(buf, cxDev - r, cyDev - r);
      ctx.restore();
      recomposite();
      grabSmudge(cxDev, cyDev, D);
    }
    ctx.globalAlpha = 1;
  }

  function flashLocked() {
    setLockedShake(true);
    window.setTimeout(() => setLockedShake(false), 220);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const meta = activeLayerMeta();
    const canvas = activeCanvas();
    if (!meta || !canvas) return;
    if (meta.locked) {
      flashLocked();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    drawingRef.current = true;
    const { x, y } = pointFromXY(e.clientX, e.clientY);
    lastPtRef.current = { x, y };

    if (brushMode === "blend") {
      const dpr = dprRef.current;
      const D = Math.max(2, Math.round(size * dpr));
      blendDiamRef.current = D;
      ensureSmudgeBuffer(D);
      grabSmudge(x * dpr, y * dpr, D);
      return;
    }

    ctx.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    recomposite();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    e.preventDefault();

    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const samples =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length
        ? native.getCoalescedEvents()
        : [native];

    if (brushMode === "blend") {
      for (const sample of samples) {
        const { x, y } = pointFromXY(sample.clientX, sample.clientY);
        const last = lastPtRef.current ?? { x, y };
        const rawPressure = (sample as PointerEvent).pressure;
        const pressure = rawPressure && rawPressure > 0 ? rawPressure : 0.5;
        const strength = Math.max(0.55, Math.min(0.99, BLEND_STRENGTH + (pressure - 0.5) * 0.5));
        blendSegment(last.x, last.y, x, y, strength);
        lastPtRef.current = { x, y };
      }
      return;
    }

    for (const sample of samples) {
      const { x, y } = pointFromXY(sample.clientX, sample.clientY);
      const last = lastPtRef.current ?? { x, y };
      const midX = (last.x + x) / 2;
      const midY = (last.y + y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      lastPtRef.current = { x, y };
    }
    recomposite();
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    const last = lastPtRef.current;
    if (ctx && last && brushMode !== "blend") {
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    drawingRef.current = false;
    lastPtRef.current = null;
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    recomposite();
    commitActiveLayer();
  }

  function undo() {
    const id = activeIdRef.current;
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    if (!id || !canvas || !ctx) return;
    const stack = undoRef.current.get(id);
    const prev = stack?.pop();
    if (!prev) return;
    const redoStack = redoRef.current.get(id) ?? [];
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    redoRef.current.set(id, redoStack);
    ctx.putImageData(prev, 0, 0);
    recomposite();
    commitActiveLayer();
  }

  function redo() {
    const id = activeIdRef.current;
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    if (!id || !canvas || !ctx) return;
    const stack = redoRef.current.get(id);
    const next = stack?.pop();
    if (!next) return;
    const undoStack = undoRef.current.get(id) ?? [];
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    undoRef.current.set(id, undoStack);
    ctx.putImageData(next, 0, 0);
    recomposite();
    commitActiveLayer();
  }

  function clearActiveLayer() {
    const canvas = activeCanvas();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    recomposite();
    commitActiveLayer();
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

  const activeMeta = layers.find((l) => l.id === activeLayerId);
  const activeHasContent = Boolean(activeMeta?.dataUrl);

  const canvas = (
    <canvas
      ref={stageCanvasRef}
      className={`${styles.artCanvasLayer} ${lockedShake ? styles.artCanvasLocked : ""}`}
      aria-label="Draw on this Drop"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );

  return (
    <>
      {portalReady && hostRef.current ? createPortal(canvas, hostRef.current) : null}
      <div className={styles.inlineArtPalette}>
        <div className={styles.inlineArtHeading}>
          Art Palette
          {activeMeta ? <span className={styles.inlineArtActiveLayer}>· {activeMeta.name}</span> : null}
          {activeMeta?.locked ? <span className={styles.inlineArtLockedTag}>locked</span> : null}
        </div>
        <button
          type="button"
          className={`${styles.artLayerToggle} ${layersOpen ? styles.artLayerToggleActive : ""}`}
          aria-expanded={layersOpen}
          onClick={onToggleLayers}
        >
          <Layers3 aria-hidden size={15} strokeWidth={2.2} />
          Layers
        </button>
        {brushMode === "blend" && activeHasContent ? (
          <div className={styles.blendLayerChoice}>
            <span>Blending existing art on “{activeMeta?.name}.”</span>
            <button type="button" onClick={onNewLayerAbove}>
              New layer for blend
            </button>
          </div>
        ) : null}
        <ArtPaletteTools
          wheelRef={wheelRef}
          color={color}
          size={size}
          light={light}
          wheelHue={wheelHue}
          wheelSat={wheelSat}
          brushMode={brushMode}
          paper={false}
          onPhoto
          saveLabel="Apply Art"
          onPickFromWheel={(x, y) => pickFromWheel(x, y)}
          onWheelPointerMove={(x, y) => wheelDraggingRef.current && pickFromWheel(x, y)}
          onWheelDragStart={() => {
            wheelDraggingRef.current = true;
          }}
          onWheelDragEnd={() => {
            wheelDraggingRef.current = false;
          }}
          onColorPick={(next) => {
            setBrushMode("paint");
            setColor(next);
          }}
          onLightChange={(next) => {
            setLight(next);
            setColor(hslToHex(wheelHue, wheelSat, next));
          }}
          onSizeChange={setSize}
          onBrushModeChange={setBrushMode}
          onPaperToggle={() => {}}
          onUndo={undo}
          onRedo={redo}
          onClear={clearActiveLayer}
          onSave={commitActiveLayer}
        />
        {layersOpen ? <div className={styles.artLayersTray}>{layerPanel}</div> : null}
      </div>
    </>
  );
}
