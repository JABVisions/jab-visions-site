import {
  mergeProjectCover,
  persistableProjectCover,
  resolveProjectCover,
  resolveProjectLocation,
  resolveProjectStartDate,
} from "./projectCover";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const cover = resolveProjectCover({
  title: "Those Ryderz AUDITION",
  media: {
    kind: "image",
    src: "",
    bucket: "board-media",
    storagePath: "user-1/project-cover/still.jpg",
  },
});

assert(cover?.bucket === "board-media", "cover should keep the media bucket");
assert(
  cover?.storagePath === "user-1/project-cover/still.jpg",
  "cover should keep the storage path even without a src"
);

const persisted = persistableProjectCover({
  kind: "image",
  src: "data:image/jpeg;base64,abc",
  bucket: "board-media",
  storagePath: "user-1/project-cover/still.jpg",
});
assert(
  persisted?.src === "",
  "data URLs should not be persisted when a storage path exists"
);
assert(persisted?.storagePath === "user-1/project-cover/still.jpg", "storage path should survive persist");

const merged = mergeProjectCover(
  { kind: "image", src: "" },
  {
    kind: "image",
    src: "https://example.supabase.co/storage/v1/object/public/board-media/user-1/still.jpg",
    bucket: "board-media",
    storagePath: "user-1/still.jpg",
  }
);
assert(Boolean(merged?.storagePath), "merge should keep the hosted cover");

assert(
  resolveProjectLocation({
    meta: { location: "Los Angeles" },
    payload: {},
  }) === "Los Angeles",
  "location should resolve from nested meta"
);
assert(
  resolveProjectStartDate({
    startDate: "2026-09-20",
    meta: {},
  }) === "2026-09-20",
  "start date should resolve from the project record"
);

console.log("projectCover tests passed");
