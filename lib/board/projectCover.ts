import { parseBoardStorageFromUrl } from "@/lib/board/musicPlayback";

export const BOARD_PROJECT_MEDIA_BUCKET = "board-media";

export type ProjectCoverMedia = {
  kind: "image" | "video";
  src: string;
  bucket?: string;
  storagePath?: string;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function looksLikeVideoSrc(value: string, mediaType?: string) {
  if (mediaType === "video") return true;
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value);
}

export function looksLikeProjectCoverSrc(value: unknown, mediaType?: string): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const src = value.trim();
  if (
    src.startsWith("data:image/") ||
    src.startsWith("data:video/") ||
    src.startsWith("blob:")
  ) {
    return true;
  }
  if (/\/storage\/v1\/(?:object|render\/image)\//i.test(src)) return true;
  if (/\.(png|jpe?g|gif|webp|avif|heic|bmp|svg|mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) {
    return true;
  }
  // Hosted URLs without a file extension still count when the drop is typed as
  // image/video. Relative Board routes such as /board/work must not.
  if (
    /^https?:\/\//i.test(src) &&
    (mediaType === "image" || mediaType === "video")
  ) {
    return true;
  }
  return false;
}

function nestedProjectRecords(value: unknown): Record<string, any>[] {
  const item = asRecord(value);
  const payload = asRecord(item.payload);
  const meta = asRecord(item.meta);
  const preview = asRecord(item.preview || meta.preview || payload.preview);
  const media = asRecord(item.media || meta.media || payload.media);
  return [item, payload, meta, preview, media];
}

export function resolveProjectFieldString(value: unknown, keys: string[]): string {
  for (const record of nestedProjectRecords(value)) {
    for (const key of keys) {
      const found = firstNonEmptyString(record[key]);
      if (found) return found;
    }
  }
  return "";
}

export function projectCoverCoords(
  media?: ProjectCoverMedia | null
): { bucket: string; storagePath: string } | null {
  if (!media) return null;
  const parsedFromPath =
    media.storagePath ? parseBoardStorageFromUrl(media.storagePath) : null;
  if (parsedFromPath) return parsedFromPath;

  const bucket = firstNonEmptyString(media.bucket) || BOARD_PROJECT_MEDIA_BUCKET;
  let path = firstNonEmptyString(media.storagePath);
  if (path) {
    if (/^https?:\/\//i.test(path)) {
      const parsed = parseBoardStorageFromUrl(path);
      if (parsed) return parsed;
      path = "";
    } else {
      path = path.replace(/^\/+/, "");
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
    }
  }
  if (bucket && path && !/^https?:\/\//i.test(path)) {
    return { bucket, storagePath: path };
  }

  for (const url of [media.src, media.storagePath]) {
    if (!url) continue;
    const parsed = parseBoardStorageFromUrl(url);
    if (parsed) return parsed;
  }
  return null;
}

function coverFromParts(opts: {
  src?: string;
  bucket?: string;
  storagePath?: string;
  mediaType?: string;
}): ProjectCoverMedia | undefined {
  const src = firstNonEmptyString(opts.src);
  const parsed = src ? parseBoardStorageFromUrl(src) : null;
  const storagePath =
    firstNonEmptyString(opts.storagePath) || parsed?.storagePath || "";
  const bucket =
    firstNonEmptyString(opts.bucket) || parsed?.bucket || (storagePath ? BOARD_PROJECT_MEDIA_BUCKET : "");
  if (!src && !storagePath) return undefined;

  const kind = looksLikeVideoSrc(src || storagePath, opts.mediaType) ? "video" : "image";
  return {
    kind,
    src,
    ...(bucket ? { bucket } : {}),
    ...(storagePath ? { storagePath } : {}),
  };
}

export function resolveProjectCover(
  value: unknown,
  extraImageUrl?: string | null
): ProjectCoverMedia | undefined {
  const layers = nestedProjectRecords(value);
  const mediaType = firstNonEmptyString(
    ...layers.map((layer) => layer.mediaType || layer.mediaKind)
  ).toLowerCase();

  const bucket = firstNonEmptyString(
    ...layers.map((layer) => layer.bucket)
  );
  const storagePath = firstNonEmptyString(
    ...layers.map((layer) => layer.storagePath || layer.storage_path)
  );

  const srcCandidates: unknown[] = [extraImageUrl];
  for (const layer of layers) {
    srcCandidates.push(
      layer.src,
      layer.image_url,
      layer.imageUrl,
      layer.mediaUrl,
      layer.previewImage,
      layer.coverUrl,
      layer.cover_url,
      layer.url
    );
    if (Array.isArray(layer.previewImages)) srcCandidates.push(layer.previewImages[0]);
    if (typeof layer.image === "string") srcCandidates.push(layer.image);
  }

  const src = srcCandidates.find((candidate) =>
    looksLikeProjectCoverSrc(candidate, mediaType)
  ) as string | undefined;

  return coverFromParts({
    src,
    bucket,
    storagePath,
    mediaType,
  });
}

export function persistableProjectCover(
  media?: ProjectCoverMedia | null
): ProjectCoverMedia | undefined {
  if (!media) return undefined;
  const coords = projectCoverCoords(media);
  const src = firstNonEmptyString(media.src);
  if (src.startsWith("data:") && coords) {
    return {
      kind: media.kind,
      src: "",
      bucket: coords.bucket,
      storagePath: coords.storagePath,
    };
  }
  if (!src && !coords) return undefined;
  return {
    kind: media.kind,
    src,
    ...(coords?.bucket ? { bucket: coords.bucket } : {}),
    ...(coords?.storagePath ? { storagePath: coords.storagePath } : {}),
  };
}

function coverScore(media?: ProjectCoverMedia | null) {
  if (!media) return 0;
  const coords = projectCoverCoords(media);
  const src = firstNonEmptyString(media.src);
  let score = 0;
  if (coords) score += 8;
  if (src && !src.startsWith("data:")) score += 4;
  if (src.startsWith("data:image/") || src.startsWith("blob:")) score += 1;
  if (src) score += 1;
  return score;
}

export function mergeProjectCover(
  base?: ProjectCoverMedia | null,
  incoming?: ProjectCoverMedia | null
): ProjectCoverMedia | undefined {
  const left = persistableProjectCover(base);
  const right = persistableProjectCover(incoming);
  if (!left) return right;
  if (!right) return left;

  const winner = coverScore(right) > coverScore(left) ? right : left;
  const other = winner === left ? right : left;
  const coords = projectCoverCoords(winner) || projectCoverCoords(other);
  const src =
    firstNonEmptyString(
      winner.src?.startsWith("data:") ? "" : winner.src,
      other.src?.startsWith("data:") ? "" : other.src,
      winner.src,
      other.src
    ) || "";

  return {
    kind: winner.kind || other.kind || "image",
    src,
    ...(coords?.bucket ? { bucket: coords.bucket } : {}),
    ...(coords?.storagePath ? { storagePath: coords.storagePath } : {}),
  };
}

export function resolveProjectLocation(value: unknown): string {
  return resolveProjectFieldString(value, [
    "location",
    "shootLocation",
    "shoot_location",
    "city",
    "place",
  ]);
}

export function resolveProjectStartDate(value: unknown): string {
  return resolveProjectFieldString(value, [
    "startDate",
    "start_date",
    "dates",
    "shootDate",
    "date",
  ]);
}

export function resolveProjectEndDate(value: unknown): string {
  return resolveProjectFieldString(value, ["endDate", "end_date"]);
}
