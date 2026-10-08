// File: app/components/board/BoardArtCanvas.tsx
// Drop Studio — Art Mode. A clean, Board-native drawing surface (tidy Microsoft
// Paint with early-Procreate controls). Strokes live on a TRANSPARENT canvas
// over a switchable background: dark or white paper, OR a captured photo (so the
// same tools let you draw directly on a Vision). Save composites bg + strokes
// into a PNG File that flows into the drop media flow.
// Brush modes: paint (opaque), blend (real smudge — drags & merges the painted
// strokes underneath, like Procreate), erase.

"use client";

import { useEffect, useRef, useState } from "react";
import ArtPaletteTools, { type ArtBrushMode } from "./ArtPaletteTools";
import ArtLayerStrip from "./ArtLayerStrip";
import {
  addArtLayer,
  deleteArtLayer,
  initialArtLayers,
  mergeArtLayerIds,
  moveArtLayer,
  nextActiveArtLayer,
} from "@/lib/board/artLayers";
import DropChipWorkbench from "./DropChipWorkbench";
import DropStudioPaletteDeck, { type ObjectTool } from "./DropStudioPaletteDeck";
import styles from "./boardArtCanvas.module.css";
import { scaleCanvasToMinLongEdge } from "@/lib/board/imageQuality";
import {
  ART_CANVAS_DPR_CAP,
  ART_UNDO_LIMIT,
  discardArtDraft,
  loadArtDraft,
  persistArtDraftNow,
  scheduleArtDraftPersist,
  artDraftObjectUrl,
} from "@/lib/board/artDraftSession";
import { ART_BLEND_STRENGTH, grabArtSmudge, stampArtSmudge } from "@/lib/board/artSmudge";

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
export default function BoardArtCanvas({
  onSave,
  backgroundImageUrl,
  backgroundVideoUrl,
  initialOverlayUrl,
  exportMode = "composite",
  saveLabel = "Use art →",
  operatingTable = false,
  layout = "side",
}: {
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
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgImgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const undoRef = useRef<HTMLCanvasElement[]>([]);
  const redoRef = useRef<HTMLCanvasElement[]>([]);
  const dprRef = useRef(1);
  const recoveredUrlRef = useRef("");
  const [recovered, setRecovered] = useState(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelDraggingRef = useRef(false);
  // Smudge ("blend") brush state: an offscreen buffer holds the paint the brush
  // is currently carrying, plus its device-pixel diameter.
  const smudgeBufRef = useRef<HTMLCanvasElement | null>(null);
  const smudgeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const blendDiamRef = useRef(0);

  const [objectTool, setObjectTool] = useState<ObjectTool>("text");
  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [paper, setPaper] = useState(false); // dark by default
  const [brushMode, setBrushMode] = useState<ArtBrushMode>("paint");
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const [layers, setLayers] = useState(() => initialArtLayers());
  const [activeLayerId, setActiveLayerId] = useState("layer-1");
  const layersRef = useRef(layers);
  const activeLayerRef = useRef(activeLayerId);
  const layerStoresRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  layersRef.current = layers;
  activeLayerRef.current = activeLayerId;
  const onPhoto = !!backgroundImageUrl || !!backgroundVideoUrl;

  function storeFor(id: string, width: number, height: number) {
    let stored = layerStoresRef.current.get(id);
    if (!stored) {
      stored = document.createElement("canvas");
      stored.width = width;
      stored.height = height;
      layerStoresRef.current.set(id, stored);
    }
    return stored;
  }

  function stashActiveLayer() {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 1) return;
    const stored = storeFor(activeLayerRef.current, canvas.width, canvas.height);
    if (stored.width !== canvas.width || stored.height !== canvas.height) {
      const previous = document.createElement("canvas");
      previous.width = stored.width;
      previous.height = stored.height;
      previous.getContext("2d")?.drawImage(stored, 0, 0);
      stored.width = canvas.width;
      stored.height = canvas.height;
      stored.getContext("2d")?.drawImage(previous, 0, 0, stored.width, stored.height);
    }
    const storedCtx = stored.getContext("2d");
    storedCtx?.clearRect(0, 0, stored.width, stored.height);
    storedCtx?.drawImage(canvas, 0, 0);
  }

  function showLayer(id: string) {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const stored = layerStoresRef.current.get(id);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (stored) ctx.drawImage(stored, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function selectLayer(id: string) {
    if (id === activeLayerRef.current) return;
    stashActiveLayer();
    setActiveLayerId(id);
    showLayer(id);
  }

  function addLayer() {
    const next = addArtLayer(layersRef.current);
    if (next.length === layersRef.current.length) return;
    stashActiveLayer();
    const created = next[next.length - 1];
    const canvas = canvasRef.current;
    if (canvas) {
      const blank = storeFor(created.id, canvas.width, canvas.height);
      blank.getContext("2d")?.clearRect(0, 0, blank.width, blank.height);
    }
    setLayers(next);
    setActiveLayerId(created.id);
    showLayer(created.id);
  }

  function removeLayer(id: string) {
    const current = layersRef.current;
    const next = deleteArtLayer(current, id);
    if (next.length === current.length) return;
    stashActiveLayer();
    layerStoresRef.current.delete(id);
    const active = nextActiveArtLayer(current, id, activeLayerRef.current);
    setLayers(next);
    setActiveLayerId(active);
    showLayer(active);
  }

  function moveLayer(id: string, direction: -1 | 1) {
    setLayers((current) => moveArtLayer(current, id, direction));
  }

  function mergeLayerDown(id: string) {
    const current = layersRef.current;
    const index = current.findIndex((layer) => layer.id === id);
    if (index <= 0) return;
    const targetId = current[index - 1].id;
    if (!mergeArtLayerIds(current, id, targetId)) return;
    stashActiveLayer();
    const target = layerStoresRef.current.get(targetId);
    const dragged = layerStoresRef.current.get(id);
    if (target && dragged) target.getContext("2d")?.drawImage(dragged, 0, 0);
    layerStoresRef.current.delete(id);
    setLayers(deleteArtLayer(current, id));
    setActiveLayerId(targetId);
    showLayer(targetId);
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
    const dpr = Math.min(window.devicePixelRatio || 1, ART_CANVAS_DPR_CAP);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === nextW && canvas.height === nextH && ctxRef.current) return;

    // Preserve current strokes across the resize.
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
    // Map CSS pixels → device pixels so pointer coords (in CSS px) draw 1:1.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    dprRef.current = dpr;

    if (prev) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, nextW, nextH);
      ctx.restore();
    }
    // Keep the latest frame; drop pixel-tied undo stacks after a real resize.
    undoRef.current = [];
    redoRef.current = [];
  }

  useEffect(() => {
    syncCanvas();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncCanvas());
    ro.observe(canvas);
    const blockNav = (event: TouchEvent) => {
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    };
    canvas.addEventListener("touchstart", blockNav, { passive: false });
    canvas.addEventListener("touchmove", blockNav, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener("touchstart", blockNav);
      canvas.removeEventListener("touchmove", blockNav);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || initialOverlayUrl) return;
    void loadArtDraft().then((record) => {
      if (cancelled || !record?.overlay) return;
      const url = artDraftObjectUrl(record.overlay);
      recoveredUrlRef.current = url;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        syncCanvas();
        const ctx = ctxRef.current;
        if (!ctx || !canvasRef.current) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(image, 0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.restore();
        if (record.paper) setPaper(true);
        setRecovered(true);
      };
      image.src = url;
    });
    return () => {
      cancelled = true;
      if (recoveredUrlRef.current) {
        URL.revokeObjectURL(recoveredUrlRef.current);
        recoveredUrlRef.current = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOverlayUrl]);

  useEffect(() => {
    const persist = () => {
      const canvas = canvasRef.current;
      if (canvas) void persistArtDraftNow(canvas, paper);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
      document.removeEventListener("visibilitychange", onHide);
      persist();
    };
  }, [paper]);

  useEffect(() => {
    return () => {
      undoRef.current.forEach((shot) => {
        shot.width = 0;
        shot.height = 0;
      });
      redoRef.current.forEach((shot) => {
        shot.width = 0;
        shot.height = 0;
      });
      undoRef.current = [];
      redoRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!initialOverlayUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncCanvas();
    const ctx = ctxRef.current;
    if (!ctx) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      undoRef.current = [];
      redoRef.current = [];
    };
    image.src = initialOverlayUrl;
    return () => {
      cancelled = true;
      image.onload = null;
    };
    // syncCanvas is intentionally local; the URL is the layer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOverlayUrl]);

  function pointFromXY(clientX: number, clientY: number) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function snapshotCanvas(source: HTMLCanvasElement) {
    const snap = document.createElement("canvas");
    const scale = 0.5;
    snap.width = Math.max(1, Math.round(source.width * scale));
    snap.height = Math.max(1, Math.round(source.height * scale));
    snap.getContext("2d")?.drawImage(source, 0, 0, snap.width, snap.height);
    return snap;
  }

  function restoreSnapshot(snap: HTMLCanvasElement) {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snap, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoRef.current.push(snapshotCanvas(canvas));
    if (undoRef.current.length > ART_UNDO_LIMIT) {
      const dropped = undoRef.current.shift();
      if (dropped) {
        dropped.width = 0;
        dropped.height = 0;
      }
    }
    redoRef.current = [];
  }

  // ---- Smudge / blend brush -------------------------------------------------
  // A real smudge: it carries the strokes under the brush and drags them along
  // the path, re-sampling as it travels so colors it passes over merge together
  // (like Procreate). It deposits NO new color and only ever reads/writes the
  // transparent strokes canvas — the photo/paper background sits underneath,
  // untouched (picture/video > brush strokes > blend strokes).
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
    const img = bgImgRef.current;
    grabArtSmudge({
      buffer: bctx,
      strokes: canvas,
      background: img,
      backgroundWidth: img?.naturalWidth ?? 0,
      backgroundHeight: img?.naturalHeight ?? 0,
      sampleBackground: onPhoto,
      cxDev,
      cyDev,
      diameter: D,
    });
  }

  function blendSegment(x0: number, y0: number, x1: number, y1: number, strength: number) {
    const ctx = ctxRef.current;
    const buf = smudgeBufRef.current;
    if (!ctx || !buf) return;
    stampArtSmudge({
      ctx,
      buffer: buf,
      x0,
      y0,
      x1,
      y1,
      strength,
      dpr: dprRef.current,
      diameter: blendDiamRef.current,
      grab: (cxDev, cyDev) => grabSmudge(cxDev, cyDev, blendDiamRef.current),
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.preventDefault();
    e.stopPropagation();
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
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.preventDefault();
    e.stopPropagation();

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
        const strength = Math.max(0.55, Math.min(0.99, ART_BLEND_STRENGTH + (pressure - 0.5) * 0.5));
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
  }

  function onPointerUp(e?: React.PointerEvent<HTMLCanvasElement>) {
    e?.stopPropagation();
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
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
    const canvas = canvasRef.current;
    if (canvas) scheduleArtDraftPersist(canvas, paper);
  }

  function onPointerLeave(e: React.PointerEvent<HTMLCanvasElement>) {
    e.stopPropagation();
    if (e.buttons) return;
    onPointerUp(e);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(snapshotCanvas(canvas));
    if (redoRef.current.length > ART_UNDO_LIMIT) {
      const dropped = redoRef.current.shift();
      if (dropped) {
        dropped.width = 0;
        dropped.height = 0;
      }
    }
    restoreSnapshot(prev);
    scheduleArtDraftPersist(canvas, paper);
  }

  function redo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshotCanvas(canvas));
    restoreSnapshot(next);
    scheduleArtDraftPersist(canvas, paper);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;

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
    stashActiveLayer();
    for (const layer of layersRef.current) {
      const stored = layerStoresRef.current.get(layer.id);
      if (stored) ctx.drawImage(stored, 0, 0, out.width, out.height);
    }

    const exportCanvas = scaleCanvasToMinLongEdge(out);
    exportCanvas.toBlob((blob) => {
      if (blob) onSave(new File([blob], `board-art-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  }

  const stageEl = (
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
        data-art-surface
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
      {recovered ? (
        <div className={styles.recoveredBar} role="status">
          Recovered Draft
          <button
            type="button"
            className={styles.recoveredDiscard}
            onClick={() => {
              void discardArtDraft();
              setRecovered(false);
              const canvas = canvasRef.current;
              const ctx = ctxRef.current;
              if (canvas && ctx) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
              }
            }}
          >
            Discard
          </button>
        </div>
      ) : null}
    </div>
  );

  const layerStrip = (
    <ArtLayerStrip
      layers={layers}
      activeId={activeLayerId}
      onSelect={selectLayer}
      onAdd={addLayer}
      onDelete={removeLayer}
      onMove={moveLayer}
      onMerge={mergeLayerDown}
    />
  );

  const artToolsEl = (
    <>
    {layerStrip}
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
    </>
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
}
