/** Shared Blend Brush smudge. Art Mode and the Vision/Video overlay both use this. */

export const ART_BLEND_STRENGTH = 0.94;

export type CoverSample = {
  srcX: number;
  srcY: number;
  srcSize: number;
};

/** Map a device-pixel brush rect onto an object-fit:cover source. */
export function coverSampleRect(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  sx: number,
  sy: number,
  diameter: number
): CoverSample | null {
  if (canvasWidth <= 0 || canvasHeight <= 0 || imageWidth <= 0 || imageHeight <= 0 || diameter <= 0) {
    return null;
  }
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const ox = (canvasWidth - imageWidth * scale) / 2;
  const oy = (canvasHeight - imageHeight * scale) / 2;
  return {
    srcX: (sx - ox) / scale,
    srcY: (sy - oy) / scale,
    srcSize: diameter / scale,
  };
}

type SmudgeTarget = {
  buffer: CanvasRenderingContext2D;
  strokes: HTMLCanvasElement;
  background?: CanvasImageSource | null;
  backgroundWidth?: number;
  backgroundHeight?: number;
  sampleBackground?: boolean;
  cxDev: number;
  cyDev: number;
  diameter: number;
};

export function grabArtSmudge({
  buffer,
  strokes,
  background,
  backgroundWidth = 0,
  backgroundHeight = 0,
  sampleBackground = false,
  cxDev,
  cyDev,
  diameter,
}: SmudgeTarget) {
  const sx = cxDev - diameter / 2;
  const sy = cyDev - diameter / 2;
  buffer.globalCompositeOperation = "source-over";
  buffer.globalAlpha = 1;
  buffer.clearRect(0, 0, diameter, diameter);

  if (sampleBackground && background && backgroundWidth > 0 && backgroundHeight > 0) {
    const sample = coverSampleRect(
      strokes.width,
      strokes.height,
      backgroundWidth,
      backgroundHeight,
      sx,
      sy,
      diameter
    );
    if (sample) {
      try {
        buffer.drawImage(
          background,
          sample.srcX,
          sample.srcY,
          sample.srcSize,
          sample.srcSize,
          0,
          0,
          diameter,
          diameter
        );
      } catch {
        // A detached frame or a not-yet-decoded video is skipped; strokes still smear.
      }
    }
  }

  const ix = Math.max(0, sx);
  const iy = Math.max(0, sy);
  const iw = Math.min(strokes.width, sx + diameter) - ix;
  const ih = Math.min(strokes.height, sy + diameter) - iy;
  if (iw > 0 && ih > 0) {
    buffer.drawImage(strokes, ix, iy, iw, ih, ix - sx, iy - sy, iw, ih);
  }
  buffer.globalCompositeOperation = "destination-in";
  const gradient = buffer.createRadialGradient(
    diameter / 2,
    diameter / 2,
    0,
    diameter / 2,
    diameter / 2,
    diameter / 2
  );
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.95)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  buffer.fillStyle = gradient;
  buffer.fillRect(0, 0, diameter, diameter);
  buffer.globalCompositeOperation = "source-over";
}

export function stampArtSmudge({
  ctx,
  buffer,
  x0,
  y0,
  x1,
  y1,
  strength,
  dpr,
  diameter,
  grab,
}: {
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  strength: number;
  dpr: number;
  diameter: number;
  grab: (cxDev: number, cyDev: number) => void;
}) {
  if (diameter <= 0 || dpr <= 0) return;
  const radius = diameter / 2;
  const stepCss = Math.max(1, (diameter * 0.1) / dpr);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.round(dist / stepCss));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const cxDev = (x0 + (x1 - x0) * t) * dpr;
    const cyDev = (y0 + (y1 - y0) * t) * dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = strength;
    ctx.drawImage(buffer, cxDev - radius, cyDev - radius);
    ctx.restore();
    grab(cxDev, cyDev);
  }
  ctx.globalAlpha = 1;
}
