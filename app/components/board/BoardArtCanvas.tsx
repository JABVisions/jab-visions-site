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
import { BOARD_DROP_ASPECT_RATIO } from "@/lib/board/mediaFormat";

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

export default function BoardArtCanvas({
  onSave,
  backgroundImageUrl,
  saveLabel = "Use art →",
}: {
  onSave: (file: File) => void;
  /** When set, strokes draw on top of this image (draw-on-photo for Vision). */
  backgroundImageUrl?: string;
  saveLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgImgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
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

  type BrushMode = "paint" | "blend" | "erase";

  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [paper, setPaper] = useState(false); // dark by default
  const [brushMode, setBrushMode] = useState<BrushMode>("paint");
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const onPhoto = !!backgroundImageUrl;

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
    // Undo/redo snapshots are tied to the old backing-store dimensions, so reset
    // them on a real resize to avoid putImageData misalignment.
    undoRef.current = [];
    redoRef.current = [];
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

  function pointFromXY(clientX: number, clientY: number) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoRef.current.length > 24) undoRef.current.shift();
    // A fresh edit invalidates the redo stack.
    redoRef.current = [];
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
      // up exactly with what's displayed.
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
    const ctx = ctxRef.current;
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
    const ctx = ctxRef.current;
    if (!ctx) return;
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
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
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
  }

  function onPointerUp() {
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
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const prev = undoRef.current.pop();
    if (!prev) return;
    // Stash the current frame so it can be redone.
    redoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(prev, 0, 0);
  }

  function redo() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(next, 0, 0);
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
    if (onPhoto && bgImgRef.current && bgImgRef.current.naturalWidth) {
      // cover-fit the photo into the output frame
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

    out.toBlob((blob) => {
      if (blob) onSave(new File([blob], `board-art-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div className="artMode">
      <div className="artStageWrap">
        <div className={`artStage ${paper && !onPhoto ? "paper" : ""}`}>
          {onPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={bgImgRef} src={backgroundImageUrl} alt="" className="artBg" crossOrigin="anonymous" />
          ) : null}
          <canvas
            ref={canvasRef}
            className="artCanvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      <div className="artTools">
        <div className="artWheelRow">
          <div
            ref={wheelRef}
            className="artWheel"
            role="slider"
            aria-label="Color wheel"
            aria-valuetext={color}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              wheelDraggingRef.current = true;
              pickFromWheel(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (wheelDraggingRef.current) pickFromWheel(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              wheelDraggingRef.current = false;
            }}
            onPointerCancel={() => {
              wheelDraggingRef.current = false;
            }}
          >
            <span
              className="artWheelDot"
              style={{
                left: `${50 + Math.cos((wheelHue * Math.PI) / 180) * (wheelSat / 2)}%`,
                top: `${50 + Math.sin((wheelHue * Math.PI) / 180) * (wheelSat / 2)}%`,
                background: color,
              }}
              aria-hidden
            />
          </div>

          <div className="artWheelSide">
            <div className="artColors">
              {BOARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`artSwatch ${
                    brushMode !== "erase" && color.toLowerCase() === c.toLowerCase() ? "on" : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => {
                    setBrushMode("paint");
                    setColor(c);
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
              {onPhoto ? null : (
                <button
                  type="button"
                  className="artBgToggle artBgToggleInline"
                  onClick={() => setPaper((p) => !p)}
                  aria-pressed={paper}
                >
                  {paper ? "Paper" : "Dark"}
                </button>
              )}
            </div>
            <div className="artLight">
              <span className="artFieldLabel">Light</span>
              <input
                type="range"
                min={10}
                max={92}
                value={light}
                onChange={(e) => {
                  const l = Number(e.target.value);
                  setLight(l);
                  setBrushMode("paint");
                  setColor(hslToHex(wheelHue, wheelSat, l));
                }}
                aria-label="Lightness"
              />
            </div>
            <div className="artBrush">
              <span className="artFieldLabel">Brush</span>
              <span
                className="artBrushDot"
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
                onChange={(e) => setSize(Number(e.target.value))}
                aria-label="Brush size"
              />
            </div>
          </div>
        </div>

        <div className="artActions">
          <button
            type="button"
            className={`artGhost ${brushMode === "paint" ? "on" : ""}`}
            onClick={() => setBrushMode("paint")}
            aria-pressed={brushMode === "paint"}
          >
            Paint
          </button>
          <button
            type="button"
            className={`artGhost ${brushMode === "blend" ? "on" : ""}`}
            onClick={() => setBrushMode("blend")}
            aria-pressed={brushMode === "blend"}
          >
            Blend
          </button>
          <button
            type="button"
            className={`artGhost ${brushMode === "erase" ? "on" : ""}`}
            onClick={() => setBrushMode("erase")}
            aria-pressed={brushMode === "erase"}
          >
            Eraser
          </button>
          <button type="button" className="artGhost" onClick={undo}>
            Undo
          </button>
          <button type="button" className="artGhost" onClick={redo}>
            Redo
          </button>
          <button type="button" className="artGhost" onClick={clearCanvas}>
            Clear
          </button>
          <button type="button" className="artSave" onClick={save}>
            {saveLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .artMode {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
          width: 100%;
          gap: 10px;
          padding: 12px;
        }
        /* The stage flexes to whatever space is left after the tools, so the
           color row + controls below it are always on-screen and never clipped
           by the canvas — on desktop and mobile alike. */
        .artStageWrap {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .artStage {
          position: relative;
          aspect-ratio: 4 / 5;
          /* height drives the size (the wrap gives it a definite height), width
             follows the 4:5 ratio and is clamped by max-width. Without a definite
             dimension the stage collapses / the cover-fit image blows up. */
          height: 100%;
          width: auto;
          max-width: 100%;
          max-height: 100%;
          margin: 0 auto;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: ${DARK_BG};
          box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
        }
        .artStage.paper {
          background: ${PAPER_BG};
        }
        .artBg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
        }
        .artCanvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          touch-action: none;
          cursor: crosshair;
        }
        .artTools {
          flex: 0 0 auto;
          display: grid;
          gap: 10px;
        }
        .artRow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .artColors {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          align-items: center;
          justify-content: flex-start;
        }
        .artBgToggleInline {
          padding: 4px 10px;
          font-size: 10px;
        }
        .artSwatch {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          cursor: pointer;
          padding: 0;
          flex: 0 0 auto;
        }
        .artSwatch.on {
          border-color: #fff;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
          transform: scale(1.12);
        }
        .artWheelRow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .artWheel {
          position: relative;
          width: 104px;
          height: 104px;
          border-radius: 999px;
          flex: 0 0 auto;
          cursor: crosshair;
          touch-action: none;
          background:
            radial-gradient(circle, #fff 0%, rgba(255, 255, 255, 0) 70%),
            conic-gradient(
              from 90deg,
              hsl(0, 100%, 60%),
              hsl(60, 100%, 60%),
              hsl(120, 100%, 60%),
              hsl(180, 100%, 60%),
              hsl(240, 100%, 60%),
              hsl(300, 100%, 60%),
              hsl(360, 100%, 60%)
            );
          border: 1px solid rgba(255, 255, 255, 0.28);
          box-shadow:
            inset 0 0 14px rgba(0, 0, 0, 0.35),
            0 0 18px rgba(126, 226, 255, 0.18);
        }
        .artWheelDot {
          position: absolute;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          border: 2px solid #fff;
          box-shadow: 0 0 8px rgba(0, 0, 0, 0.55);
          pointer-events: none;
        }
        .artWheelSide {
          display: grid;
          gap: 10px;
          flex: 1 1 200px;
          min-width: 180px;
        }
        .artLight,
        .artBrush {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .artFieldLabel {
          flex: 0 0 auto;
          width: 40px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(126, 246, 230, 0.82);
        }
        .artLight input,
        .artBrush input {
          flex: 1 1 auto;
          width: 100%;
        }
        .artBgToggle {
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.22);
          cursor: pointer;
        }
        .artBrushDot {
          border-radius: 999px;
          flex: 0 0 auto;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }
        .artActions {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .artGhost {
          border-radius: 999px;
          padding: 9px 16px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        .artGhost.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 14px rgba(126, 226, 255, 0.4);
        }
        .artSave {
          border-radius: 999px;
          padding: 9px 20px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.08em;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 18px rgba(126, 226, 255, 0.45);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
