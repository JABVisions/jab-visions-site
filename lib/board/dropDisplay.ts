/** Shared labels + media inference for Board Drop tiles and Activity cards. */

import { parseBoardStorageFromUrl } from "@/lib/board/musicPlayback";

export type DropMediaKind = "image" | "video" | "audio" | null;

export function normalizeBoardDropType(raw: string | null | undefined): string {
  const t = String(raw ?? "").toLowerCase().trim();
  if (!t) return "";
  if (t.includes("thought")) return "Thought";
  if (t.includes("pay")) return "Pay";
  if (t.includes("music") || t.includes("audio")) return "Music";
  if (t.includes("youtube")) return "YouTube";
  if (t.includes("news")) return "News";
  if (t.includes("doc")) return "Doc";
  if (t.includes("vision") || t.includes("media")) return "Media";
  if (t === "link" || t.includes("link drop")) return "Link";
  return String(raw ?? "");
}

export function isLikelyImageUrl(href: string) {
  if (!href) return false;
  return IMAGE_EXT.test(extFromName(href));
}

type DropLike = {
  type?: string | null;
  mediaKind?: string | null;
  thoughtFormat?: string | null;
  fileName?: string | null;
  mime?: string | null;
  url?: string | null;
  mediaUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
  hostLabel?: string | null;
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|bmp)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac|weba)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

function extFromName(value: string) {
  const base = value.split("?")[0].split("#")[0];
  return base;
}

export function resolveDropMediaKind(drop: DropLike): DropMediaKind {
  // Concrete file signals are ground truth and override a STALE stored mediaKind
  // — e.g. a Pay/Vision drop drawn into an image that still carries an old
  // "audio" kind (which made the image render as a Voice player). We only force
  // IMAGE here, not video/audio, to avoid the .webm ambiguity (Drop Studio voice
  // memos are .webm but live in VIDEO_EXT); the steps below handle those.
  const mime0 = String(drop.mime ?? "").toLowerCase();
  const imageFile = [drop.fileName, drop.storagePath].some(
    (c) => !!c && IMAGE_EXT.test(extFromName(c))
  );
  if (mime0.startsWith("image/") || imageFile) return "image";

  const mk = String(drop.mediaKind ?? "").toLowerCase();
  if (mk === "image" || mk === "video" || mk === "audio") return mk;

  const type = normalizeBoardDropType(drop.type);
  const tf = String(drop.thoughtFormat ?? "").toLowerCase();
  if (tf === "doodle") return "image";
  if (tf === "voice") return "audio";

  if (type === "Thought") {
    for (const candidate of [drop.fileName, drop.storagePath, drop.url, drop.mediaUrl]) {
      if (!candidate) continue;
      if (/vocal|voice/i.test(candidate)) return "audio";
      if (/doodle|art/i.test(candidate)) return "image";
    }
    // Drop Studio voice captures often arrive as audio-only .webm
    for (const candidate of [drop.fileName, drop.url, drop.mediaUrl, drop.storagePath]) {
      if (candidate && /\.webm(\?|#|$)/i.test(extFromName(candidate))) return "audio";
    }
  }

  const mime = String(drop.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  for (const candidate of [drop.fileName, drop.url, drop.mediaUrl, drop.storagePath]) {
    if (!candidate) continue;
    const clean = extFromName(candidate);
    if (IMAGE_EXT.test(clean)) return "image";
    if (VIDEO_EXT.test(clean)) return "video";
    if (AUDIO_EXT.test(clean)) return "audio";
  }

  if (type === "Thought" || type === "Media" || type === "Pay") {
    for (const candidate of [drop.url, drop.mediaUrl]) {
      if (candidate && parseBoardStorageFromUrl(candidate) && isLikelyImageUrl(candidate)) {
        return "image";
      }
    }
    if (drop.bucket?.trim() && drop.storagePath?.trim() && !AUDIO_EXT.test(drop.storagePath)) {
      if (!VIDEO_EXT.test(drop.storagePath)) return "image";
    }
  }

  return null;
}

/** Drop Studio subcategory shown beside the main drop-type pill. */
export function studioSubcategoryLabel(drop: DropLike): string | null {
  const type = normalizeBoardDropType(drop.type);
  const mediaKind = resolveDropMediaKind(drop);
  const tf = String(drop.thoughtFormat ?? "").toLowerCase();

  if (type === "Thought") {
    if (tf === "doodle" || mediaKind === "image") return "Art";
    if (tf === "voice" || mediaKind === "audio") return "Vocal";
    return null;
  }

  if (type === "Music" && mediaKind === "audio") return "Sound";
  if (type === "Pay" && mediaKind === "audio") return "Sound";
  if (type === "Media" && mediaKind === "image") return "Vision";
  if (type === "Media" && mediaKind === "video") return "Vision";

  return null;
}

function labelTokens(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+DROP$/g, "")
    .trim();
}

function labelsEquivalent(a: string, b: string) {
  const left = labelTokens(a);
  const right = labelTokens(b);
  return left === right;
}

/** Secondary badge beside the main drop-type pill (Art, Vocal, Sound, Vision, …). */
export function secondaryAttachmentLabel(drop: DropLike): string | null {
  const type = normalizeBoardDropType(drop.type);
  const main = type.toUpperCase();
  const sub = studioSubcategoryLabel(drop);
  if (sub && !labelsEquivalent(sub, main) && !labelsEquivalent(sub, type)) return sub;

  // Embed/link platforms are already the primary pill — never repeat them here.
  if (type === "YouTube" || type === "News" || type === "Music" || type === "Link") {
    return null;
  }

  const host = String(drop.hostLabel ?? "").trim();
  if (host && host.toUpperCase() !== "LINK" && !labelsEquivalent(host, main)) return host;

  return null;
}

/** Top-left chip on media/link preview cards — never shows a bare "LINK". */
export function mediaAttachmentChipLabel(drop: DropLike): string | null {
  return secondaryAttachmentLabel(drop);
}

/** Label on attachment preview cards (replaces generic "Link Drop"). */
export function attachmentPreviewLabel(drop: DropLike): string {
  const sub = studioSubcategoryLabel(drop);
  if (sub) return sub;

  const type = normalizeBoardDropType(drop.type);
  if (type === "News") return "News Drop";
  if (type === "Link") return "Link Drop";
  if (type === "Music") return "Music Drop";
  if (type === "YouTube") return "YouTube Drop";
  if (type === "Doc") return "Doc Drop";
  if (type === "Pay") return "Pay Drop";
  if (type === "Media") return "Vision Drop";
  if (type === "Thought") return "Thought Drop";
  return "Drop";
}

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function resolveDropMediaKindFromMeta(
  meta: Record<string, unknown> | null | undefined
): DropMediaKind {
  const drop = dropLikeFromMeta(meta);
  if (!drop) return null;
  return resolveDropMediaKind(drop);
}

function dropLikeFromMeta(meta: Record<string, unknown> | null | undefined) {
  if (!meta || typeof meta !== "object") return null;
  const preview =
    meta.preview && typeof meta.preview === "object"
      ? (meta.preview as Record<string, unknown>)
      : null;
  return {
    type: normalizeBoardDropType(
      metaString(meta.dropType, meta.drop_flavor, preview?.dropType, preview?.drop_flavor)
    ),
    mediaKind: metaString(meta.mediaKind, preview?.mediaKind) || null,
    thoughtFormat: metaString(meta.thoughtFormat, preview?.thoughtFormat) || null,
    fileName: metaString(meta.fileName, preview?.fileName) || null,
    mime: metaString(meta.mime, preview?.mime) || null,
    url: metaString(meta.url, meta.linkUrl, meta.mediaUrl, meta.href) || null,
    mediaUrl: metaString(meta.mediaUrl, preview?.image, preview?.previewImage) || null,
    bucket: metaString(meta.bucket, preview?.bucket) || null,
    storagePath: metaString(meta.storagePath, preview?.storagePath) || null,
    hostLabel: metaString(meta.hostLabel, preview?.hostLabel) || null,
  };
}

export function secondaryAttachmentLabelFromMeta(
  meta: Record<string, unknown> | null | undefined
): string | null {
  const drop = dropLikeFromMeta(meta);
  if (!drop) return null;
  return secondaryAttachmentLabel(drop);
}

export function studioSubcategoryFromMeta(meta: Record<string, unknown> | null | undefined) {
  const drop = dropLikeFromMeta(meta);
  if (!drop) return null;
  return studioSubcategoryLabel(drop);
}

export function storageCoordsFromDrop(drop: DropLike) {
  if (drop.bucket?.trim() && drop.storagePath?.trim()) {
    return { bucket: drop.bucket.trim(), storagePath: drop.storagePath.trim() };
  }
  for (const url of [drop.mediaUrl, drop.url]) {
    if (!url) continue;
    const parsed = parseBoardStorageFromUrl(url);
    if (parsed) return parsed;
  }
  return null;
}
