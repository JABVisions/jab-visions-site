import { classifyDropbookLinkUrl, isMusicServiceUrl, isYouTubeDropUrl } from "./dropbookLink";
import { canonicalDropType, resolveDropMediaKind } from "./dropDisplay";
import { dedupeDropItems, dropDedupeKey, type DropItem } from "./dropItem";
import { dedupeActivity, mergeActivityWithFeed, universalDropToActivity } from "./feedActivity";
import {
  activityLooksLikeStoredImage,
  activityLooksLikeStreamingMusicDrop,
  preferFeedMediaUrl,
} from "./feedDropMedia";
import { toSoundCloudEmbed } from "./soundCloudEmbed";
import type { BoardActivity } from "./activity";
import type { UniversalDrop } from "./drops/storage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const LANA = "https://soundcloud.com/lanadelrey/video-games";
const LANA_ART = "https://i1.sndcdn.com/artworks-lana-del-rey-t500x500.jpg";
const LANA_EMBED = toSoundCloudEmbed(LANA);
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const APPLE = "https://music.apple.com/us/album/did-you-know-that-theres-a-tunnel-under-ocean-blvd/1664098516";

assert(classifyDropbookLinkUrl(LANA) === "music", "SoundCloud is a Music Drop");
assert(isMusicServiceUrl(LANA), "SoundCloud is a music service URL");
assert(classifyDropbookLinkUrl(YOUTUBE) === "youtube", "YouTube stays YouTube, not Music");
assert(isYouTubeDropUrl(YOUTUBE), "youtube-not-music still holds");
assert(!isMusicServiceUrl(YOUTUBE), "plain YouTube is not a Music service URL");
assert(classifyDropbookLinkUrl(APPLE) === "music", "Apple Music stays Music");
assert(LANA_EMBED, "Lana Del Rey SoundCloud URL builds a player");

assert(
  canonicalDropType("Music", { url: LANA, embedUrl: LANA_EMBED }) === "Music",
  "canonical type stays Music for SoundCloud"
);
assert(
  canonicalDropType("Music", { url: YOUTUBE }) === "YouTube",
  "YouTube URL on a Music paste becomes a YouTube Drop"
);
assert(
  resolveDropMediaKind({
    type: "Music",
    url: LANA,
    mediaUrl: LANA_ART,
    mediaKind: "image",
  }) === null,
  "SoundCloud artwork jpeg does not become an uploaded image kind"
);
assert(
  resolveDropMediaKind({
    type: "Media",
    url: "/assets/john_andy_headshot.jpg",
    mediaKind: "image",
  }) === "image",
  "Vision Drops still resolve as images"
);

const localLana: DropItem = {
  id: "lana_soundcloud_1",
  title: "Lana Del Rey",
  type: "Music",
  createdAt: 1,
  url: LANA,
  embedUrl: LANA_EMBED,
};
const forumCopy: DropItem = {
  id: "lana_forum_share",
  title: "Lana Del Rey",
  type: "Music",
  createdAt: 2,
  previewImage: LANA_ART,
};
const afterTitleDedupe = dedupeDropItems([forumCopy, localLana]);
assert(afterTitleDedupe.length === 2, "two Music Drops with the same title keep both ids");
assert(
  afterTitleDedupe.some((drop) => drop.id === "lana_soundcloud_1" && drop.url === LANA),
  "the SoundCloud Lana Drop survives title-collapse"
);
assert(
  dropDedupeKey(localLana) === "id:lana_soundcloud_1",
  "dedupe key is the drop id, not Music:lana del rey"
);

const sameIdArtwork: DropItem = {
  id: "lana_soundcloud_1",
  title: "Lana Del Rey",
  type: "Music",
  createdAt: 9,
  previewImage: LANA_ART,
  mediaKind: "image",
  mediaUrl: LANA_ART,
};
const mergedSameId = dedupeDropItems([sameIdArtwork, localLana]);
assert(mergedSameId.length === 1, "same id hydrates to one Drop");
assert(mergedSameId[0]?.url === LANA, "merged copy keeps the SoundCloud URL");
assert(mergedSameId[0]?.embedUrl === LANA_EMBED, "merged copy keeps the SoundCloud embed");

const universal = universalDropToActivity({
  id: "lana_soundcloud_1",
  type: "music",
  title: "Lana Del Rey",
  createdAt: Date.now(),
  url: LANA,
  embedUrl: LANA_EMBED,
  mediaUrl: LANA_ART,
  mediaKind: "image",
  imageUrl: LANA_ART,
} as UniversalDrop);
assert(universal, "universal hydrate keeps the Music Drop");
assert(universal!.href === LANA, "universal hydrate href is the SoundCloud track, not artwork");
assert(
  String(universal!.meta?.embedUrl || "").includes("soundcloud.com"),
  "universal hydrate stores the SoundCloud embed"
);
assert(
  !activityLooksLikeStoredImage(universal!),
  "hydrated SoundCloud Drop is not an image Drop"
);
assert(
  activityLooksLikeStreamingMusicDrop(universal!),
  "hydrated SoundCloud Drop is still streaming music"
);

const remoteArtwork: BoardActivity = {
  id: "activity_lana",
  created_at: new Date().toISOString(),
  user_id: "user-1",
  kind: "board_drop",
  title: "Lana Del Rey",
  body: "New Music Drop added to Board.",
  href: LANA_ART,
  image_url: LANA_ART,
  meta: {
    dropId: "lana_soundcloud_1",
    dropType: "Music",
    mediaKind: "image",
  },
};
const localTrack: BoardActivity = {
  id: "local_lana",
  created_at: new Date(Date.now() - 1000).toISOString(),
  user_id: "user-1",
  kind: "board_drop",
  title: "Lana Del Rey",
  body: "New Music Drop added to Board.",
  href: LANA,
  image_url: LANA_ART,
  meta: {
    dropId: "lana_soundcloud_1",
    dropType: "Music",
    embedUrl: LANA_EMBED,
  },
};
const hydrated = dedupeActivity([remoteArtwork, localTrack]);
assert(hydrated.length === 1, "activity hydrate/merge keeps one Lana Drop");
assert(hydrated[0]?.href === LANA, "merge keeps the SoundCloud href instead of the jpeg");
assert(
  String(hydrated[0]?.meta?.embedUrl || "").includes("w.soundcloud.com"),
  "merge keeps the SoundCloud player"
);

const failedEmbedStillPresent = {
  ...localTrack,
  href: LANA,
  meta: { ...localTrack.meta, embedUrl: null },
};
assert(
  failedEmbedStillPresent.href === LANA,
  "embed failure must not delete the SoundCloud Drop"
);
assert(
  !activityLooksLikeStoredImage(failedEmbedStillPresent),
  "a SoundCloud Drop without an iframe is still not an image Drop"
);

const youtubeActivity: BoardActivity = {
  id: "yt_1",
  created_at: new Date().toISOString(),
  user_id: "user-1",
  kind: "board_drop",
  title: "Never Gonna Give You Up",
  body: "New YouTube Drop added to Board.",
  href: YOUTUBE,
  image_url: null,
  meta: { dropType: "YouTube", dropId: "yt_1" },
};
const withYoutube = mergeActivityWithFeed([failedEmbedStillPresent, youtubeActivity], []);
assert(
  withYoutube.some((item) => item.href === LANA),
  "feed merge still includes the SoundCloud Music Drop"
);
assert(
  withYoutube.some((item) => item.href === YOUTUBE && String(item.meta?.dropType) === "YouTube"),
  "YouTube-not-music still holds after SoundCloud persist"
);
assert(
  preferFeedMediaUrl(LANA_ART, LANA) === LANA,
  "preferFeedMediaUrl never swaps SoundCloud for artwork"
);

console.log("soundCloudMusicPersist.check.ts: ok");
