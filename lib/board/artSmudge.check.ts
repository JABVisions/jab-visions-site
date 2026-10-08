import assert from "node:assert/strict";
import { ART_BLEND_STRENGTH, coverSampleRect } from "./artSmudge";

assert.equal(ART_BLEND_STRENGTH, 0.94);

const sample = coverSampleRect(400, 500, 800, 600, 0, 0, 40);
assert.ok(sample);
assert.ok(Math.abs(sample.srcX - 160) < 0.01, "cover mapping lines the brush up with the photo");
assert.equal(sample.srcY, 0);
assert.ok(Math.abs(sample.srcSize - 48) < 0.01);

assert.equal(coverSampleRect(0, 10, 10, 10, 0, 0, 8), null);
assert.equal(coverSampleRect(10, 10, 10, 10, 0, 0, 0), null);

console.log("art smudge checks passed");
