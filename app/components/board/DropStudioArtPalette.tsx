"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import ArtPaletteTools, { type ArtBrushMode } from "./ArtPaletteTools";
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
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  initialOverlayUrl?: string;
  onOverlayChange: (url?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const wheelDraggingRef = useRef(false);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const initialPaintedRef = useRef(false);
  const [portalReady, setPortalReady] = useState(false);
  const [color, setColor] = useState("#FF4FD8");
  const [size, setSize] = useState(8);
  const [light, setLight] = useState(65);
  const [wheelHue, setWheelHue] = useState(318);
  const [wheelSat, setWheelSat] = useState(100);
  const [brushMode, setBrushMode] = useState<ArtBrushMode>("paint");

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = canvas;

    function syncCanvas() {
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
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
    }

    syncCanvas();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncCanvas);
    observer?.observe(target);
    return () => observer?.disconnect();
  }, [portalReady]);

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
    context.globalAlpha = brushMode === "blend" ? 0.22 : 1;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = size;
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = contextRef.current;
    if (!context) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    snapshot();
    drawingRef.current = true;
    const next = point(event);
    lastPointRef.current = next;
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
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + next.x) / 2, (previous.y + next.y) / 2);
    context.stroke();
    lastPointRef.current = next;
  }

  function applyArt() {
    const canvas = canvasRef.current;
    if (canvas) onOverlayChange(canvas.toDataURL("image/png"));
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
    <canvas
      ref={canvasRef}
      className={styles.artCanvasLayer}
      aria-label="Draw on this Drop"
      onPointerDown={startDrawing}
      onPointerMove={moveDrawing}
      onPointerUp={stopDrawing}
      onPointerCancel={stopDrawing}
      onPointerLeave={stopDrawing}
    />
  );

  return (
    <>
      {portalReady && hostRef.current ? createPortal(canvas, hostRef.current) : null}
      <div className={styles.inlineArtPalette}>
        <div className={styles.inlineArtHeading}>Art Palette</div>
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
          onWheelDragStart={() => { wheelDraggingRef.current = true; }}
          onWheelDragEnd={() => { wheelDraggingRef.current = false; }}
          onColorPick={(next) => { setBrushMode("paint"); setColor(next); }}
          onLightChange={(next) => { setLight(next); setColor(hslToHex(wheelHue, wheelSat, next)); }}
          onSizeChange={setSize}
          onBrushModeChange={setBrushMode}
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
