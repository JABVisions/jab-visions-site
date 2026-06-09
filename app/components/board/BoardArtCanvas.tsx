// File: app/components/board/BoardArtCanvas.tsx
// Drop Studio — Art Mode. A clean, Board-native drawing surface (tidy Microsoft
// Paint with early-Procreate controls). Strokes live on a TRANSPARENT canvas
// over a switchable background: dark or white paper, OR a captured photo (so the
// same tools let you draw directly on a Vision). Save composites bg + strokes
// into a PNG File that flows into the drop media flow.
// v2 scope only: no layers / blending / pressure / custom brushes.

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

  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [paper, setPaper] = useState(false); // dark by default
  const [erasing, setErasing] = useState(false);
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
    setErasing(false);
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

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    drawingRef.current = true;
    const { x, y } = pointFromXY(e.clientX, e.clientY);
    lastPtRef.current = { x, y };
    // Eraser cuts through strokes on the transparent canvas; brush paints color.
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
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
    if (ctx && last) {
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    drawingRef.current = false;
    lastPtRef.current = null;
    if (ctx) ctx.globalCompositeOperation = "source-over";
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

      <div className="artTools">
        <div className="artRow">
          <div className="artColors">
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`artSwatch ${
                  !erasing && color.toLowerCase() === c.toLowerCase() ? "on" : ""
                }`}
                style={{ background: c }}
                onClick={() => {
                  setErasing(false);
                  setColor(c);
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          {onPhoto ? null : (
            <button
              type="button"
              className="artBgToggle"
              onClick={() => setPaper((p) => !p)}
              aria-pressed={paper}
            >
              {paper ? "Paper" : "Dark"}
            </button>
          )}
        </div>

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
                  setErasing(false);
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
                  background: erasing ? "transparent" : color,
                  border: erasing ? "2px dashed rgba(255,255,255,0.7)" : undefined,
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
            className={`artGhost ${erasing ? "on" : ""}`}
            onClick={() => setErasing((e) => !e)}
            aria-pressed={erasing}
          >
            {erasing ? "Erasing" : "Eraser"}
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
          display: grid;
          grid-template-rows: 1fr auto;
          min-height: 0;
          height: 100%;
          gap: 10px;
          padding: 12px;
        }
        .artStage {
          position: relative;
          aspect-ratio: 4 / 5;
          width: min(100%, calc(54vh * 4 / 5));
          height: auto;
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
          gap: 8px;
          align-items: center;
          justify-content: center;
        }
        .artSwatch {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          cursor: pointer;
          padding: 0;
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
          width: 116px;
          height: 116px;
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
