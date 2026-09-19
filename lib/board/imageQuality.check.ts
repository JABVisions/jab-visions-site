import {
  isHeicFile,
  scaleToLongEdgeRange,
  scaleToMaxLongEdge,
  scaleToMinLongEdge,
} from "./imageQuality";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(isHeicFile({ type: "image/heic", name: "IMG_0001.HEIC" }), "heic mime should match");
assert(isHeicFile({ type: "", name: "cover.heif" }), "heif extension should match");
assert(!isHeicFile({ type: "image/jpeg", name: "cover.jpg" }), "jpeg should not count as heic");

const up = scaleToMinLongEdge(640, 480, 1080);
assert(up.width === 1080 && up.height === 810, "min long-edge should upscale 640x480 to 1080x810");

const down = scaleToMaxLongEdge(4032, 3024, 1600);
assert(down.width === 1600 && down.height === 1200, "max long-edge should shrink a 12MP still to 1600x1200");

const cover = scaleToLongEdgeRange(4032, 3024, 1080, 1600);
assert(cover.width === 1600 && cover.height === 1200, "cover range should cap at 1600");

const tiny = scaleToLongEdgeRange(400, 300, 1080, 1600);
assert(tiny.width === 1080 && tiny.height === 810, "cover range should still upscale tiny stills");

const already = scaleToLongEdgeRange(1600, 900, 1080, 1600);
assert(already.width === 1600 && already.height === 900, "already-in-range stills should stay put");

console.log("imageQuality.check.ts ok");
