// File: app/components/board/BoardArtCanvas.tsx
// Drop Studio — Art Mode. A clean, Board-native drawing surface (tidy Microsoft
// Paint with early-Procreate controls). Strokes live on a TRANSPARENT canvas
// over a switchable background: dark or white paper, OR a captured photo (so the
// same tools let you draw directly on a Vision). Save composites bg + strokes
// into a PNG File that flows into the drop media flow.
// Brush modes: paint (opaque), blend (real smudge — drags & merges the painted
// strokes underneath, like Procreate), erase.

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Layers3 } from "lucide-react";
import ArtPaletteTools, { type ArtBrushMode } from "./ArtPaletteTools";
import DropChipWorkbench from "./DropChipWorkbench";
import DropStudioPaletteDeck, { type ObjectTool } from "./DropStudioPaletteDeck";
import styles from "./boardArtCanvas.module.css";
import { scaleCanvasToMinLongEdge } from "@/lib/board/imageQuality";
import type { DropStudioArtLayer } from "@/lib/board/dropCustomizations";

/** Imperative handle so a parent (Drop Studio) can silently export an
 * in-progress drawing as a draft without going through the "Apply drawing"
 * button flow (which also closes the canvas / applies the layer). */
export type BoardArtCanvasHandle = {
  /** Export the current composite as a PNG File, or null if nothing to export. */
  exportSnapshot: () => Promise<File | null>;
  /** True when strokes have been drawn since the last save/export. */
  hasUnsavedStrokes: () => boolean;
};

function hslToHex(h: number, s: number, l: number) {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

const DARK_BG = "#0b0f16";
const PAPER_BG = "#fdfaf2";
const BASE_LAYER_ID = "artwork";
// Layer-strip drag tuning: how far a pointer must move before a press counts as
// a drag (vs. a tap), and how long a touch must hold still before we hand it a
// drag instead of letting the browser scroll the strip.
const LAYER_DRAG_JITTER_PX = 6;
const LAYER_DRAG_LONG_PRESS_MS = 260;
// A drag centered within this fraction of a target tile's half-width counts as
// "onto" the tile (merge); outside that band counts as "between tiles" (reorder).
const LAYER_MERGE_ZONE_RATIO = 0.5;

function makeLayer(id: string, name: string): DropStudioArtLayer {
  return { id, name, visible: true, locked: false, opacity: 1 };
}

type BoardArtCanvasProps = {
  onSave: (file: File) => void;
  /** When set, strokes draw on top of this image (draw-on-photo for Vision). */
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  /** Existing paint layer (or legacy flattened artwork) to continue editing. */
  initialOverlayUrl?: string;
  exportMode?: "composite" | "overlay";
  saveLabel?: string;
  /** Uniform 4:5 monitor + Palette overlay (Drop Studio stage). */
  operatingTable?: boolean;
  /** Dropbook cover — tools below the chip instead of beside it. */
  layout?: "side" | "stack";
};

const BoardArtCanvas = forwardRef<BoardArtCanvasHandle, BoardArtCanvasProps>(function BoardArtCanvas(
  {
    onSave,
    backgroundImageUrl,
    backgroundVideoUrl,
    initialOverlayUrl,
    exportMode = "composite",
    saveLabel = "Use art →",
    operatingTable = false,
    layout = "side",
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const layersRef = useRef<DropStudioArtLayer[]>([]);
  const bgImgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  // Tracks whether any stroke has landed since the last export (save/auto-save),
  // so the parent can know there's unsaved work worth draft-saving on close.
  const hasDrawnRef = useRef(false);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const dprRef = useRef(1);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelDraggingRef = useRef(false);
  // Smudge ("blend") brush state: an offscreen buffer holds the paint the brush
  // is currently carrying, plus its device-pixel diameter.
  const smudgeBufRef = useRef<HTMLCanvasElement | null>(null);
  const smudgeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const blendDiamRef = useRef(0);
  // Layer-strip drag state (reorder / merge). A ref (not state) so pointermove
  // handlers always see the live gesture without waiting on a re-render.
  const layerDragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    pointerType: string;
    moved: boolean;
    armed: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const mergeTargetIdRef = useRef<string | null>(null);
  const suppressLayerClickRef = useRef(false);
  const layerTileElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  const [objectTool, setObjectTool] = useState<ObjectTool>("text");
  const [layersOpen, setLayersOpen] = useState(true);
  const [layers, setLayers] = useState<DropStudioArtLayer[]>(() => [makeLayer(BASE_LAYER_ID, "Artwork")]);
  const [activeLayerId, setActiveLayerId] = useState(BASE_LAYER_ID);
  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [paper, setPaper] = useState(false); // dark by default
  const [brushMode, setBrushMode] = useState<ArtBrushMode>("paint");
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const onPhoto = !!backgroundImageUrl || !!backgroundVideoUrl;
  layersRef.current = layers;

  function getLayerCanvas(id: string) {
    let layer = layerCanvasesRef.current.get(id);
    const stage = canvasRef.current;
    if (!layer) {
      layer = document.createElement("canvas");
      layer.width = stage?.width || 1;
      layer.height = stage?.height || 1;
      layer.getContext("2d")?.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      layerCanvasesRef.current.set(id, layer);
    }
    return layer;
  }

  function activeLayerContext() {
    return getLayerCanvas(activeLayerId).getContext("2d");
  }

  function recomposite() {
    const stage = canvasRef.current;
    const ctx = ctxRef.current;
    if (!stage || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      const source = layerCanvasesRef.current.get(layer.id);
      if (!source) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(source, 0, 0);
    }
    ctx.restore();
  }

  function pickFromWheel(clientX: number, clientY: number, nextLight = light) {
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = clientX - (r.left + radius);
    const dy = clientY - (r.top + radius);
    const dist = Math.min(Math.hypot(dx, dy), radius);
    const hue = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
    const sat = radius > 0 ? Math.round((dist / radius) * 100) : 100;
    setWheelHue(hue);
    setWheelSat(sat);
    setBrushMode("paint");
    setColor(hslToHex(hue, sat, nextLight));
  }

  // Keep the drawing canvas's backing store exactly matched to its displayed
  // size (DPR-aware). This is the key to accuracy: if the element ever resizes
  // after init (sheet layout, rotation, scroll reflow) the old backing store no
  // longer lines up with the cursor, so strokes land offset. We re-measure on
  // mount AND via ResizeObserver, preserving any existing artwork.
  function syncCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === nextW && canvas.height === nextH && ctxRef.current) return;

    canvas.width = nextW;
    canvas.height = nextH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Map CSS pixels → device pixels so pointer coords (in CSS px) draw 1:1.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    dprRef.current = dpr;

    layerCanvasesRef.current.forEach((layer) => {
      const previous = document.createElement("canvas");
      previous.width = layer.width;
      previous.height = layer.height;
      previous.getContext("2d")?.drawImage(layer, 0, 0);
      layer.width = nextW;
      layer.height = nextH;
      const layerCtx = layer.getContext("2d");
      layerCtx?.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, nextW, nextH);
      layerCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    // Undo/redo snapshots are tied to the old backing-store dimensions, so reset
    // them on a real resize to avoid putImageData misalignment.
    undoRef.current = [];
    redoRef.current = [];
    recomposite();
  }

  useEffect(() => {
    syncCanvas();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncCanvas());
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialOverlayUrl) return;
    const stage = canvasRef.current;
    if (!stage) return;
    syncCanvas();
    const layer = getLayerCanvas(BASE_LAYER_ID);
    const ctx = layer.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layer.width, layer.height);
      ctx.drawImage(image, 0, 0, layer.width, layer.height);
      ctx.restore();
      undoRef.current = [];
      redoRef.current = [];
      setLayers((current) =>
        current.map((layer) =>
          layer.id === BASE_LAYER_ID ? { ...layer, dataUrl: layerCanvasesRef.current.get(BASE_LAYER_ID)?.toDataURL() } : layer
        )
      );
      recomposite();
    };
    image.src = initialOverlayUrl;
    return () => {
      cancelled = true;
      image.onload = null;
    };
    // syncCanvas is intentionally local; the URL is the layer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOverlayUrl]);

  useEffect(() => {
    recomposite();
    // The layer pixels live in refs; this redraw responds to structural changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  function pointFromXY(clientX: number, clientY: number) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function pushUndo() {
    const canvas = layerCanvasesRef.current.get(activeLayerId);
    const ctx = activeLayerContext();
    if (!canvas || !ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoRef.current.length > 24) undoRef.current.shift();
    // A fresh edit invalidates the redo stack.
    redoRef.current = [];
    hasDrawnRef.current = true;
  }

  // ---- Smudge / blend brush -------------------------------------------------
  // A real smudge: it carries the strokes under the brush and drags them along
  // the path, re-sampling as it travels so colors it passes over merge together
  // (like Procreate). It deposits NO new color and only ever reads/writes the
  // transparent strokes canvas — the photo/paper background sits underneath,
  // untouched (picture/video > brush strokes > blend strokes).
  const BLEND_STRENGTH = 0.94;

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

  // Pick up the strokes under the brush into the buffer, masked to a soft circle
  // so the smear has feathered edges and blends instead of stamping a hard box.
  function grabSmudge(cxDev: number, cyDev: number, D: number) {
    const bctx = smudgeCtxRef.current;
    const canvas = canvasRef.current;
    if (!bctx || !canvas) return;
    const sx = cxDev - D / 2;
    const sy = cyDev - D / 2;
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, D, D);

    // Draw-on-photo: the photo is the bottom layer (a separate <img>), so the
    // smudge samples the VISIBLE composite — photo first, strokes on top — and
    // then lays that smear onto the strokes layer. This is why blending drags
    // the actual image, not just painted strokes. The photo itself stays put.
    const img = bgImgRef.current;
    if (onPhoto && img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const W = canvas.width;
      const H = canvas.height;
      const iw0 = img.naturalWidth;
      const ih0 = img.naturalHeight;
      // Mirror the on-screen object-fit:cover mapping so the sampled region lines
      // up exactly with what's displayed (studio monitor is cover-filled).
      const scale = Math.max(W / iw0, H / ih0);
      const ox = (W - iw0 * scale) / 2;
      const oy = (H - ih0 * scale) / 2;
      const srcX = (sx - ox) / scale;
      const srcY = (sy - oy) / scale;
      const srcSize = D / scale;
      try {
        bctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, D, D);
      } catch {}
    }

    // Strokes on top (clamp the source rect so edge smudges don't throw).
    const ix = Math.max(0, sx);
    const iy = Math.max(0, sy);
    const iw = Math.min(canvas.width, sx + D) - ix;
    const ih = Math.min(canvas.height, sy + D) - iy;
    if (iw > 0 && ih > 0) {
      bctx.drawImage(canvas, ix, iy, iw, ih, ix - sx, iy - sy, iw, ih);
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

  // Drag the carried paint from (x0,y0) to (x1,y1): stamp it down at each step,
  // then re-grab the (now blended) result so the color travels and merges.
  function blendSegment(x0: number, y0: number, x1: number, y1: number, strength: number) {
    const ctx = activeLayerContext();
    const buf = smudgeBufRef.current;
    if (!ctx || !buf) return;
    const dpr = dprRef.current;
    const D = blendDiamRef.current;
    if (D <= 0) return;
    const r = D / 2;
    // Finer step spacing → more samples per move → a more sensitive, responsive
    // smear that reacts to small movements.
    const stepCss = Math.max(1, (D * 0.1) / dpr);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(dist / stepCss));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cxDev = (x0 + (x1 - x0) * t) * dpr;
      const cyDev = (y0 + (y1 - y0) * t) * dpr;
      // Lay carried paint at the new point (work in raw device pixels).
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = strength;
      ctx.drawImage(buf, cxDev - r, cyDev - r);
      ctx.restore();
      // Re-pick the blended result to carry forward (decays + merges colors).
      grabSmudge(cxDev, cyDev, D);
    }
    ctx.globalAlpha = 1;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const activeLayer = layersRef.current.find((layer) => layer.id === activeLayerId);
    const ctx = activeLayerContext();
    if (!ctx) return;
    if (activeLayer?.locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    drawingRef.current = true;
    const { x, y } = pointFromXY(e.clientX, e.clientY);
    lastPtRef.current = { x, y };
    if (brushMode === "blend") {
      // Smudge: capture the strokes under the brush. No color is deposited, and
      // a tap (no drag) leaves the canvas untouched, just like a real smudge.
      const dpr = dprRef.current;
      const D = Math.max(2, Math.round(size * dpr));
      blendDiamRef.current = D;
      ensureSmudgeBuffer(D);
      grabSmudge(x * dpr, y * dpr, D);
      return;
    }

    if (brushMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    // Seed with a dot so a tap registers a mark.
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    recomposite();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = activeLayerContext();
    if (!ctx) return;
    e.preventDefault();

    // Process every coalesced sample for high-fidelity (sensitive) strokes on
    // fast moves, and smooth with quadratic midpoints so lines aren't jagged.
    const native = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const samples =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length
        ? native.getCoalescedEvents()
        : [native];

    if (brushMode === "blend") {
      for (const sample of samples) {
        const { x, y } = pointFromXY(sample.clientX, sample.clientY);
        const last = lastPtRef.current ?? { x, y };
        // Pressure sensitivity: a harder press smears more aggressively, a light
        // touch is gentler. Mice/trackpads report 0 → treat as a medium press.
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
    const ctx = activeLayerContext();
    const last = lastPtRef.current;
    // Finish the path at the final point so the very end of the stroke renders.
    // (Blend has no path — it stamps as it moves — so skip the line finish.)
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
    const layer = layerCanvasesRef.current.get(activeLayerId);
    if (layer) {
      const dataUrl = layer.toDataURL();
      setLayers((current) => current.map((item) => (item.id === activeLayerId ? { ...item, dataUrl } : item)));
    }
    recomposite();
  }

  function clearCanvas() {
    const canvas = layerCanvasesRef.current.get(activeLayerId);
    const ctx = activeLayerContext();
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setLayers((current) => current.map((item) => (item.id === activeLayerId ? { ...item, dataUrl: undefined } : item)));
    recomposite();
  }

  function undo() {
    const canvas = layerCanvasesRef.current.get(activeLayerId);
    const ctx = activeLayerContext();
    if (!canvas || !ctx) return;
    const prev = undoRef.current.pop();
    if (!prev) return;
    // Stash the current frame so it can be redone.
    redoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(prev, 0, 0);
    recomposite();
  }

  function redo() {
    const canvas = layerCanvasesRef.current.get(activeLayerId);
    const ctx = activeLayerContext();
    if (!canvas || !ctx) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(next, 0, 0);
    recomposite();
  }

  /** Composite the background + strokes into a PNG File. Shared by the manual
   * "Apply drawing" save and the silent auto-save/draft export. */
  function exportComposite(): Promise<File | null> {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(null);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return Promise.resolve(null);

    // Paint the background first…
    if (exportMode === "overlay") {
      ctx.clearRect(0, 0, out.width, out.height);
    } else if (onPhoto && bgImgRef.current && bgImgRef.current.naturalWidth) {
      const img = bgImgRef.current;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(out.width / iw, out.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = paper ? PAPER_BG : DARK_BG;
      ctx.fillRect(0, 0, out.width, out.height);
    }

    // …then the strokes on top.
    ctx.drawImage(canvas, 0, 0);

    const exportCanvas = scaleCanvasToMinLongEdge(out);
    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => {
        resolve(blob ? new File([blob], `board-art-${Date.now()}.png`, { type: "image/png" }) : null);
      }, "image/png");
    });
  }

  function save() {
    void exportComposite().then((file) => {
      if (file) {
        hasDrawnRef.current = false;
        onSave(file);
      }
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      exportSnapshot: async () => {
        const file = await exportComposite();
        if (file) hasDrawnRef.current = false;
        return file;
      },
      hasUnsavedStrokes: () => hasDrawnRef.current,
    }),
    // exportComposite closes over state (exportMode/onPhoto/paper) that's stable
    // enough per-render; re-creating the handle each render is cheap and keeps
    // it from ever going stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exportMode, paper]
  );

  function addLayer() {
    const id = `art-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const layer = makeLayer(id, `Layer ${layersRef.current.length + 1}`);
    const activeIndex = layersRef.current.findIndex((item) => item.id === activeLayerId);
    setLayers((current) => {
      const next = [...current];
      next.splice(activeIndex < 0 ? next.length : activeIndex + 1, 0, layer);
      return next;
    });
    getLayerCanvas(id);
    setActiveLayerId(id);
    undoRef.current = [];
    redoRef.current = [];
  }

  function selectLayer(id: string) {
    setActiveLayerId(id);
    undoRef.current = [];
    redoRef.current = [];
  }

  function deleteLayer(id: string) {
    if (layersRef.current.length <= 1) return; // always keep one editable layer
    layerCanvasesRef.current.delete(id);
    setLayers((current) => {
      const removedIndex = current.findIndex((l) => l.id === id);
      const next = current.filter((l) => l.id !== id);
      if (id === activeLayerId) {
        const fallback = next[removedIndex - 1] || next[0];
        if (fallback) {
          setActiveLayerId(fallback.id);
          undoRef.current = [];
          redoRef.current = [];
        }
      }
      return next;
    });
  }

  /** Merge `draggedId`'s pixels into `targetId` (target survives), respecting stack order. */
  function mergeLayerInto(draggedId: string, targetId: string) {
    const current = layersRef.current;
    const draggedIndex = current.findIndex((l) => l.id === draggedId);
    const targetIndex = current.findIndex((l) => l.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const dragged = current[draggedIndex];
    const target = current[targetIndex];
    const draggedCanvas = layerCanvasesRef.current.get(draggedId);
    const targetCanvas = getLayerCanvas(targetId);
    const ctx = targetCanvas.getContext("2d");

    if (ctx && draggedCanvas) {
      const width = targetCanvas.width;
      const height = targetCanvas.height;
      const merged = document.createElement("canvas");
      merged.width = width;
      merged.height = height;
      const mctx = merged.getContext("2d");
      if (mctx) {
        // Whichever layer sat lower in the stack paints first (bottom), the
        // other paints on top, so the merged pixels read the same as before.
        const targetIsBottom = targetIndex < draggedIndex;
        const bottomCanvas = targetIsBottom ? targetCanvas : draggedCanvas;
        const bottomOpacity = targetIsBottom ? target.opacity : dragged.opacity;
        const topCanvas = targetIsBottom ? draggedCanvas : targetCanvas;
        const topOpacity = targetIsBottom ? dragged.opacity : target.opacity;
        mctx.globalAlpha = bottomOpacity;
        mctx.drawImage(bottomCanvas, 0, 0, width, height);
        mctx.globalAlpha = topOpacity;
        mctx.drawImage(topCanvas, 0, 0, width, height);
        mctx.globalAlpha = 1;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(merged, 0, 0);
        ctx.restore();
      }
    }

    layerCanvasesRef.current.delete(draggedId);
    const mergedDataUrl = targetCanvas.toDataURL();
    setLayers((prev) =>
      prev
        .filter((l) => l.id !== draggedId)
        .map((l) => (l.id === targetId ? { ...l, opacity: 1, dataUrl: mergedDataUrl } : l))
    );
    setActiveLayerId(targetId);
    undoRef.current = [];
    redoRef.current = [];
  }

  function reorderLayer(draggedId: string, beforeId: string, placeAfter: boolean) {
    const current = layersRef.current;
    const fromIndex = current.findIndex((l) => l.id === draggedId);
    let toIndex = current.findIndex((l) => l.id === beforeId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    if (placeAfter) toIndex += 1;
    if (fromIndex < toIndex) toIndex -= 1; // account for the removal shift
    if (toIndex === fromIndex) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setLayers(next);
  }

  function handleLayerPointerDown(id: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    const wrap = e.currentTarget;
    const state = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      moved: false,
      // Mouse/pen arm immediately on movement; touch waits for a deliberate
      // hold so a normal horizontal swipe just scrolls the strip.
      armed: e.pointerType !== "touch",
      longPressTimer: null as ReturnType<typeof setTimeout> | null,
    };
    layerDragRef.current = state;

    if (e.pointerType === "touch") {
      state.longPressTimer = setTimeout(() => {
        if (layerDragRef.current !== state) return;
        state.armed = true;
        try {
          wrap.setPointerCapture(state.pointerId);
        } catch {
          /* pointer may have already left the element */
        }
      }, LAYER_DRAG_LONG_PRESS_MS);
    } else {
      try {
        wrap.setPointerCapture(state.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function handleLayerPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = layerDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const dist = Math.hypot(dx, dy);

    if (!state.armed) {
      // Still deciding: if it moves before the long-press fires, that's a scroll.
      if (dist > LAYER_DRAG_JITTER_PX) {
        if (state.longPressTimer) clearTimeout(state.longPressTimer);
        layerDragRef.current = null;
      }
      return;
    }

    if (!state.moved && dist > LAYER_DRAG_JITTER_PX) {
      state.moved = true;
      setDraggingLayerId(state.id);
    }
    if (!state.moved) return;

    e.preventDefault();

    const entries = layersRef.current
      .map((l) => ({ id: l.id, el: layerTileElsRef.current.get(l.id) }))
      .filter((entry): entry is { id: string; el: HTMLDivElement } => Boolean(entry.el));
    let hovered: { id: string; rect: DOMRect } | null = null;
    for (const entry of entries) {
      if (entry.id === state.id) continue;
      const rect = entry.el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        hovered = { id: entry.id, rect };
        break;
      }
    }

    if (!hovered) {
      if (mergeTargetIdRef.current) {
        mergeTargetIdRef.current = null;
        setMergeTargetId(null);
      }
      return;
    }

    const center = hovered.rect.left + hovered.rect.width / 2;
    const distFromCenter = Math.abs(e.clientX - center);
    const overlapRatio = 1 - distFromCenter / (hovered.rect.width / 2);

    if (overlapRatio >= LAYER_MERGE_ZONE_RATIO) {
      if (mergeTargetIdRef.current !== hovered.id) {
        mergeTargetIdRef.current = hovered.id;
        setMergeTargetId(hovered.id);
      }
      return; // hovering the "onto" zone — hold for merge, don't live-reorder
    }

    if (mergeTargetIdRef.current) {
      mergeTargetIdRef.current = null;
      setMergeTargetId(null);
    }
    reorderLayer(state.id, hovered.id, e.clientX >= center);
  }

  function endLayerDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const state = layerDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (state.longPressTimer) clearTimeout(state.longPressTimer);
    layerDragRef.current = null;
    const target = mergeTargetIdRef.current;
    mergeTargetIdRef.current = null;
    setDraggingLayerId(null);
    setMergeTargetId(null);
    suppressLayerClickRef.current = state.moved;
    if (state.moved && target && target !== state.id) {
      mergeLayerInto(state.id, target);
    }
  }

  const stageEl = (
    <div className={styles.canvasEditor}>
      {layersOpen ? (
        <div className={styles.layerStrip} aria-label="Art layers">
          <div className={styles.layerStripScroll}>
            {layers.map((layer) => (
              <div
                key={layer.id}
                ref={(el) => {
                  if (el) layerTileElsRef.current.set(layer.id, el);
                  else layerTileElsRef.current.delete(layer.id);
                }}
                className={[
                  styles.layerTileWrap,
                  draggingLayerId === layer.id ? styles.layerTileWrapDragging : "",
                  mergeTargetId === layer.id ? styles.layerTileWrapMergeTarget : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(e) => handleLayerPointerDown(layer.id, e)}
                onPointerMove={handleLayerPointerMove}
                onPointerUp={endLayerDrag}
                onPointerCancel={endLayerDrag}
              >
                <button
                  type="button"
                  className={`${styles.layerTile} ${
                    layer.id === activeLayerId ? styles.layerTileActive : styles.layerTileInactive
                  }`}
                  onClick={() => {
                    if (suppressLayerClickRef.current) {
                      suppressLayerClickRef.current = false;
                      return;
                    }
                    selectLayer(layer.id);
                  }}
                  aria-pressed={layer.id === activeLayerId}
                >
                  {layer.dataUrl ? <img src={layer.dataUrl} alt="" aria-hidden /> : null}
                  <span>{layer.name}</span>
                </button>
                {layers.length > 1 ? (
                  <button
                    type="button"
                    className={styles.layerDelete}
                    aria-label={`Delete ${layer.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayer(layer.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" className={styles.addLayer} onClick={addLayer}>
            + Layer
          </button>
        </div>
      ) : null}
      <div
        data-art-canvas-stage
        className={[
          styles.stage,
          paper && !onPhoto ? styles.stagePaper : "",
          operatingTable ? styles.stageInFrame : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {backgroundVideoUrl ? (
          <video
            src={backgroundVideoUrl}
            className={styles.bg}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            controls={false}
            aria-label="Video preview behind Art Palette"
            onLoadedData={(event) => {
              const el = event.currentTarget;
              if (el.currentTime === 0) {
                try {
                  el.currentTime = 0.05;
                } catch {
                  // ignore
                }
              }
              void el.play().catch(() => {});
            }}
          />
        ) : backgroundImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={bgImgRef}
            data-art-canvas-bg
            src={backgroundImageUrl}
            alt=""
            className={styles.bg}
            crossOrigin="anonymous"
          />
        ) : null}
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    </div>
  );

  const artToolsEl = (
    <div className={styles.artTools}>
      <button
        type="button"
        className={`${styles.layersToggle} ${layersOpen ? styles.layersToggleActive : ""}`}
        onClick={() => setLayersOpen((open) => !open)}
        aria-expanded={layersOpen}
      >
        <Layers3 aria-hidden size={15} strokeWidth={2.2} />
        Layers
      </button>
      <ArtPaletteTools
      wheelRef={wheelRef}
      color={color}
      size={size}
      light={light}
      wheelHue={wheelHue}
      wheelSat={wheelSat}
      brushMode={brushMode}
      paper={paper}
      onPhoto={onPhoto}
      saveLabel={saveLabel}
      onPickFromWheel={(x, y) => pickFromWheel(x, y)}
      onWheelPointerMove={(x, y) => {
        if (wheelDraggingRef.current) pickFromWheel(x, y);
      }}
      onWheelDragStart={() => {
        wheelDraggingRef.current = true;
      }}
      onWheelDragEnd={() => {
        wheelDraggingRef.current = false;
      }}
      onColorPick={(c) => {
        setBrushMode("paint");
        setColor(c);
      }}
      onLightChange={(l) => {
        setLight(l);
        setBrushMode("paint");
        setColor(hslToHex(wheelHue, wheelSat, l));
      }}
      onSizeChange={setSize}
      onBrushModeChange={setBrushMode}
      onPaperToggle={() => setPaper((p) => !p)}
      onUndo={undo}
      onRedo={redo}
      onClear={clearCanvas}
        onSave={save}
      />
    </div>
  );

  const toolsEl = (
    <div className={[styles.tools, layout === "stack" ? styles.toolsDeck : ""].filter(Boolean).join(" ")}>
      {artToolsEl}
    </div>
  );

  const deckPanelEl = (
    <DropStudioPaletteDeck tool={objectTool} onToolChange={setObjectTool} artTools={artToolsEl} />
  );

  if (operatingTable) {
    return (
      <div className={styles.operatingHost} data-art-operating-host>
        <DropChipWorkbench chip={stageEl} deck={deckPanelEl} />
      </div>
    );
  }

  return (
    <div
      data-art-canvas-root
      className={[styles.mode, layout === "stack" ? styles.modeStack : ""].filter(Boolean).join(" ")}
    >
      <div data-art-canvas-stage-wrap className={styles.stageWrap}>
        {stageEl}
      </div>
      {toolsEl}
    </div>
  );
});

export default BoardArtCanvas;
