import {
  activityLooksLikeStoredVideo,
  activityMediaCoords,
  activityPosterLookup,
  feedShouldEmbedRawHref,
  feedShouldShowStorageLinkCover,
  playableFeedMediaSrc,
  playablePosterSrc,
  preferFeedMediaUrl,
} from "./feedDropMedia";
import { resolveStoredMediaCoords } from "./musicPlayback";
import { dropDirectMediaUrl, resolveDropPlaybackSrc } from "./dropDisplay";
import { dedupeActivity } from "./feedActivity";
import type { BoardActivity } from "./activity";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const publicUrl =
  "https://ywvzwtpy.supabase.co/storage/v1/object/public/board-media/user/project-media/tape.mp4";
const signedUrl =
  "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/project-media/tape.mp4?token=abc";

assert(!playableFeedMediaSrc(publicUrl), "feed video must not use a public board-media URL");
assert(
  playableFeedMediaSrc(signedUrl) === signedUrl,
  "feed video may use a signed board-media URL"
);
assert(
  preferFeedMediaUrl(publicUrl, signedUrl) === signedUrl,
  "signed playback wins over a public 403 URL"
);

const coordsFromPublic = resolveStoredMediaCoords({
  bucket: "board-media",
  storagePath: publicUrl,
});
assert(
  coordsFromPublic?.storagePath === "user/project-media/tape.mp4",
  "storagePath that is a public URL still resolves for createSignedUrl"
);

const hrefOnly = activityMediaCoords({
  href: publicUrl,
  meta: { mediaKind: "video", origin: "project_room" },
});
assert(
  hrefOnly?.bucket === "board-media" && hrefOnly.storagePath.includes("project-media/tape.mp4"),
  "feed can recover coords from a public href"
);

const roomItem = {
  href: publicUrl,
  meta: {
    origin: "project_room",
    cardStyle: "project_room_drop",
    mediaKind: "video",
    bucket: "board-media",
    storagePath: publicUrl,
  },
};
assert(activityLooksLikeStoredVideo(roomItem), "audition tapes are stored videos");
assert(
  !feedShouldEmbedRawHref({
    href: publicUrl,
    embedUrl: publicUrl,
    isStoredBoardVideo: true,
  }),
  "feed must not <video src> a public board-media URL"
);
assert(
  !feedShouldShowStorageLinkCover({
    href: publicUrl,
    isStoredBoardVideo: true,
    isStoredVideoDrop: false,
  }),
  "missing objects must not render a supabase.co hostname card"
);

assert(
  dropDirectMediaUrl({ mediaUrl: publicUrl, url: publicUrl }) === null,
  "DropTile must not fall back to a public 403 URL"
);
assert(
  resolveDropPlaybackSrc(
    { bucket: "board-media", storagePath: "user/project-media/tape.mp4", mediaUrl: publicUrl },
    { "board-media:user/project-media/tape.mp4": signedUrl }
  ) === signedUrl,
  "feed/room video uses the signed URL, not getPublicUrl"
);
assert(
  resolveDropPlaybackSrc(
    { bucket: "board-media", storagePath: "user/project-media/tape.mp4", mediaUrl: publicUrl },
    {}
  ) === null,
  "missing signed URL does not 403 the page with a public object URL"
);

const activity: BoardActivity = {
  id: "project_room_tape",
  created_at: new Date().toISOString(),
  user_id: "user_1",
  kind: "board_drop",
  title: "THOSE RYDERZ Audition | Zoe Folie (Blue Ryder) — Audition tape",
  body: "Board User posted an audition tape in THOSE RYDERZ Audition | Zoe Folie (Blue Ryder).",
  href: publicUrl,
  image_url: null,
  meta: {
    origin: "project_room",
    cardStyle: "project_room_drop",
    dropId: "tape_1",
    mediaKind: "video",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  },
};
const universal: BoardActivity = {
  id: "universal_tape_1",
  created_at: new Date().toISOString(),
  user_id: "user_1",
  kind: "board_drop",
  title: "THOSE RYDERZ Audition | Zoe Folie (Blue Ryder) — Audition tape",
  body: "Board User posted an audition tape in THOSE RYDERZ Audition | Zoe Folie (Blue Ryder).",
  href: publicUrl,
  image_url: null,
  meta: {
    origin: "project_room",
    dropId: "tape_1",
    mediaKind: "video",
  },
};
const deduped = dedupeActivity([activity, universal]);
assert(deduped.length === 1, "one audition tape is one feed Drop");
assert(
  String(deduped[0]?.meta?.storagePath || "").includes("project-media/tape.mp4"),
  "deduped feed Drop keeps storage coords for createSignedUrl"
);

const posterPublic =
  "https://ywvzwtpy.supabase.co/storage/v1/object/public/board-media/user/project-cover/still.jpg";
const posterSigned =
  "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/project-cover/still.jpg?token=abc";
assert(!playablePosterSrc(posterPublic), "private board-media thumbs must not use getPublicUrl");
assert(playablePosterSrc(posterSigned) === posterSigned, "signed poster URLs can render before play");
assert(!playablePosterSrc(publicUrl), "the tape itself is not a thumbnail");

const posterLookup = activityPosterLookup({
  href: publicUrl,
  image_url: posterSigned,
  meta: {
    origin: "project_room",
    mediaKind: "video",
    posterBucket: "board-media",
    posterStoragePath: "user/project-cover/still.jpg",
    storagePath: "user/project-media/tape.mp4",
  },
});
assert(
  posterLookup.coords?.storagePath === "user/project-cover/still.jpg",
  "video room drops expose poster coords for createSignedUrl"
);
assert(posterLookup.url === posterSigned, "stored signed still is preferred over the tape");

const missingPoster = activityPosterLookup({
  href: publicUrl,
  image_url: publicUrl,
  meta: { mediaKind: "video", storagePath: "user/project-media/tape.mp4" },
});
assert(!missingPoster.coords, "missing stills do not treat the tape path as a poster");
assert(!missingPoster.url, "missing stills leave the client capture path");

console.log("feedDropMedia.check.ts: ok");
