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
}): boolean {
  if (opts.isStoredBoardVideo || opts.isStoredVideoDrop) return false;
  if (isBoardStorageMediaUrl(opts.href)) return false;
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
