import {
  UPLOAD_PROGRESS_THROTTLE_MS,
  createUploadProgressReporter,
  createUploadProgressTracker,
  formatUploadBytes,
  formatUploadEta,
  makeUploadProgress,
  preparingUploadProgress,
  studioVisibleUploadProgress,
  type BoardUploadProgress,
} from "./uploadProgress";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(formatUploadEta(null) === "Calculating time left…", "unknown ETA copy");
assert(formatUploadEta(Number.NaN, 10, 100) === "Calculating time left…", "NaN ETA copy");
assert(formatUploadEta(12_000) === "About 12s left", "12s ETA copy");
assert(formatUploadEta(11_600) === "About 12s left", "ETA seconds round to 12s");
assert(formatUploadEta(120_000) === "About 2 min left", "2 min ETA copy");
assert(formatUploadEta(90_000) === "About 2 min left", "90s rounds to 2 min");
assert(formatUploadEta(60_000) === "About 1 min left", "1 min ETA copy");
assert(formatUploadEta(800, 99, 100) === "Almost done", "sub-second remaining is almost done");
assert(formatUploadEta(4_000, 100, 100) === "Almost done", "completed upload is almost done");

const mid = makeUploadProgress(32 * 1024 * 1024, 64 * 1024 * 1024, 2 * 1024 * 1024);
assert(mid.percent === 50, "percent is loaded/total");
assert(mid.etaMs === 16_000, "ETA uses remaining bytes / speed");
assert(mid.label === "About 16s left", "progress label uses ETA copy");

const zero = makeUploadProgress(0, 0, 0);
assert(zero.percent === 0, "zero-size files stay at 0%");
assert(zero.etaMs === null, "zero-size files have no ETA");
assert(zero.label === "Preparing upload…", "zero-size files keep the preparing label");

const preparing = preparingUploadProgress(80 * 1024 * 1024);
assert(preparing.percent === 0, "preparing starts at 0%");
assert(preparing.loaded === 0, "preparing has sent 0 bytes");
assert(preparing.total === 80 * 1024 * 1024, "preparing keeps the known total");
assert(preparing.label === "Preparing upload…", "preparing copy");

assert(
  studioVisibleUploadProgress({
    processing: true,
    isVideo: true,
    progress: null,
    totalBytes: 62 * 1024 * 1024,
  })?.label === "Preparing upload…",
  "Video Tools show a 0% preparing bar as soon as save starts"
);
assert(
  studioVisibleUploadProgress({
    processing: true,
    isVideo: true,
    progress: mid,
  })?.percent === 50,
  "live byte ticks replace the preparing placeholder"
);
assert(
  studioVisibleUploadProgress({
    processing: false,
    isVideo: true,
    progress: null,
  }) === null,
  "idle studio does not show a fake bar"
);

assert(formatUploadBytes(0, 0) === "Waiting…", "unknown totals wait");
assert(formatUploadBytes(1024, 0).endsWith("KB"), "loaded-only still formats");
assert(formatUploadBytes(5 * 1024 * 1024, 10 * 1024 * 1024) === "5.0MB / 10MB", "bytes sent/total");

const events: BoardUploadProgress[] = [];
const reporter = createUploadProgressReporter((progress) => {
  if (progress) events.push(progress);
}, 80);
reporter.preparing(1000);
reporter.emit(10, 1000);
reporter.emit(20, 1000);
reporter.emit(30, 1000);
assert(events.length === 2, "rapid emits are throttled");
assert(events[0]?.label === "Preparing upload…", "first emit is preparing");
assert(events[1]?.loaded === 10, "throttled reporter keeps the first byte tick");

reporter.complete(1000);
assert(events.at(-1)?.percent === 100, "complete always emits 100%");
assert(events.at(-1)?.label === "Almost done", "complete uses almost-done copy");
assert(UPLOAD_PROGRESS_THROTTLE_MS >= 80 && UPLOAD_PROGRESS_THROTTLE_MS <= 100, "UI throttle is ~80–100ms");

const tracked: BoardUploadProgress[] = [];
const tracker = createUploadProgressTracker(1000, (progress) => {
  if (progress) tracked.push(progress);
});
tracker.preparing();
assert(tracked[0]?.label === "Preparing upload…", "tracker starts in preparing");
tracker.bytes(1000, 1000);
tracker.finishing();
assert(tracked.at(-1)?.percent === 100, "tracker finishing is 100%");

console.log("uploadProgress.check.ts ok");
