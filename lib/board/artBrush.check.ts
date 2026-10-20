import assert from "node:assert/strict";
import {
  ART_BRUSH_PRESETS,
  imageHasInk,
  pointerToArtSurface,
  presetById,
  strokeAlphaForMode,
  strokeCompositeForMode,
  studioObjectTools,
} from "./artBrush";

const visionTools = studioObjectTools(true);
assert.equal(visionTools.includes("art"), true, "Vision and Video expose Art");
assert.equal(visionTools[0], "text");
assert.deepEqual(studioObjectTools(false), [
  "text",
  "stickers",
  "button",
  "effects",
  "filters",
  "enhance",
]);

const marker = presetById("marker");
assert.ok(marker);
assert.equal(marker.mode, "paint", "Clean Brush presets stay on the opaque paint brush");
assert.equal(marker.size, 14);
assert.equal(marker.opacity, 1);
assert.equal(strokeCompositeForMode(marker.mode), "source-over");
assert.equal(strokeAlphaForMode("paint", 0.4), 0.4, "opacity changes a clean stroke");

const blend = ART_BRUSH_PRESETS.find((preset) => preset.id === "blend");
assert.equal(blend?.mode, "blend");
assert.equal(strokeCompositeForMode("erase"), "destination-out");
assert.equal(strokeAlphaForMode("erase", 0.2), 1);

const blank = new Uint8ClampedArray(16);
assert.equal(imageHasInk(blank), false);
blank[7] = 12;
assert.equal(imageHasInk(blank), true, "a transparent layer keeps its painted alpha");

const still = pointerToArtSurface({
  clientX: 110,
  clientY: 130,
  centerX: 100,
  centerY: 100,
  layoutWidth: 100,
  layoutHeight: 100,
  boxWidth: 100,
  boxHeight: 100,
});
assert.equal(Math.round(still.x), 60);
assert.equal(Math.round(still.y), 80);

const zoomed = pointerToArtSurface({
  clientX: 200,
  clientY: 100,
  centerX: 100,
  centerY: 100,
  layoutWidth: 100,
  layoutHeight: 100,
  boxWidth: 200,
  boxHeight: 200,
});
assert.equal(Math.round(zoomed.x), 100, "a resized or zoomed surface stays under the pointer");
assert.equal(Math.round(zoomed.y), 50);

const turned = pointerToArtSurface({
  clientX: 200,
  clientY: 100,
  centerX: 100,
  centerY: 100,
  layoutWidth: 100,
  layoutHeight: 200,
  boxWidth: 200,
  boxHeight: 100,
  rotationDeg: 90,
});
assert.equal(Math.round(turned.x), 50, "rotation keeps the stroke on the turned photo");
assert.equal(Math.round(turned.y), 0);

console.log("art brush checks passed");
