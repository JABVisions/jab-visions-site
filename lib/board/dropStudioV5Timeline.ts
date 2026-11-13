import { resolveTrimOutMs, type DropStudioV5Clip } from "@/lib/board/dropStudioV5";

export const PHONE_EDIT_TOOLS = [
  "trim",
  "split",
  "crop",
  "speed",
  "filters",
  "effects",
  "art",
  "text",
  "audio",
  "stickers",
  "layers",
] as const;

export type PhoneEditTool = (typeof PHONE_EDIT_TOOLS)[number];

export const TIMELINE_ZOOM_MIN = 0.5;
export const TIMELINE_ZOOM_MAX = 4;
export const TABLET_TIMELINE_FRACTION = 0.3;
export const FRAME_MS = 1000 / 30;

const BASE_PX_PER_MS = 0.042;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function timelinePxPerMs(zoom: number) {
  return BASE_PX_PER_MS * clamp(zoom, TIMELINE_ZOOM_MIN, TIMELINE_ZOOM_MAX);
}

export function nextTimelineZoom(current: number, factor: number) {
  const next = (Number.isFinite(current) ? current : 1) * (Number.isFinite(factor) ? factor : 1);
  return clamp(next, TIMELINE_ZOOM_MIN, TIMELINE_ZOOM_MAX);
}

/** Tablet and desktop timelines start inside the 25–35% band and can be dragged. */
export function clampTimelineFraction(value: number) {
  return clamp(value, 0.18, 0.52);
}

export function stepPlayheadMs(playheadMs: number, direction: -1 | 1, durationMs = Number.POSITIVE_INFINITY) {
  const next = Math.max(0, playheadMs + direction * FRAME_MS);
  return Math.min(next, Math.max(0, durationMs));
}

export function trimDeltaMs(deltaPx: number, pxPerMs: number) {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(pxPerMs) || pxPerMs <= 0) return 0;
  return deltaPx / pxPerMs;
}

export function trimEdgeByDelta(clip: DropStudioV5Clip, edge: "in" | "out", deltaMs: number) {
  const duration = Math.max(clip.sourceDurationMs, 1);
  const trimOut = resolveTrimOutMs(clip);
  if (edge === "in") {
    const nextIn = clamp(clip.trimInMs + deltaMs, 0, trimOut - 80);
    return { trimInMs: nextIn, trimOutMs: clip.trimOutMs > 0 ? trimOut : 0 };
  }
  const nextOut = clamp(trimOut + deltaMs, clip.trimInMs + 80, duration);
  return { trimInMs: clip.trimInMs, trimOutMs: nextOut >= duration - 0.5 ? 0 : nextOut };
}

export type TimelineBox = { id: string; left: number; right: number };

/** How many clips sit to the left of the drop point, ignoring the clip being dragged. */
export function dropIndexForClip(boxes: TimelineBox[], draggedId: string, x: number) {
  return boxes
    .filter((box) => box.id !== draggedId)
    .filter((box) => (box.left + box.right) / 2 < x).length;
}
