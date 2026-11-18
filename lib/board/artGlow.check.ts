import assert from "node:assert/strict";
import { artGlowColor, artGlowLayout, parseArtHex } from "./artGlow";

const pink = parseArtHex("#FF4FD8");
assert.deepEqual(pink, { r: 255, g: 79, b: 216 });
assert.equal(parseArtHex("nope"), null);

const lifted = artGlowColor("#111111");
assert.ok(lifted.r > 40 && lifted.g > 40 && lifted.b > 40, "a dark pick still emits light");

const bright = artGlowColor("#FF4FD8");
assert.equal(bright.r, 255);
assert.equal(bright.b, 216);

const layout = artGlowLayout(8);
assert.ok(layout.halo > layout.core * 4, "the bloom extends past the paint");
assert.ok(layout.step > 0 && layout.step < layout.core);

console.log("art glow checks passed");
