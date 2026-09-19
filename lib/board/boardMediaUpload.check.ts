import { BUCKET_MEDIA } from "./dropItem";
import { parseBoardMediaUploadResponse } from "./boardMediaUpload";

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

console.log("boardMediaUpload.check.ts ok");
