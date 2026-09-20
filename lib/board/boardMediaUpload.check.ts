import { BUCKET_MEDIA } from "./dropItem";
import {
  explainBoardMediaUploadError,
  parseBoardMediaUploadResponse,
  shouldSkipServerlessMediaUpload,
  shouldUseTusUpload,
} from "./boardMediaUpload";
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
  shouldUseTusUpload({ size: 80 * 1024 * 1024, type: "video/mp4" }),
  "audition tapes use tus"
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
  explainBoardMediaUploadError(new Error("Payload too large")).includes("larger than Board storage"),
  "bucket size failures mention size"
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

console.log("boardMediaUpload.check.ts ok");

