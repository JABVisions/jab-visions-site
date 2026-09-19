import { BOARD_PROJECT_MEDIA_BUCKET } from "./projectCover";
import { parseCoverUploadResponse } from "./projectCoverUpload";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const parsed = parseCoverUploadResponse({
  ok: true,
  bucket: "board-media",
  storagePath: "user-1/project-cover/still.jpg",
  image_url: "https://example.supabase.co/storage/v1/object/sign/board-media/still.jpg",
});

assert(parsed?.bucket === BOARD_PROJECT_MEDIA_BUCKET, "cover upload should keep the media bucket");
assert(
  parsed?.storagePath === "user-1/project-cover/still.jpg",
  "cover upload should keep the storage path"
);
assert(parsed?.imageUrl.includes("still.jpg"), "cover upload should keep the signed URL");

assert(parseCoverUploadResponse({ ok: false, storagePath: "x" }) === null, "failed uploads should not parse");
assert(parseCoverUploadResponse({ ok: true }) === null, "missing path should not parse");
assert(
  parseCoverUploadResponse({
    ok: true,
    image_path: "user-1/cover.jpg",
  })?.storagePath === "user-1/cover.jpg",
  "image_path alias should parse"
);

console.log("projectCoverUpload.check.ts ok");
