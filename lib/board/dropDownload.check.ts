import {
  buildDropDownloadFilename,
  classifyDropDownload,
  openOrDownloadUrl,
  resolveDropDownloadExtension,
} from "./dropDownload";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  classifyDropDownload({
    mediaKind: "video",
    href: "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-media/tape.mp4?token=1",
  }) === "video",
  "room video Drops download as video"
);
assert(
  classifyDropDownload({
    mediaKind: "image",
    href: "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-media/still.jpg?token=1",
  }) === "image",
  "room photo Drops download as image"
);
assert(
  resolveDropDownloadExtension({
    kind: "video",
    url: "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-media/tape.mov?token=1",
  }) === "mov",
  "iPhone tapes keep the .mov extension"
);
assert(
  buildDropDownloadFilename({
    title: "Those Ryderz — Audition tape",
    creator: "Zoe",
    extension: "mp4",
  }).includes("audition"),
  "download filename is Drop-like"
);
assert(typeof openOrDownloadUrl === "function", "iOS download helper is exported");

console.log("dropDownload.check.ts ok");
