"use client";

/** Minimum long-edge pixel count for Board photos (1080p-class). */
export const BOARD_IMAGE_MIN_LONG_EDGE = 1080;

export const BOARD_IMAGE_JPEG_QUALITY = 0.94;

export function scaleToMinLongEdge(
  width: number,
  height: number,
  minLongEdge = BOARD_IMAGE_MIN_LONG_EDGE
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long >= minLongEdge) return { width: w, height: h };

  const scale = minLongEdge / long;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image."));
    };
    img.src = url;
  });
}

export function scaleCanvasToMinLongEdge(
  canvas: HTMLCanvasElement,
  minLongEdge = BOARD_IMAGE_MIN_LONG_EDGE
): HTMLCanvasElement {
  const target = scaleToMinLongEdge(canvas.width, canvas.height, minLongEdge);
  if (target.width === canvas.width && target.height === canvas.height) return canvas;

  const out = document.createElement("canvas");
  out.width = target.width;
  out.height = target.height;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return out;
}

export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = BOARD_IMAGE_JPEG_QUALITY
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/** Upscale (never downscale) raster uploads so the long edge is at least 1080px. */
export async function ensureImageFileMinResolution(
  file: File,
  minLongEdge = BOARD_IMAGE_MIN_LONG_EDGE
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const img = await loadImageFromFile(file);
    const target = scaleToMinLongEdge(img.naturalWidth, img.naturalHeight, minLongEdge);
    if (target.width === img.naturalWidth && target.height === img.naturalHeight) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const blob = await canvasToJpegBlob(canvas);
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "board-image";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/** Output size for a Board Drop frame crop — at least 1080 on the long edge. */
export function boardDropFramePixelSize(cropWidth: number, cropHeight: number) {
  return scaleToMinLongEdge(cropWidth, cropHeight);
}
