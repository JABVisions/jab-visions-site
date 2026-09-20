import { BUCKET_MEDIA } from "./dropItem";
import {
  explainBoardMediaUploadError,
  isStoragePayloadTooLargeError,
  parseBoardMediaUploadResponse,
  prefersDirectStorageUpload,
  shouldSkipServerlessMediaUpload,
  shouldUseTusUpload,
  bytesUploadFinished,
  playbackResultAfterUpload,
  preferredCommitPlaybackUrl,
  canCommitBoardMediaPlayback,
  progressBytesUntilVerified,
  requestSignedPlaybackUrl,
  SIGNED_PLAYBACK_TIMEOUT_MS,
  START_UPLOAD_STALL_MS,
  acceptXhrOutcome,
  isMissingObjectUploadError,
  BoardMediaUploadError,
  type BoardMediaUploadOptions,
} from "./boardMediaUpload";
import { isMissingStorageObjectError, isPublicBoardStorageUrl } from "./signedMediaUrl";
import { ownerScopedUploadFolder } from "./uploadLimits";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const parsed = parseBoardMediaUploadResponse({
  ok: true,
  bucket: "board-media",
  storagePath: "uploads/user-1/still.jpg",
  publicUrl: "https://example.supabase.co/storage/v1/object/public/board-media/uploads/user-1/still.jpg",
  signedUrl: "https://example.supabase.co/storage/v1/object/sign/board-media/still.jpg",
});

assert(parsed?.bucket === BUCKET_MEDIA, "media upload should keep the media bucket");
assert(parsed?.storagePath === "uploads/user-1/still.jpg", "media upload should keep the storage path");
assert(parsed?.signedUrl.includes("still.jpg"), "media upload should keep the signed URL");
assert(parseBoardMediaUploadResponse({ ok: false, storagePath: "x" }) === null, "failed uploads should not parse");
assert(parseBoardMediaUploadResponse({ ok: true }) === null, "missing path should not parse");

assert(
  ownerScopedUploadFolder("project-media", "user-abc") === "user-abc/project-media",
  "project room videos must land in the owner folder so storage RLS allows the write"
);
assert(
  ownerScopedUploadFolder("uploads/user-abc", "user-abc") === "uploads/user-abc",
  "Drop Console folders already scoped to the user stay as-is"
);
assert(
  ownerScopedUploadFolder("user-abc/project-media", "user-abc") === "user-abc/project-media",
  "already-owned folders are not double-prefixed"
);

assert(
  shouldSkipServerlessMediaUpload({ size: 0, type: "video/mp4", name: "tape.mp4" }),
  "iPhone files that report size 0 must not POST through Vercel"
);
assert(
  shouldSkipServerlessMediaUpload({ size: 2 * 1024 * 1024, type: "video/mp4", name: "clip.mp4" }),
  "videos skip the 4.5MB serverless cap even when they look small"
);
assert(
  shouldUseTusUpload({ size: 0, name: "IMG_1234.MOV" }),
  "unknown-size camera-roll tapes use tus"
);
assert(
  prefersDirectStorageUpload({ size: 64.9 * 1024 * 1024, type: "video/mp4", name: "IMG_1234.MOV" }),
  "64.9MB iPhone tapes use Drop Tile's direct PUT, not tus"
);
assert(
  !shouldUseTusUpload({ size: 64.9 * 1024 * 1024, type: "video/mp4", name: "IMG_1234.MOV" }),
  "64.9MB tapes must not start on iPhone tus"
);
assert(
  !shouldUseTusUpload({ size: 80 * 1024 * 1024, type: "video/mp4" }),
  "80MB Work Board files stay on a single storage PUT"
);
assert(
  shouldUseTusUpload({ size: 120 * 1024 * 1024, type: "video/mp4" }),
  "files over 96MB still use resumable tus first"
);

assert(
  explainBoardMediaUploadError(new Error("upload failed")) === "Couldn't upload that video. Try again.",
  "generic upload-failed is not blamed on connection"
);
assert(
  explainBoardMediaUploadError(new Error("new row violates row-level security policy")).includes("Sign in"),
  "RLS failures ask for sign-in, not connection"
);
assert(
  isStoragePayloadTooLargeError(
    new Error('tus: unexpected response (method: POST, response code: 413, response text: Payload too large)')
  ),
  "tus 413 payload errors are storage size-limit failures"
);
assert(
  !isStoragePayloadTooLargeError(
    new Error(
      "tus: unexpected response (method: POST, url: https://example.supabase.co/storage/v1/object/sign/board-media/u/project-media/1-abc413def.mp4)"
    )
  ),
  "a 413 substring in a storage path is not a size limit"
);
assert(
  explainBoardMediaUploadError(new Error("Payload too large"), { size: 64.9 * 1024 * 1024 }).includes(
    "Board storage"
  ) &&
    !explainBoardMediaUploadError(new Error("Payload too large"), { size: 64.9 * 1024 * 1024 }).includes(
      "shorter take"
    ),
  "64.9MB is not over the 4GB app cap and must not ask for a shorter take"
);
assert(
  explainBoardMediaUploadError(new Error("Payload too large"), {
    size: 5 * 1024 * 1024 * 1024,
    type: "video/mp4",
  }).includes("4.0GB"),
  "size copy is only for files actually over the 4GB app limit"
);
assert(
  explainBoardMediaUploadError(new Error("Failed to fetch")).includes("connection"),
  "real network failures may still mention connection"
);
assert(
  explainBoardMediaUploadError(new Error("tus: unexpected response (method: POST, response code: 403)")).includes(
    "Sign in"
  ),
  "tus 403 is sign-in, not connection"
);
assert(
  !explainBoardMediaUploadError(new Error("new row violates row-level security policy")).includes("connection"),
  "RLS is never reported as a connection problem"
);

const options: BoardMediaUploadOptions = { folder: "project-media" };
assert(options.folder === "project-media", "upload options keep the folder");
assert(typeof options.onProgress === "undefined", "progress callback stays optional");

assert(bytesUploadFinished(62 * 1024 * 1024, 62 * 1024 * 1024), "100% bytes are finished");
assert(!bytesUploadFinished(10, 62 * 1024 * 1024), "partial bytes are not finished");
assert(
  acceptXhrOutcome({ kind: "error", status: 0, loaded: 62 * 1024 * 1024, total: 62 * 1024 * 1024 }) ===
    "unverified",
  "iPhone onerror after 100% must not restart the PUT, and must not count as a written object"
);
assert(
  acceptXhrOutcome({ kind: "load", status: 0, loaded: 62 * 1024 * 1024, total: 62 * 1024 * 1024 }) ===
    "unverified",
  "iPhone onload status 0 after 100% is unverified until createSignedUrl"
);
assert(
  acceptXhrOutcome({ kind: "abort", status: 0, loaded: 62 * 1024 * 1024, total: 62 * 1024 * 1024 }) ===
    "unverified",
  "abort after 100% is unverified, not a committed Drop"
);
assert(
  acceptXhrOutcome({ kind: "load", status: 200, loaded: 62 * 1024 * 1024, total: 62 * 1024 * 1024 }) ===
    "success",
  "HTTP 200 at 100% is a verified write"
);
assert(
  acceptXhrOutcome({ kind: "error", status: 0, loaded: 10, total: 62 * 1024 * 1024 }) === "failure",
  "onerror before 100% is still a failure"
);
assert(
  acceptXhrOutcome({ kind: "load", status: 413, loaded: 62 * 1024 * 1024, total: 62 * 1024 * 1024 }) ===
    "failure",
  "413 after bytes still fails so the limit-raise retry can run"
);
assert(
  progressBytesUntilVerified(62 * 1024 * 1024, 62 * 1024 * 1024, false).percent === 99,
  "progress stays under 100% until the object is signed"
);
assert(
  progressBytesUntilVerified(Math.floor(0.995 * 62 * 1024 * 1024), 62 * 1024 * 1024, false)
    .percent === 99,
  "99.5% bytes must not round to 100% or studio treats success as Board-did-not-close"
);
assert(
  progressBytesUntilVerified(62 * 1024 * 1024, 62 * 1024 * 1024, true).percent === 100,
  "verified objects can close at 100%"
);
let missingPlayback = false;
try {
  playbackResultAfterUpload({
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
    publicUrl: "https://cdn.example/tape.mp4",
    signedUrl: "",
  });
} catch (error) {
  missingPlayback = isMissingObjectUploadError(error);
}
assert(missingPlayback, "a public URL is not enough to commit a private-bucket video");
assert(
  !canCommitBoardMediaPlayback({ signedUrl: "" }),
  "unsigned playback cannot be saved as a room Drop"
);
assert(
  preferredCommitPlaybackUrl({
    signedUrl: "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=1",
    publicUrl: "https://example.supabase.co/storage/v1/object/public/board-media/tape.mp4",
  }).includes("/object/sign/"),
  "commit prefers the signed playback URL over a public 403 URL"
);
assert(
  preferredCommitPlaybackUrl({
    signedUrl: "",
    publicUrl: "https://example.supabase.co/storage/v1/object/public/board-media/tape.mp4",
  }) === "",
  "commit must not fall back to a public 403 URL"
);
assert(
  !isPublicBoardStorageUrl(
    "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=1"
  ),
  "signed storage URLs are not treated as public"
);
assert(
  isPublicBoardStorageUrl(
    "https://example.supabase.co/storage/v1/object/public/board-media/tape.mp4"
  ),
  "public storage URLs are detected so video src can refuse them"
);
assert(
  isMissingStorageObjectError({ statusCode: "404", message: "Object not found" }),
  "404 on createSignedUrl is a missing object"
);
assert(
  isMissingStorageObjectError({ statusCode: 400, message: "InvalidKey" }),
  "400 on createSignedUrl is a missing object"
);
assert(
  SIGNED_PLAYBACK_TIMEOUT_MS >= 4_000,
  "signing after PUT must wait ~4s, not skip createSignedUrl"
);
assert(
  START_UPLOAD_STALL_MS <= 25_000 && START_UPLOAD_STALL_MS >= 15_000,
  "session/signed-URL/XHR must fail within ~25s if no first byte"
);
assert(
  explainBoardMediaUploadError(
    new BoardMediaUploadError("This video didn't finish saving to Board storage. Try uploading it again.", "missing")
  ).includes("didn't finish saving"),
  "missing objects surface the studio retry copy"
);
let noUrlPlayback = false;
try {
  playbackResultAfterUpload({
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  });
} catch {
  noUrlPlayback = true;
}
assert(noUrlPlayback, "playback helper still fails when no URL exists");

void (async () => {
  const signed = await requestSignedPlaybackUrl(async () => ({
    signedUrl: "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=1",
  }));
  assert(signed.signedUrl.includes("/object/sign/"), "sign helper returns the signed URL");
  assert(!signed.missing, "successful sign is not missing");

  const missing = await requestSignedPlaybackUrl(
    async () => ({ error: { statusCode: 404, message: "Object not found" } }),
    { timeoutMs: 800, retries: 0 }
  );
  assert(missing.missing && !missing.signedUrl, "404 on sign is missing, not a thrown upload error");

  const timed = await requestSignedPlaybackUrl(
    () => new Promise(() => {}),
    { timeoutMs: 60, retries: 0 }
  );
  assert(!timed.signedUrl, "sign timeout must not throw after a finished PUT");

  console.log("boardMediaUpload.check.ts ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

