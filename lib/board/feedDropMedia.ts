import type { BoardActivity } from "@/lib/board/activity";
import {
  isPublicBoardStorageUrl,
  isSignedBoardStorageUrl,
  parseBoardStorageFromUrl,
  resolveStoredMediaCoords,
} from "@/lib/board/musicPlayback";
import {
  isProjectRoomDropActivity,
  persistableProjectRoomMediaUrl,
  projectRoomVideoSrcIsPlayable,
} from "@/lib/board/projectRoomDrop";

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function isBoardStorageMediaUrl(url?: string | null): boolean {
  const src = String(url || "");
  return Boolean(parseBoardStorageFromUrl(src) || isPublicBoardStorageUrl(src));
}

/** Private board-media 403s on /object/public/. Never use those as <video>/<img> src. */
export function playableFeedMediaSrc(url?: string | null): string {
  const src = String(url || "").trim();
  if (!src) return "";
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;
  if (isPublicBoardStorageUrl(src)) return "";
  if (isSignedBoardStorageUrl(src)) return src;
  if (isBoardStorageMediaUrl(src)) return "";
  if (projectRoomVideoSrcIsPlayable(src)) return src;
  return src;
}

export function persistableFeedMediaHref(url?: string | null): string | null {
  const persistable = persistableProjectRoomMediaUrl(url);
  if (!persistable) return null;
  if (isPublicBoardStorageUrl(persistable)) return null;
  return persistable;
}

export function activityMediaCoords(item: {
  href?: string | null;
  image_url?: string | null;
  meta?: Record<string, any> | null;
}): { bucket: string; storagePath: string } | null {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const preview =
    meta.preview && typeof meta.preview === "object" ? meta.preview : meta;
  const media = meta.media && typeof meta.media === "object" ? meta.media : {};
  return resolveStoredMediaCoords({
    bucket: metaString(media.bucket, preview.bucket, meta.bucket),
    storagePath: metaString(media.storagePath, preview.storagePath, meta.storagePath),
    mediaUrl: metaString(media.src, meta.mediaUrl, preview.mediaUrl, item.image_url),
    href: item.href,
  });
}

export function activityLooksLikeStoredVideo(item: {
  href?: string | null;
  meta?: Record<string, any> | null;
}): boolean {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const preview =
    meta.preview && typeof meta.preview === "object" ? meta.preview : {};
  const media = meta.media && typeof meta.media === "object" ? meta.media : {};
  const mediaKind = metaString(meta.mediaKind, preview.mediaKind, media.kind);
  if (mediaKind === "image" || mediaKind === "audio") return false;
  if (mediaKind === "video") return true;
  const dropType = metaString(meta.dropType, meta.drop_flavor, preview.dropType);
  if (/\bvideo\b/i.test(dropType)) return true;
  const coords = activityMediaCoords(item);
  const haystack = [
    item.href,
    meta.mediaUrl,
    media.src,
    coords?.storagePath,
    meta.fileName,
  ]
    .map((value) => String(value || ""))
    .join(" ");
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(haystack)) return true;
  return isProjectRoomDropActivity(item) && Boolean(coords);
}

export function feedShouldEmbedRawHref(opts: {
  href?: string | null;
  embedUrl?: string | null;
  isStoredBoardVideo?: boolean;
}): boolean {
  if (opts.isStoredBoardVideo) return false;
  if (isBoardStorageMediaUrl(opts.href) || isBoardStorageMediaUrl(opts.embedUrl)) {
    return false;
  }
  return Boolean(playableFeedMediaSrc(opts.embedUrl || opts.href));
}

export function feedShouldShowStorageLinkCover(opts: {
  href?: string | null;
  isStoredBoardVideo?: boolean;
  isStoredVideoDrop?: boolean;
  isStoredImageDrop?: boolean;
}): boolean {
  if (opts.isStoredBoardVideo || opts.isStoredVideoDrop || opts.isStoredImageDrop) return false;
  if (isBoardStorageMediaUrl(opts.href)) return false;
  return true;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tif|tiff|svg)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i;

/** Uploaded Vision/photo Drops — not OG link thumbs, not video posters. */
export function activityLooksLikeStoredImage(item: {
  href?: string | null;
  image_url?: string | null;
  meta?: Record<string, any> | null;
}): boolean {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const preview =
    meta.preview && typeof meta.preview === "object" ? meta.preview : {};
  const media = meta.media && typeof meta.media === "object" ? meta.media : {};
  const mediaKind = metaString(meta.mediaKind, preview.mediaKind, media.kind);
  if (mediaKind === "video" || mediaKind === "audio") return false;
  if (activityLooksLikeStoredVideo(item)) return false;
  if (mediaKind === "image") return true;
  const mime = metaString(meta.mime, preview.mime, media.mime);
  if (/^image\//i.test(mime)) return true;
  const dropType = metaString(
    meta.dropType,
    meta.drop_flavor,
    meta.dropFlavor,
    preview.dropType
  ).toLowerCase();
  if (
    dropType.includes("youtube") ||
    dropType.includes("news") ||
    dropType === "link" ||
    dropType.includes("link drop") ||
    dropType.includes("music") ||
    dropType.includes("spotify") ||
    dropType.includes("soundcloud")
  ) {
    return false;
  }
  const coords = activityMediaCoords(item);
  const haystack = [
    item.href,
    item.image_url,
    meta.mediaUrl,
    media.src,
    coords?.storagePath,
    meta.fileName,
    preview.fileName,
  ]
    .map((value) => String(value || ""))
    .join(" ");
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(haystack) || AUDIO_EXT.test(haystack)) return false;
  if (IMAGE_EXT.test(haystack)) return true;
  if (coords && (dropType.includes("vision") || dropType.includes("media") || dropType.includes("photo"))) {
    return true;
  }
  return false;
}

/** OG/link cards stay cropped; uploaded photos must not. */
export function feedShouldShowLinkPreviewCard(opts: {
  href?: string | null;
  isStoredImageDrop?: boolean;
  isStoredVideoDrop?: boolean;
  isStoredAudioDrop?: boolean;
}): boolean {
  if (opts.isStoredImageDrop || opts.isStoredVideoDrop || opts.isStoredAudioDrop) return false;
  if (isBoardStorageMediaUrl(opts.href)) return false;
  const href = String(opts.href || "");
  if (IMAGE_EXT.test(href) && !/^https?:\/\/(?:www\.)?(?:instagram|tiktok|twitter|x|facebook|threads)\./i.test(href)) {
    if (isBoardStorageMediaUrl(href) || href.startsWith("/") || href.startsWith("data:") || href.startsWith("blob:")) {
      return false;
    }
  }
  return true;
}

export function preferFeedMediaUrl(
  preferred?: string | null,
  fallback?: string | null
): string | null {
  const a = playableFeedMediaSrc(preferred);
  const b = playableFeedMediaSrc(fallback);
  return a || b || persistableFeedMediaHref(preferred) || persistableFeedMediaHref(fallback);
}

const POSTER_IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|bmp)(\?|#|$)/i;
const POSTER_VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** Stills/covers only — never the 65MB tape or a public board-media 403 URL. */
export function looksLikePosterImageUrl(url?: string | null): boolean {
  const src = String(url || "").trim();
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  if (src.startsWith("blob:")) return true;
  if (POSTER_VIDEO_EXT.test(src)) return false;
  if (POSTER_IMAGE_EXT.test(src)) return true;
  if (/project-cover\//i.test(src)) return true;
  if (/(?:^|[/_-])(?:poster|thumb(?:nail)?|cover|still)(?:[._/-]|$)/i.test(src)) return true;
  return false;
}

export function playablePosterSrc(url?: string | null): string {
  const src = String(url || "").trim();
  if (!src) return "";
  if (src.startsWith("blob:") || src.startsWith("data:image/")) return src;
  if (!looksLikePosterImageUrl(src)) return "";
  return playableFeedMediaSrc(src);
}

export type ActivityPosterLookup = {
  url: string;
  coords: { bucket: string; storagePath: string } | null;
};

function posterCoordsFromValue(
  bucket?: unknown,
  storagePath?: unknown,
  mediaUrl?: unknown
): { bucket: string; storagePath: string } | null {
  const coords = resolveStoredMediaCoords({
    bucket: metaString(bucket),
    storagePath: metaString(storagePath),
    mediaUrl: metaString(mediaUrl),
  });
  if (!coords) return null;
  if (POSTER_VIDEO_EXT.test(coords.storagePath)) return null;
  return coords;
}

/** Prefer stored poster/cover/thumbnail fields; never treat the video object as a still. */
export function activityPosterLookup(item: {
  href?: string | null;
  image_url?: string | null;
  meta?: Record<string, any> | null;
}): ActivityPosterLookup {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const preview =
    meta.preview && typeof meta.preview === "object" ? meta.preview : meta;
  const media = meta.media && typeof meta.media === "object" ? meta.media : {};
  const urlCandidates = [
    meta.posterUrl,
    meta.poster,
    meta.thumbnail,
    meta.thumbnailUrl,
    meta.coverUrl,
    meta.cover_url,
    media.posterUrl,
    media.poster,
    meta.previewImage,
    preview.previewImage,
    preview.image,
    item.image_url,
  ];
  const url = urlCandidates.map((value) => metaString(value)).find(looksLikePosterImageUrl) || "";
  const coords =
    posterCoordsFromValue(meta.posterBucket, meta.posterStoragePath || meta.posterPath, url) ||
    posterCoordsFromValue(preview.posterBucket, preview.posterStoragePath, url) ||
    posterCoordsFromValue(media.posterBucket, media.posterStoragePath, url) ||
    posterCoordsFromValue(meta.bucket, meta.storagePath, url);
  return { url, coords };
}
