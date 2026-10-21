import assert from "node:assert/strict";
import { chooseDropStudioV5Layout } from "./dropStudioV5Layout";
import {
  createDropStudioV5Session,
  importAudioClip,
  importVideoClip,
  moveTimedClip,
  reorderClipToIndex,
  setArtClipBounds,
  bindArtOverlay,
  clipPlayableMs,
} from "./dropStudioV5";
import {
  clampTimelineFraction,
  dropIndexForClip,
  nextTimelineZoom,
  PHONE_EDIT_TOOLS,
  stepPlayheadMs,
  TABLET_TIMELINE_FRACTION,
  timelinePxPerMs,
  trimDeltaMs,
  trimEdgeByDelta,
} from "./dropStudioV5Timeline";

assert.equal(PHONE_EDIT_TOOLS.includes("art"), true);
assert.equal(PHONE_EDIT_TOOLS.includes("trim"), true);
assert.equal(PHONE_EDIT_TOOLS.length, 11);

const landscapePhone = chooseDropStudioV5Layout({ width: 844, height: 390, finePointer: false });
assert.equal(landscapePhone, "phone", "a short touch screen stays a phone");
const ipad = chooseDropStudioV5Layout({ width: 1024, height: 768, finePointer: false });
const ipadTurned = chooseDropStudioV5Layout({ width: 768, height: 1024, finePointer: false });
assert.equal(ipad, "tablet");
assert.equal(ipadTurned, "tablet", "rotation keeps the tablet timeline");
assert.equal(
  chooseDropStudioV5Layout({ width: 1100, height: 700, finePointer: true }),
  chooseDropStudioV5Layout({ width: 1100, height: 1400, finePointer: true })
);
assert.equal(chooseDropStudioV5Layout({ width: 1440, height: 900, finePointer: true }), "desktop");
assert.equal(chooseDropStudioV5Layout({ width: 900, height: 600, finePointer: true }), "phone");

assert.equal(TABLET_TIMELINE_FRACTION, 0.3);
assert.ok(clampTimelineFraction(0.3) >= 0.25 && clampTimelineFraction(0.3) <= 0.35);
assert.equal(clampTimelineFraction(0.9), 0.52);
assert.equal(clampTimelineFraction(0.05), 0.18);

assert.equal(nextTimelineZoom(1, 1.1), 1.1);
assert.equal(nextTimelineZoom(4, 2), 4);
assert.ok(Math.abs(timelinePxPerMs(2) - 0.084) < 0.0001);
assert.equal(Math.round(trimDeltaMs(42, 0.042)), 1000);
assert.equal(Math.round(stepPlayheadMs(0, 1)), 33);

const clip = {
  id: "a",
  mediaKey: "primary",
  kind: "video" as const,
  offsetMs: 0,
  trimInMs: 0,
  trimOutMs: 0,
  sourceDurationMs: 4000,
  volume: 1,
};
const trimmedIn = trimEdgeByDelta(clip, "in", 500);
assert.equal(trimmedIn.trimInMs, 500);
const trimmedOut = trimEdgeByDelta(clip, "out", -400);
assert.equal(trimmedOut.trimOutMs, 3600);

const boxes = [
  { id: "a", left: 0, right: 100 },
  { id: "b", left: 100, right: 200 },
];
assert.equal(dropIndexForClip(boxes, "a", 160), 1);
assert.equal(dropIndexForClip(boxes, "b", 20), 0);

let session = createDropStudioV5Session("layout");
session = importVideoClip(session, { mediaKey: "primary", name: "A", kind: "video", sourceDurationMs: 2000 });
session = importVideoClip(session, { mediaKey: "b", name: "B", kind: "video", sourceDurationMs: 1000 });
const second = session.tracks[0].clips[1].id;
session = reorderClipToIndex(session, second, 0);
assert.equal(session.tracks[0].clips[0].name, "B");
assert.equal(session.tracks[0].clips[0].offsetMs, 0);
assert.equal(session.tracks[0].clips[1].offsetMs, 1000);
assert.equal(clipPlayableMs(session.tracks[0].clips[1]), 2000);

session = importAudioClip(session, { mediaKey: "song", name: "Song", kind: "audio", sourceDurationMs: 3000 });
const audioId = session.tracks.find((track) => track.kind === "audio")!.clips[0].id;
session = moveTimedClip(session, audioId, 800);
assert.equal(session.tracks.find((track) => track.kind === "audio")!.clips[0].offsetMs, 800);

const bound = bindArtOverlay(session, "paint");
session = bound.session;
session = setArtClipBounds(session, bound.clipId, 1000, 2500);
const before = clipPlayableMs(session.tracks.find((track) => track.kind === "art")!.clips[0]);
session = moveTimedClip(session, bound.clipId, 400);
const art = session.tracks.find((track) => track.kind === "art")!.clips[0];
assert.equal(art.offsetMs, 1400);
assert.equal(clipPlayableMs(art), before, "moving art keeps its duration");

console.log("drop studio v5 timeline checks passed");
