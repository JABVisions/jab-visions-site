"use client";

import type { CSSProperties } from "react";
import type { DropCustomization } from "@/lib/board/dropCustomizations";
import {
  normalizeDropMediaRotation,
  resolveBoardDropDisplayFrame,
  type DropMediaFrame,
} from "@/lib/board/mediaFormat";

/** CSS class names for framed drop media (portrait 4:5 vs landscape 16:9). */
export function dropMediaFrameClassName(
  frame: DropMediaFrame,
  opts?: { wide?: boolean }
): string {
  const isWide = opts?.wide ?? frame === "landscape";
  return isWide ? "is-wide" : "is-portrait-framed";
}

export function dropMediaRotationStyle(rotation: number): CSSProperties | undefined {
  const deg = normalizeDropMediaRotation(rotation);
  if (!deg) return undefined;
  return { transform: `rotate(${deg}deg)` };
}

/** Tag a media host once intrinsic dimensions (or saved frame) are known. */
export function tagDropMediaFrame(
  el: HTMLImageElement | HTMLVideoElement,
  customizations?: DropCustomization | null,
  opts?: { dropType?: string; href?: string }
) {
  const host =
    el.closest(".activityImagePreview") ??
    el.closest(".mediaFrame") ??
    el.closest(".embed") ??
    el.closest(".media-thumb") ??
    el.closest(".linkPreviewArt");
  if (!host) return;

  if (host.classList.contains("linkPreviewArt") || host.closest(".linkPreview")) {
    host.classList.add("is-wide");
    host.classList.remove("is-portrait-framed");
    return;
  }

  const savedFrame = customizations?.effects?.frame;
  const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  const rotation = normalizeDropMediaRotation(customizations?.effects?.rotation);
  const intrinsic =
    w && h
      ? rotation === 90 || rotation === 270
        ? { width: h, height: w }
        : { width: w, height: h }
      : undefined;
  const frame =
    savedFrame === "landscape" || savedFrame === "portrait"
      ? savedFrame
      : resolveBoardDropDisplayFrame(customizations, {
          dropType: opts?.dropType,
          href: opts?.href,
          intrinsic,
        });
  const isWide = frame === "landscape";
  host.classList.toggle("is-wide", isWide);
  host.classList.toggle("is-portrait-framed", !isWide);
}
