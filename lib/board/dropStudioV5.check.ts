import assert from "node:assert/strict";
import { buildExportPlan, canvasFilterFor, exportNeedsFlatten, exportPixelSize } from "./dropStudioV5Export";
import {
  canPersistDropStudioV5Media,
  dropStudioV5MediaId,
  DROP_STUDIO_V5_MEDIA_MAX_BYTES,
} from "./dropStudioV5Media";
import {
  aspectToMediaFrame,
  clipPlayableMs,
  createDropStudioV5History,
  createDropStudioV5Session,
  cropToClipPath,
  deleteClip,
  handoffPlayheadMs,
  importAudioClip,
  importVideoClip,
  insetV5Crop,
  MAX_V5_VIDEO_CLIPS,
  mediaKeyFromFile,
  monitorAspectRatio,
  parseDropStudioV5Snapshot,
  previewAudioAtPlayhead,
  previewVideoAtPlayhead,
  pushV5History,
  readDropStudioV5Flag,
  reorderClip,
  sessionDurationMs,
  setClipCrop,
  setClipDuration,
  setClipFilter,
  setPlayhead,
  setSessionAspect,
  snapshotDropStudioV5,
  splitClipAtPlayhead,
  trimClip,
  undoV5,
} from "./dropStudioV5";

assert.equal(readDropStudioV5Flag("studio=v4"), false, "query v4 disables the flag");
assert.equal(readDropStudioV5Flag("?studio=v5"), true, "query v5 enables the flag");
assert.equal(readDropStudioV5Flag(""), true, "V5 is on by default");
assert.equal(readDropStudioV5Flag("foo=1"), true, "unrelated query keeps the default");

const file = { name: "tape.mp4", size: 12, lastModified: 99 };
assert.equal(mediaKeyFromFile(file), "tape.mp4:12:99");

let session = createDropStudioV5Session("sess-1");
assert.equal(session.version, 5);
assert.equal(session.tracks.length, 2);
assert.equal(session.tracks[0].kind, "video");
assert.equal(session.tracks[1].kind, "audio");

session = importVideoClip(session, {
  mediaKey: "primary",
  name: "Clip 1",
  kind: "video",
  sourceDurationMs: 4000,
});
session = setClipDuration(session, session.tracks[0].clips[0].id, 4000);
assert.equal(clipPlayableMs(session.tracks[0].clips[0]), 4000);
assert.equal(sessionDurationMs(session), 4000);

session = importVideoClip(session, {
  mediaKey: "b-roll",
  name: "Clip 2",
  kind: "video",
  sourceDurationMs: 2000,
});
assert.equal(session.tracks[0].clips.length, 2);
assert.equal(session.tracks[0].clips[1].offsetMs, 4000);
assert.equal(sessionDurationMs(session), 6000);

const firstId = session.tracks[0].clips[0].id;
session = trimClip(session, firstId, 500, 3000);
assert.equal(clipPlayableMs(session.tracks[0].clips[0]), 2500);

session = setPlayhead(session, 1200);
session = splitClipAtPlayhead(session, firstId);
assert.equal(session.tracks[0].clips.length, 3, "split adds a right-hand clip");
assert.equal(session.tracks[0].clips[0].trimInMs, 500);
assert.ok(session.tracks[0].clips[1].trimInMs > 500, "right clip starts after the split");

const beforeReorder = session.tracks[0].clips.map((clip) => clip.id);
session = reorderClip(session, session.tracks[0].clips[0].id, 1);
const afterReorder = session.tracks[0].clips.map((clip) => clip.id);
assert.notDeepEqual(beforeReorder, afterReorder, "reorder swaps packed order");
assert.equal(session.tracks[0].clips[0].id, beforeReorder[1], "clip moves right by one slot");
assert.equal(session.tracks[0].clips[0].offsetMs, 0, "packed clips start at 0");

session = setSessionAspect(session, "story");
assert.equal(session.aspect, "story");
assert.equal(aspectToMediaFrame("story"), "portrait");
assert.equal(aspectToMediaFrame("landscape"), "landscape");

const clipId = session.tracks[0].clips[0].id;
session = setClipCrop(session, clipId, insetV5Crop(0.1));
assert.equal(session.tracks[0].clips[0].crop?.w, 0.8);
assert.equal(cropToClipPath(session.tracks[0].clips[0].crop), "inset(10% 10% 10% 10%)");
assert.equal(cropToClipPath(undefined), undefined);

session = setClipFilter(session, clipId, "night-glass", "film-grain");
assert.equal(session.tracks[0].clips[0].filter, "night-glass");
assert.equal(session.tracks[0].clips[0].overlay, "film-grain");

session = importAudioClip(session, {
  mediaKey: "voice",
  name: "VO",
  kind: "audio",
  sourceDurationMs: 1500,
});
assert.equal(session.tracks[1].clips.length, 1);

session = setPlayhead(session, 200);
const videoPreview = previewVideoAtPlayhead(session);
assert.ok(videoPreview, "playhead should resolve one video clip");
assert.equal(
  session.tracks[0].clips.filter((clip) => clip.mediaKey === videoPreview?.clip.mediaKey).length >= 1,
  true
);
const audioPreview = previewAudioAtPlayhead(session);
assert.ok(audioPreview, "audio clip at 200ms should be active");
assert.equal(audioPreview?.clip.mediaKey, "voice");

const snapshot = snapshotDropStudioV5(session);
assert.equal(JSON.stringify(snapshot).includes("[object File]"), false);
assert.equal("file" in snapshot.tracks[0].clips[0], false);
const parsed = parseDropStudioV5Snapshot(snapshot);
assert.ok(parsed);
assert.equal(parsed?.id, "sess-1");
assert.equal(parsed?.tracks[0].clips.length, session.tracks[0].clips.length);

let history = createDropStudioV5History();
history = pushV5History(history, session);
const deleted = deleteClip(session, session.tracks[1].clips[0].id);
assert.equal(deleted.tracks[1].clips.length, 0);
const undone = undoV5(history, deleted);
assert.equal(undone.session.tracks[1].clips.length, 1, "undo restores the audio clip");

const atStart = splitClipAtPlayhead(setPlayhead(session, 0), session.tracks[0].clips[0].id);
assert.equal(
  atStart.tracks[0].clips.length,
  session.tracks[0].clips.length,
  "split at the clip edge is a no-op"
);

let capped = createDropStudioV5Session("cap");
for (let i = 0; i < MAX_V5_VIDEO_CLIPS + 3; i += 1) {
  capped = importVideoClip(capped, {
    mediaKey: `clip-${i}`,
    kind: "video",
    sourceDurationMs: 1000,
  });
}
assert.equal(capped.tracks[0].clips.length, MAX_V5_VIDEO_CLIPS, "import respects the clip cap");

assert.equal(parseDropStudioV5Snapshot({ version: 4, id: "nope" }), null);
assert.equal(parseDropStudioV5Snapshot(null), null);

const endedSession = setPlayhead(capped, sessionDurationMs(capped));
const endedPreview = previewVideoAtPlayhead(endedSession);
assert.equal(endedPreview?.ended, true, "the end of the timeline stays on the last clip");
assert.equal(endedPreview?.clip.mediaKey, `clip-${MAX_V5_VIDEO_CLIPS - 1}`);

const handoffClip = capped.tracks[0].clips[0];
assert.equal(handoffPlayheadMs(handoffClip, 200), null, "mid-clip playback does not hand off");
assert.equal(
  handoffPlayheadMs({ ...handoffClip, sourceDurationMs: 1000, trimInMs: 0, trimOutMs: 0, offsetMs: 0 }, 980),
  1000
);

assert.equal(monitorAspectRatio("story"), 9 / 16);
assert.equal(monitorAspectRatio("square"), 1);
assert.equal(monitorAspectRatio("landscape"), 16 / 9);

assert.equal(canPersistDropStudioV5Media(1024), true);
assert.equal(canPersistDropStudioV5Media(DROP_STUDIO_V5_MEDIA_MAX_BYTES + 1), false);
assert.equal(dropStudioV5MediaId("draft", "tape.mp4:1:2"), "draft::tape.mp4:1:2");

const plain = importVideoClip(createDropStudioV5Session("plain"), {
  mediaKey: "primary",
  kind: "video",
  sourceDurationMs: 2000,
});
assert.equal(exportNeedsFlatten(plain), false, "an untouched tape stays on the V4 publish path");
const trimmedExport = trimClip(plain, plain.tracks[0].clips[0].id, 200, 1500);
assert.equal(exportNeedsFlatten(trimmedExport), true);
const story = setSessionAspect(plain, "story");
assert.equal(exportNeedsFlatten(story), true);
const withAudio = importAudioClip(plain, {
  mediaKey: "bed",
  kind: "audio",
  sourceDurationMs: 2000,
});
assert.equal(exportNeedsFlatten(withAudio), true);
const plan = buildExportPlan(trimmedExport);
assert.equal(plan.video.length, 1);
assert.equal(plan.video[0].trimInMs, 200);
assert.equal(plan.video[0].playableMs, 1300);
assert.equal(exportPixelSize("story").width, 540);
assert.equal(exportPixelSize("story").height, 960);
assert.equal(canvasFilterFor("clean-enhance").includes("contrast"), true);
assert.equal(canvasFilterFor(null), "none");

console.log("drop studio v5 checks passed");
