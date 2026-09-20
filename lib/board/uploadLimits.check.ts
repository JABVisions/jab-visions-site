import {
  UPLOAD_LIMITS,
  SERVERLESS_UPLOAD_BODY_LIMIT,
  TUS_UPLOAD_THRESHOLD,
  DIRECT_STORAGE_UPLOAD_MAX_BYTES,
  checkUploadSize,
  formatBytes,
  studioMediaKindForFile,
  uploadKindForFile,
  uploadTimeoutMsForBytes,
  studioCompleteTimeoutMs,
  STUDIO_BYTES_DONE_UNSTICK_MS,
  STUDIO_BYTES_DONE_CLOSE_MESSAGE,
  isStudioBytesDoneCloseMessage,
  studioBytesDoneUnstickAction,
  resolveUploadContentType,
  storageExtensionForFile,
} from "./uploadLimits";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(UPLOAD_LIMITS.image === 25 * 1024 * 1024, "images stay at a reasonable 25MB");
assert(UPLOAD_LIMITS.video === 4 * 1024 * 1024 * 1024, "videos allow 4GB audition tapes");
assert(UPLOAD_LIMITS.audio === 250 * 1024 * 1024, "audio stays under a half-gig");
assert(SERVERLESS_UPLOAD_BODY_LIMIT === 4 * 1024 * 1024, "serverless body skip is 4MB");
assert(TUS_UPLOAD_THRESHOLD === 6 * 1024 * 1024, "tus kicks in at 6MB");
assert(
  DIRECT_STORAGE_UPLOAD_MAX_BYTES === 96 * 1024 * 1024,
  "known-size files under 96MB skip iPhone tus"
);

assert(checkUploadSize({ size: 20 * 1024 * 1024, type: "image/jpeg" }) === null, "20MB photo is allowed");
assert(
  checkUploadSize({ size: 30 * 1024 * 1024, type: "image/jpeg" })?.includes("25MB"),
  "oversized photos still get a clear error"
);
assert(
  checkUploadSize({ size: 2 * 1024 * 1024 * 1024, type: "video/mp4", name: "audition.mp4" }) === null,
  "2GB audition tape is allowed"
);
assert(
  checkUploadSize({ size: 5 * 1024 * 1024 * 1024, type: "video/mp4", name: "audition.mp4" })?.includes("4.0GB"),
  "videos over 4GB are rejected with the real cap, not a tiny clip limit"
);
assert(
  checkUploadSize({ size: 200 * 1024 * 1024, type: "", name: "take.mov" }) === null,
  "iOS .mov files with empty MIME use the video cap"
);
assert(
  checkUploadSize({ size: 64.9 * 1024 * 1024, type: "video/mp4", name: "audition.mp4" }) === null,
  "64.9MB Project Room tapes are under the 4GB app cap"
);
assert(
  checkUploadSize({ size: 0, type: "video/mp4", name: "tape.mp4" }) === null,
  "iPhone files that report size 0 are not treated as over-limit"
);
assert(
  checkUploadSize({ type: "video/mp4", name: "tape.mp4" }) === null,
  "missing File.size is not treated as over-limit"
);

assert(uploadKindForFile({ type: "", name: "tape.MOV" }) === "video", "empty MIME + .mov is video");
assert(studioMediaKindForFile({ type: "", name: "tape.MOV" }) === "video", "studio treats .mov as video");
assert(studioMediaKindForFile({ type: "video/mp4", name: "clip.bin" }) === "video", "video MIME wins");
assert(studioMediaKindForFile({ type: "", name: "still.jpg" }) === "image", "jpg stays image");
assert(resolveUploadContentType({ type: "", name: "tape.mov" }) === "video/quicktime", "mov gets a playable type");
assert(
  resolveUploadContentType({ type: "video/mp4", name: "" }) === "video/mp4",
  "named-less MediaRecorder blobs keep a playable video type"
);
assert(
  resolveUploadContentType({ type: "", name: "blob" }) === "video/mp4",
  "iPhone empty MIME + blob name must be video/mp4 so Safari will play"
);
assert(
  resolveUploadContentType({ type: "", name: "" }) === "video/mp4",
  "iPhone camera-roll VIDEO with empty MIME and empty name is video/mp4"
);
assert(
  resolveUploadContentType({ type: "application/octet-stream", name: "IMG_1234.MOV" }) ===
    "video/quicktime",
  "octet-stream iPhone .MOV still uploads as quicktime"
);
assert(storageExtensionForFile({ type: "", name: "blob" }) === "mp4", "empty MIME blob keys as .mp4");
assert(storageExtensionForFile({ type: "", name: "tape.MOV" }) === "mov", "MOV keeps its extension");

assert(formatBytes(UPLOAD_LIMITS.video) === "4.0GB", "4GB formats as GB");
assert(formatBytes(25 * 1024 * 1024) === "25MB", "25MB formats as MB");

assert(uploadTimeoutMsForBytes(1024 * 1024) === 180_000, "tiny files still get a 3-minute floor");
assert(uploadTimeoutMsForBytes(600 * 1024 * 1024) === 20 * 60_000, "600MB gets 20 minutes");
assert(uploadTimeoutMsForBytes(4 * 1024 * 1024 * 1024) === 60 * 60_000, "4GB is capped at 60 minutes");
assert(
  studioCompleteTimeoutMs(80 * 1024 * 1024) > 20_000,
  "Project Room video complete must outlive the old 20s Drafts timeout"
);
assert(
  studioCompleteTimeoutMs(4 * 1024 * 1024 * 1024) === 60 * 60_000 + 15_000,
  "4GB audition tapes get the full upload budget plus a close buffer"
);
assert(
  studioCompleteTimeoutMs(0) > 20 * 60_000,
  "iPhone files that report size 0 still get a long studio complete window"
);

assert(
  STUDIO_BYTES_DONE_UNSTICK_MS <= 8_000 && STUDIO_BYTES_DONE_UNSTICK_MS >= 3_000,
  "after 100%, studio unsticks in seconds, not the full upload budget"
);
assert(
  studioBytesDoneUnstickAction() === "wait",
  "bytes-done unstick must keep waiting for the room Drop commit, not close on 100% bytes"
);
assert(
  isStudioBytesDoneCloseMessage(STUDIO_BYTES_DONE_CLOSE_MESSAGE),
  "legacy overlay copy is recognized so studio can refuse to treat it as a failure"
);
assert(
  !isStudioBytesDoneCloseMessage("This video didn't finish saving to Board storage. Try uploading it again."),
  "real storage failures stay failures"
);

console.log("uploadLimits.check.ts ok");
