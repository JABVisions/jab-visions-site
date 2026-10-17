import assert from "node:assert/strict";
import {
  coverCropRect,
  coverCropWithin,
  evenFrameSize,
  filmedCameraConstraints,
  visionFrameAspect,
  visionFrameIsLandscape,
} from "./videoFrame";

const wide = coverCropRect(1920, 1080, 4 / 5);
assert.equal(Math.round(wide.sh), 1080, "a wide sensor keeps its height when cropped to 4:5");
assert.ok(Math.abs(wide.sw / wide.sh - 4 / 5) < 0.001, "wide sensor crop is 4:5");
assert.ok(wide.sx > 0 && wide.sy === 0, "wide sensor crop cuts the sides");

const tall = coverCropRect(1080, 1920, 4 / 5);
assert.equal(Math.round(tall.sw), 1080, "a portrait sensor keeps its width when cropped to 4:5");
assert.ok(Math.abs(tall.sw / tall.sh - 4 / 5) < 0.001, "portrait sensor crop is 4:5");
assert.ok(tall.sy > 0 && tall.sx === 0, "portrait sensor crop cuts top and bottom");

const same = coverCropRect(864, 1080, 864 / 1080);
assert.ok(Math.abs(same.sw - 864) < 0.01 && Math.abs(same.sh - 1080) < 0.01, "matching aspect is not cropped");

const fitted = coverCropWithin(1080, 1920, undefined, 864, 1080);
assert.ok(Math.abs(fitted.sw / fitted.sh - 864 / 1080) < 0.001, "export cover matches the destination aspect");
assert.ok(fitted.sw <= 1080 && fitted.sh <= 1920, "export cover stays inside the source");

const size = evenFrameSize(4 / 5, 1080);
assert.equal(size.width % 2, 0, "encoded width is even");
assert.equal(size.height % 2, 0, "encoded height is even");
assert.ok(Math.abs(size.width / size.height - 4 / 5) < 0.01, "encoded frame stays near 4:5");

const camera = filmedCameraConstraints("user");
assert.equal(camera.resizeMode?.ideal, "crop-and-scale");
assert.equal(camera.aspectRatio && typeof camera.aspectRatio === "object" && "ideal" in camera.aspectRatio
  ? camera.aspectRatio.ideal
  : 0, 4 / 5);

assert.equal(visionFrameIsLandscape(768, 960), false, "4:5 portrait is not landscape");
assert.equal(visionFrameAspect(768, 960), "4 / 5", "portrait vision drops use 4:5");
assert.equal(visionFrameAspect(1080, 1920), "4 / 5", "tall phone video still presents as 4:5");
assert.equal(visionFrameIsLandscape(1920, 1080), true, "wide video is landscape");
assert.equal(visionFrameAspect(1920, 1080), "1920 / 1080", "landscape video keeps its own frame");

console.log("videoFrame.check ok");
