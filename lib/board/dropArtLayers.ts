// File: lib/board/dropArtLayers.ts
// Pure, DOM-only helpers for managing Drop Studio's Art Mode layer stack —
// creating, duplicating, merging, and flattening layers as PNG data — kept
// independent of whether the live drawing canvas is mounted. Structural edits
// (new/delete/duplicate/reorder/rename/visibility/lock/opacity) only ever
// touch the `DropCustomization.artLayers` array; only an actual brush stroke
// needs the live canvas in DropStudioArtPalette.

import type { DropStudioArtLayer } from "./dropCustomizations";

function makeLayerId() {
  return `art-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function nextLayerName(existing: DropStudioArtLayer[]) {
  return `Layer ${existing.length + 1}`;
}

export function createEmptyArtLayer(name?: string): DropStudioArtLayer {
  return {
    id: makeLayerId(),
    name: name || "New Layer",
    visible: true,
    locked: false,
    opacity: 1,
  };
}

export function duplicateArtLayer(layer: DropStudioArtLayer): DropStudioArtLayer {
  return {
    ...layer,
    id: makeLayerId(),
    name: `${layer.name} copy`,
    locked: false,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load Art Mode layer image"));
    img.src = src;
  });
}

/** Composite the visible art layers (bottom → top) into one PNG data URL. */
export async function compositeArtLayers(
  layers: DropStudioArtLayer[],
  size?: { width: number; height: number }
): Promise<string | undefined> {
  const withPixels = layers.filter((layer) => layer.visible && layer.dataUrl);
  if (!withPixels.length) return undefined;

  let images: { layer: DropStudioArtLayer; img: HTMLImageElement }[];
  try {
    images = await Promise.all(
      withPixels.map(async (layer) => ({ layer, img: await loadImage(layer.dataUrl!) }))
    );
  } catch {
    return undefined;
  }

  const width = size?.width || Math.max(1, ...images.map(({ img }) => img.naturalWidth));
  const height = size?.height || Math.max(1, ...images.map(({ img }) => img.naturalHeight));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  for (const { layer, img } of images) {
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(img, 0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png");
}

/**
 * Merge one art layer's pixels down into the ART layer directly beneath it in
 * the stack (skipping over any interleaved text/sticker entries — merge is
 * art-on-art only in this phase). Both layers' opacity are baked into the
 * result, which is then reset to fully opaque so it reads the same as before.
 */
export async function mergeArtLayerDown(
  layers: DropStudioArtLayer[],
  layerId: string
): Promise<DropStudioArtLayer[]> {
  const index = layers.findIndex((l) => l.id === layerId);
  if (index <= 0) return layers;
  const above = layers[index];
  const below = layers[index - 1];
  if (below.locked) return layers;

  if (!above.dataUrl) {
    // Nothing drawn on it — merging is just removing the empty layer.
    return layers.filter((l) => l.id !== layerId);
  }

  let aboveImg: HTMLImageElement;
  let belowImg: HTMLImageElement | null = null;
  try {
    aboveImg = await loadImage(above.dataUrl);
    if (below.dataUrl) belowImg = await loadImage(below.dataUrl);
  } catch {
    return layers;
  }

  const width = Math.max(aboveImg.naturalWidth, belowImg?.naturalWidth || 0, 1);
  const height = Math.max(aboveImg.naturalHeight, belowImg?.naturalHeight || 0, 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return layers;

  if (belowImg) {
    ctx.globalAlpha = below.opacity;
    ctx.drawImage(belowImg, 0, 0, width, height);
  }
  ctx.globalAlpha = above.opacity;
  ctx.drawImage(aboveImg, 0, 0, width, height);
  ctx.globalAlpha = 1;

  const merged: DropStudioArtLayer = {
    ...below,
    dataUrl: canvas.toDataURL("image/png"),
    opacity: 1,
    visible: true,
  };
  return layers.filter((l) => l.id !== layerId).map((l) => (l.id === below.id ? merged : l));
}

/** Flatten every art layer into a single one — an explicit, opt-in action. */
export async function flattenArtLayers(
  layers: DropStudioArtLayer[]
): Promise<DropStudioArtLayer[]> {
  if (layers.length <= 1) return layers;
  const dataUrl = await compositeArtLayers(layers);
  const flat: DropStudioArtLayer = {
    id: makeLayerId(),
    name: "Flattened Artwork",
    ...(dataUrl ? { dataUrl } : {}),
    visible: true,
    locked: false,
    opacity: 1,
  };
  return [flat];
}
