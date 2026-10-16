import assert from "node:assert/strict";
import { mergeBucketBrains, type BucketBrainState } from "./bucketBrainSync";
import type { BucketBrainState as Brain } from "./bucketBrain";

function brain(partial: Partial<Brain>): BucketBrainState {
  return {
    version: 3,
    pass: [],
    pin: [],
    push: [],
    waves: [],
    mutuals: [],
    updatedAt: 1,
    ...partial,
  };
}

const phone = brain({
  updatedAt: 10,
  pin: [{ activityId: "drop-a", savedAt: 10, item: { id: "drop-a", title: "From phone" } }],
  pass: [{ activityId: "drop-b", savedAt: 5 }],
});
const ipad = brain({
  updatedAt: 20,
  pin: [{ activityId: "drop-c", savedAt: 20, item: { id: "drop-c", title: "From iPad" } }],
  pass: [{ activityId: "drop-b", savedAt: 30, waveCount: 2 }],
});

const merged = mergeBucketBrains(phone, ipad);
assert.deepEqual(
  merged.pin.map((entry) => entry.activityId).sort(),
  ["drop-a", "drop-c"]
);
assert.equal(merged.pass.length, 1);
assert.equal(merged.pass[0]?.activityId, "drop-b");
assert.equal(merged.pass[0]?.waveCount, 2);
assert.equal(merged.pin.find((entry) => entry.activityId === "drop-a")?.item?.title, "From phone");
assert.equal(merged.pin.find((entry) => entry.activityId === "drop-c")?.item?.title, "From iPad");

const again = mergeBucketBrains(merged, ipad);
assert.equal(again.pin.length, 2);
assert.equal(again.pass.length, 1);

console.log("bucket brain sync checks passed");
