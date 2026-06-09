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

  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [paper, setPaper] = useState(false); // dark by default
  const onPhoto = !!backgroundImageUrl;

  // Size the transparent drawing canvas to its element (DPR-aware).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoRef.current.length > 24) undoRef.current.shift();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    drawingRef.current = true;
    const { x, y } = pointFromEvent(e);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
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
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp() {
    drawingRef.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function undo() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const prev = undoRef.current.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
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
                className={`artSwatch ${color.toLowerCase() === c.toLowerCase() ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
            <label className="artPicker" aria-label="Custom color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
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

        <div className="artBrush">
          <span className="artBrushDot" style={{ width: size, height: size, background: color }} aria-hidden />
          <input
            type="range"
            min={2}
            max={48}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
          />
        </div>

        <div className="artActions">
          <button type="button" className="artGhost" onClick={undo}>
            Undo
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
        .artPicker {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          overflow: hidden;
          border: 2px dashed rgba(255, 255, 255, 0.4);
          display: inline-grid;
          place-items: center;
          cursor: pointer;
        }
        .artPicker input {
          width: 40px;
          height: 40px;
          border: 0;
          background: none;
          cursor: pointer;
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
        .artBrush {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
        }
        .artBrushDot {
          border-radius: 999px;
          flex: 0 0 auto;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }
        .artBrush input {
          width: min(260px, 60vw);
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
