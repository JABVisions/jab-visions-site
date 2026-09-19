"use client";

import { detectDropFrameFromDimensions, type DropMediaFrame } from "@/lib/board/mediaFormat";

/** Minimum long-edge pixel count for Board photos (1080p-class). */
export const BOARD_IMAGE_MIN_LONG_EDGE = 1080;

/** Cap huge phone stills so canvas encode + storage upload cannot hang. */
export const BOARD_IMAGE_MAX_LONG_EDGE = 2560;

/** Project Drop covers do not need Drop-Studio 1080p masters. */
export const PROJECT_COVER_MAX_LONG_EDGE = 1600;

export const BOARD_IMAGE_JPEG_QUALITY = 0.94;

const IMAGE_DECODE_TIMEOUT_MS = 8_000;
const IMAGE_ENCODE_TIMEOUT_MS = 8_000;
const HEIC_CONVERT_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

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

export function scaleToMaxLongEdge(
  width: number,
  height: number,
  maxLongEdge = BOARD_IMAGE_MAX_LONG_EDGE
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long <= maxLongEdge) return { width: w, height: h };

  const scale = maxLongEdge / long;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function scaleToLongEdgeRange(
  width: number,
  height: number,
  minLongEdge = BOARD_IMAGE_MIN_LONG_EDGE,
  maxLongEdge = BOARD_IMAGE_MAX_LONG_EDGE
): { width: number; height: number } {
  const capped = scaleToMaxLongEdge(width, height, Math.max(minLongEdge, maxLongEdge));
  return scaleToMinLongEdge(capped.width, capped.height, minLongEdge);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  let settled = false;
  const finish = (action: () => void) => {
    if (settled) return;
    settled = true;
    URL.revokeObjectURL(url);
    action();
  };
  const decode = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => finish(() => resolve(img));
    img.onerror = () => finish(() => reject(new Error("Could not load image.")));
    img.src = url;
  });
  return withTimeout(decode, IMAGE_DECODE_TIMEOUT_MS, "Image decode timed out.").catch((error) => {
    finish(() => undefined);
    throw error;
  });
}

function canNativeDecodeHeic() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|Android/i.test(ua);
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
  return withTimeout(
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    }),
    IMAGE_ENCODE_TIMEOUT_MS,
    "Image encode timed out."
  ).catch(() => {
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return null;
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: "image/jpeg" });
    } catch {
      return null;
    }
  });
}

export function isHeicFile(file: { type?: string; name?: string }) {
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    /\.heic$/.test(name) ||
    /\.heif$/.test(name)
  );
}

function jpegFileFromBlob(blob: Blob, name: string) {
  const baseName = name.replace(/\.[^.]+$/, "") || "board-image";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function rasterizeImageFile(
  file: File,
  minLongEdge: number,
  maxLongEdge: number
): Promise<File | null> {
  const img = await loadImageFromFile(file);
  const target = scaleToLongEdgeRange(
    img.naturalWidth,
    img.naturalHeight,
    minLongEdge,
    maxLongEdge
  );
  if (
    target.width === img.naturalWidth &&
    target.height === img.naturalHeight &&
    file.type === "image/jpeg"
  ) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, target.width, target.height);

  const blob = await canvasToJpegBlob(canvas);
  if (!blob) return null;
  return jpegFileFromBlob(blob, file.name);
}

async function convertHeicWithWasm(file: File): Promise<File | null> {
  const converted = await withTimeout(
    (async () => {
      const { default: heic2any } = await import("heic2any");
      return heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: BOARD_IMAGE_JPEG_QUALITY,
      });
    })(),
    HEIC_CONVERT_TIMEOUT_MS,
    "HEIC conversion timed out."
  );
  const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!(jpegBlob instanceof Blob)) return null;
  return jpegFileFromBlob(jpegBlob, file.name);
}

/** Browsers cannot paint HEIC in <img> tags — normalize uploads to JPEG first. */
export async function convertHeicToJpegIfNeeded(file: File): Promise<File> {
  if (typeof window === "undefined" || !isHeicFile(file)) return file;
  if (canNativeDecodeHeic()) {
    try {
      const native = await rasterizeImageFile(
        file,
        BOARD_IMAGE_MIN_LONG_EDGE,
        BOARD_IMAGE_MAX_LONG_EDGE
      );
      if (native) return native;
    } catch {
      // Fall through to WASM when native decode fails.
    }
  }
  try {
    const wasm = await convertHeicWithWasm(file);
    if (wasm) return wasm;
  } catch {
    return file;
  }
  return file;
}

function isRasterImage(file: File) {
  return (
    file.type.startsWith("image/") &&
    file.type !== "image/gif" &&
    file.type !== "image/svg+xml"
  );
}

/** Resize a still so it is large enough for Board but small enough to upload. */
export async function prepareBoardImageFile(
  file: File,
  opts?: { minLongEdge?: number; maxLongEdge?: number }
): Promise<File> {
  if (typeof window === "undefined") return file;
  const minLongEdge = opts?.minLongEdge ?? BOARD_IMAGE_MIN_LONG_EDGE;
  const maxLongEdge = opts?.maxLongEdge ?? BOARD_IMAGE_MAX_LONG_EDGE;
  const normalized = await convertHeicToJpegIfNeeded(file);
  if (!isRasterImage(normalized) || isHeicFile(normalized)) return normalized;
  try {
    return (await rasterizeImageFile(normalized, minLongEdge, maxLongEdge)) || normalized;
  } catch {
    return normalized;
  }
}

/** Upscale (never downscale below min) raster uploads so the long edge is at least 1080px. */
export async function ensureImageFileMinResolution(
  file: File,
  minLongEdge = BOARD_IMAGE_MIN_LONG_EDGE
): Promise<File> {
  return prepareBoardImageFile(file, {
    minLongEdge,
    maxLongEdge: BOARD_IMAGE_MAX_LONG_EDGE,
  });
}

export async function detectFrameFromFile(file: File): Promise<DropMediaFrame> {
  if (typeof window === "undefined") return "portrait";
  if (file.type.startsWith("image/") && file.type !== "image/gif" && file.type !== "image/svg+xml") {
    try {
      const img = await loadImageFromFile(file);
      return detectDropFrameFromDimensions(img.naturalWidth, img.naturalHeight);
    } catch {
      return "portrait";
    }
  }
  if (file.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(detectDropFrameFromDimensions(video.videoWidth, video.videoHeight));
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("portrait");
      };
      video.src = url;
    });
  }
  return "portrait";
}

export async function rotateImageFile(
  file: File,
  rotation: 0 | 90 | 180 | 270
): Promise<File> {
  if (rotation === 0 || !file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const img = await loadImageFromFile(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const quarter = rotation === 90 || rotation === 270;
    canvas.width = quarter ? img.naturalHeight : img.naturalWidth;
    canvas.height = quarter ? img.naturalWidth : img.naturalHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

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
