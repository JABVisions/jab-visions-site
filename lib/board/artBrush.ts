/** Shared Art brush model for Art Mode and the Vision/Video overlay. */

export type ArtBrushMode = "paint" | "blend" | "erase";

export type ArtBrushPreset = {
  id: string;
  label: string;
  mode: ArtBrushMode;
  size: number;
  opacity: number;
};

/** 1×1 transparent PNG. Clearing a video overlay replaces the clip image with this. */
export const EMPTY_ART_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Clean Brush is the opaque paint brush. Blend smears. Erase removes paint. */
export const ART_BRUSH_PRESETS: ArtBrushPreset[] = [
  { id: "fine", label: "Fine", mode: "paint", size: 3, opacity: 1 },
  { id: "marker", label: "Marker", mode: "paint", size: 14, opacity: 1 },
  { id: "soft", label: "Soft", mode: "paint", size: 28, opacity: 0.35 },
  { id: "blend", label: "Blend", mode: "blend", size: 18, opacity: 0.85 },
  { id: "eraser", label: "Eraser", mode: "erase", size: 20, opacity: 1 },
];

export const STUDIO_OBJECT_TOOLS = [
  "text",
  "stickers",
  "button",
  "effects",
  "filters",
  "enhance",
] as const;

export type StudioObjectTool = (typeof STUDIO_OBJECT_TOOLS)[number] | "art";

/** Vision and Video gain an Art tool. Standalone object editing stays unchanged. */
export function studioObjectTools(enableArt: boolean): StudioObjectTool[] {
  return enableArt ? [...STUDIO_OBJECT_TOOLS, "art"] : [...STUDIO_OBJECT_TOOLS];
}

export function artToolLabel(tool: StudioObjectTool) {
  if (tool === "art") return "Art";
  if (tool === "text") return "Text";
  if (tool === "stickers") return "Stickers";
  if (tool === "button") return "Button";
  if (tool === "effects") return "Effects";
  if (tool === "filters") return "Filters";
  return "Enhance";
}

export function strokeCompositeForMode(mode: ArtBrushMode): GlobalCompositeOperation {
  return mode === "erase" ? "destination-out" : "source-over";
}

/** Eraser always clears at full strength. Paint and blend honor the opacity slider. */
export function strokeAlphaForMode(mode: ArtBrushMode, opacity: number) {
  if (mode === "erase") return 1;
  if (!Number.isFinite(opacity)) return 1;
  return Math.min(1, Math.max(0.05, opacity));
}

export function presetById(id: string) {
  return ART_BRUSH_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function imageHasInk(data: Uint8ClampedArray) {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}

export type ArtPointerBox = {
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  layoutWidth: number;
  layoutHeight: number;
  boxWidth: number;
  boxHeight: number;
  rotationDeg?: number;
};

/**
 * Map a pointer into the canvas layout box.
 * Resize, browser zoom, crop-sized boxes, and 90° media rotation stay aligned
 * with the pixel under the finger or Apple Pencil.
 */
export function pointerToArtSurface(input: ArtPointerBox) {
  const layoutWidth = input.layoutWidth > 0 ? input.layoutWidth : 1;
  const layoutHeight = input.layoutHeight > 0 ? input.layoutHeight : 1;
  const rotation = ((input.rotationDeg || 0) % 360 + 360) % 360;
  const swapped = rotation === 90 || rotation === 270;
  const scaleX = (swapped ? input.boxHeight : input.boxWidth) / layoutWidth || 1;
  const scaleY = (swapped ? input.boxWidth : input.boxHeight) / layoutHeight || 1;
  const rad = (-rotation * Math.PI) / 180;
  const dx = input.clientX - input.centerX;
  const dy = input.clientY - input.centerY;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    x: localX / scaleX + layoutWidth / 2,
    y: localY / scaleY + layoutHeight / 2,
  };
}
