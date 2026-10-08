import assert from "node:assert/strict";
import { chooseDropStudioV5Layout } from "./dropStudioV5Layout";
import { gradeToFilter, motionAt, presetGrade } from "./dropStudioV5Grade";

const cinematic = presetGrade("cinematic", 1);
assert.ok(cinematic);
assert.ok((cinematic?.vignette ?? 0) > 0.4);
assert.equal(presetGrade("cinematic", 0), undefined);
const half = presetGrade("warm", 0.5);
assert.ok(half);
assert.ok(Math.abs((half?.temperature ?? 0) - 0.35) < 0.001);

const filter = gradeToFilter(presetGrade("mono", 1));
assert.equal(filter.includes("saturate(0.000)"), true);
assert.equal(gradeToFilter(undefined), "none");

const flash = motionAt("flash", 40, 2000);
assert.ok(flash.flash > 0.5);
assert.equal(motionAt("blur", 1000, 2000).filter, "none");
assert.equal(motionAt("blur", 40, 2000).filter.includes("blur"), true);

assert.equal(chooseDropStudioV5Layout({ width: 390, height: 800, finePointer: false }), "phone");
assert.equal(chooseDropStudioV5Layout({ width: 700, height: 800, finePointer: true }), "phone");
assert.equal(chooseDropStudioV5Layout({ width: 1024, height: 768, finePointer: false }), "tablet");
assert.equal(chooseDropStudioV5Layout({ width: 1366, height: 1024, finePointer: false }), "tablet");
assert.equal(chooseDropStudioV5Layout({ width: 1440, height: 900, finePointer: true }), "desktop");
assert.equal(chooseDropStudioV5Layout({ width: 1000, height: 800, finePointer: true }), "tablet");

console.log("drop studio v5 grade checks passed");
