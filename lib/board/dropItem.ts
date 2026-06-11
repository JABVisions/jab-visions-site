"use client";

// DropItem model + helpers extracted verbatim from DropTile.tsx.
// Pure data/URL/storage logic — no React. Shared by the profile Drop tile and
// anything else that works with profile-board drops.

import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import {
  normalizeDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import {
  DROP_FLAVOR_LINK_ROW,
  DROP_FLAVOR_STUDIO_ROW,
  type DropFlavorKey,
} from "@/lib/board/dropFlavors";
import {
  normalizeRichText,
  richTextFromPlain,
  type RichTextValue,
} from "@/lib/board/richText";
import {
  canonicalDropType,
  resolveDropMediaKind,
} from "@/lib/board/dropDisplay";

export type DropType =
  | "YouTube"
  | "Music"
  | "News"
  | "Link"
  | "Media"
  | "Pay"
  | "Doc"
  | "Thought";
export type MediaKind = "image" | "video" | "audio";
export type PayProviderMode = "payment_link" | "stripe_connect";
export type StudioCaptureMode = "photo" | "video" | "audio" | "art" | "descript";

// Map the canonical (creation-first) flavor order to this surface's DropType
// labels, so the Drop tabs match the Drop Console and every other surface.
export const MODE_BY_FLAVOR: Record<DropFlavorKey, DropType> = {
  media: "Media",
  thought: "Thought",
  pay: "Pay",
  youtube: "YouTube",
  music: "Music",
  news: "News",
  link: "Link",
  doc: "Doc",
};
export const STUDIO_MODE_ORDER: DropType[] = DROP_FLAVOR_STUDIO_ROW.map((k) => MODE_BY_FLAVOR[k]);
export const LINK_MODE_ORDER: DropType[] = DROP_FLAVOR_LINK_ROW.map((k) => MODE_BY_FLAVOR[k]);

export function displayDropType(type: DropType) {
  return type === "Media" ? "Vision" : type;
}

export function boardTitleFields(raw: string, fallback = "Untitled") {
  const title = raw.trim() || fallback;
  return {
    title,
    titleRich: normalizeRichText(richTextFromPlain(title)),
  };
}

export type DropItem = {
  id: string;
  title: string;
  type: DropType;
  createdAt: number;
  /** Last-edited timestamp. Used to decide whether a cached local copy is fresh
   *  enough to override server feed data (see ActivityCard). */
  updatedAt?: number;
  /** How many Drop Studio drafts have been saved while making this drop. */
  draftCount?: number;

  url?: string;
  embedUrl?: string | null;
  hostLabel?: string;
  headline?: string;
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;

  bucket?: string;
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  mediaKind?: MediaKind;
  /** Direct media URL fallback (e.g. from a feed item) when no Supabase
   *  bucket/storagePath is available. Lets Drop Studio load existing media
   *  to re-edit even from surfaces that only carry a rendered URL. */
  mediaUrl?: string;

  priceCents?: number;
  description?: string;
  linkUrl?: string;
  payProvider?: PayProviderMode;
  paymentRequestType?: "direct" | "link";
  paymentLink?: string;
  mediaSource?: "upload" | "capture";
  badgeLabel?: string;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
  recipientStripeAccountId?: string;
  customizations?: DropCustomization;
  visibility?: "public" | "private";
  thoughtFormat?: "text" | "voice" | "doodle";
  thoughtText?: string;
  /** Inline-formatted title/description (bold/italic/underline + field-level
   *  size & spacing). Plain `title`/`description` remain the fallback. */
  titleRich?: RichTextValue;
  descriptionRich?: RichTextValue;
  /** When editing from the feed Activity Channel (announcements, etc.). */
  editSource?: "board_drop" | "announcement";
  sourceActivityId?: string;
};

export const STORAGE_KEY = "jab_board_drops_v2";
export const DELETED_STORAGE_KEY = "jab_board_drops_deleted_v1";
export const BUCKET_MEDIA = "board-media";
export const BUCKET_DOCS = "board-docs";
export const PROFILE_STORAGE_KEY = "jab_board_profile_v2";
export const OPTIONS_STORAGE_KEY = "board.options.v1";

export const AURA_HEX: Record<string, string> = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
};

export function scopedStorageKey(base: string, userId: string | null) {
  return userId ? `${base}:${userId}` : null;
}

export function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function flash(setter: (v: string | null) => void, text: string, ms = 1600) {
  setter(text);
  window.setTimeout(() => setter(null), ms);
}

export function readLocalDropAvatar() {
  if (typeof window === "undefined") {
    return { avatarSrc: "", glowColor: "#FF4FD8", auraIntensity: 72 };
  }

  try {
    const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const auraKey = typeof options?.auraColor === "string" ? options.auraColor : "";
    const glowColor =
      (auraKey && AURA_HEX[auraKey]) ||
      (typeof profile?.glowColor === "string" && profile.glowColor.trim()) ||
      "#FF4FD8";

    return {
      avatarSrc:
        (typeof profile?.avatarDataUrl === "string" && profile.avatarDataUrl.trim()) ||
        (typeof profile?.avatarUrl === "string" && profile.avatarUrl.trim()) ||
        "",
      glowColor,
      auraIntensity:
        typeof options?.auraIntensity === "number"
          ? Math.max(0, Math.min(100, options.auraIntensity))
          : 72,
    };
  } catch {
    return { avatarSrc: "", glowColor: "#FF4FD8", auraIntensity: 72 };
  }
}

export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  try {
    return new URL(s).toString();
  } catch { }

  try {
    return new URL(`https://${s}`).toString();
  } catch {
    return null;
  }
}

export function hostLabelFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const h = u.hostname.replace(/^www\./, "");
    return h.toUpperCase();
  } catch {
    return "LINK";
  }
}

export function faviconUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const d = u.hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;
  } catch {
    return null;
  }
}

export function newsCoverUrl(rawUrl: string): string | null {
  const fallback = resolveLinkPreviewImage(rawUrl, null);
  if (fallback) return fallback;

  try {
    const u = new URL(rawUrl);
    const target = u.toString();
    return `https://image.thum.io/get/width/1200/crop/800/noanimate/${target}`;
  } catch {
    return null;
  }
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 140);
}

export function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function toMediaKind(value: unknown): MediaKind | undefined {
  return value === "image" || value === "video" || value === "audio" ? value : undefined;
}

export function isAudioFile(file: File) {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
  );
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export function thoughtFormatFromFile(file: File | null): DropItem["thoughtFormat"] {
  if (!file) return "text";
  if (isAudioFile(file)) return "voice";
  if (isImageFile(file)) return "doodle";
  return "text";
}

export function readDeletedDropIds(userId: string | null) {
  const key = scopedStorageKey(DELETED_STORAGE_KEY, userId);
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberDeletedDropId(id: string, userId: string | null) {
  const key = scopedStorageKey(DELETED_STORAGE_KEY, userId);
  if (!key) return;

  const ids = readDeletedDropIds(userId);
  const next = Array.from(new Set([id, ...ids])).slice(0, 500);
  localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

export function youtubeIdFromUrl(u: URL): string | null {
  const host = u.hostname.toLowerCase();

  if (host.includes("youtu.be")) {
    const id = u.pathname.replace("/", "").trim();
    return id || null;
  }

  const v = u.searchParams.get("v");
  if (v) return v;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "shorts" && parts[1]) return parts[1];
  if (parts[0] === "embed" && parts[1]) return parts[1];

  return null;
}

export function toYouTubeEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const id = youtubeIdFromUrl(u);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

export function toSpotifyEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("spotify.com")) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const type = parts[0];
  const id = parts[1];
  const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
  if (!allowed.has(type) || !id) return null;

  return `https://open.spotify.com/embed/${type}/${id}`;
}

export function toSoundCloudEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("soundcloud.com")) return null;

  const encoded = encodeURIComponent(u.toString());
  return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
}

export function toAppleMusicEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (host === "embed.music.apple.com") return u.toString();
  if (host !== "music.apple.com") return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") return `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`;
  if (parts.length < 3) return null;

  return `https://embed.music.apple.com${u.pathname}${u.search}`;
}

export function makeEmbedByMode(
  mode: DropType,
  rawUrl: string
): { embedUrl: string | null; hostLabel: string } {
  const hostLabel = hostLabelFromUrl(rawUrl);

  if (mode === "YouTube") return { embedUrl: toYouTubeEmbed(rawUrl), hostLabel: "YOUTUBE" };

  if (mode === "Music") {
    const s = toSpotifyEmbed(rawUrl);
    if (s) return { embedUrl: s, hostLabel: "SPOTIFY" };
    const sc = toSoundCloudEmbed(rawUrl);
    if (sc) return { embedUrl: sc, hostLabel: "SOUNDCLOUD" };
    const am = toAppleMusicEmbed(rawUrl);
    if (am) return { embedUrl: am, hostLabel: "APPLE MUSIC" };
    const yt = toYouTubeEmbed(rawUrl);
    if (yt) return { embedUrl: yt, hostLabel: "YOUTUBE" };
    return { embedUrl: null, hostLabel };
  }

  if (mode === "News") return { embedUrl: null, hostLabel };
  if (mode === "Link") return { embedUrl: null, hostLabel };

  return { embedUrl: null, hostLabel };
}

export type EmbedKind =
  | "spotify_track"
  | "spotify_large"
  | "soundcloud"
  | "apple_music_track"
  | "apple_music_album"
  | "youtube"
  | "generic";

export function embedKindFromUrl(embedUrl: string): EmbedKind {
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();

    if (host.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const type = parts[1];
      if (type === "track" || type === "episode") return "spotify_track";
      return "spotify_large";
    }

    if (host.includes("w.soundcloud.com")) return "soundcloud";
    if (host.includes("embed.music.apple.com")) {
      return u.searchParams.has("i") || u.pathname.includes("/song/")
        ? "apple_music_track"
        : "apple_music_album";
    }
    if (host.includes("youtube.com")) return "youtube";
    return "generic";
  } catch {
    return "generic";
  }
}

export function emitNewActivity(payload: any) {
  try {
    window.dispatchEvent(new CustomEvent("board:activity:new", { detail: payload }));
  } catch {
    // no-op
  }
}

export function normalizeDropItems(input: unknown, userId: string | null): DropItem[] {
  if (!Array.isArray(input)) return [];

  const deletedIds = readDeletedDropIds(userId);
  return dedupeDropItems(input
    .filter((x) => x && typeof x === "object")
    .map((x: any): DropItem => {
      const type = canonicalDropType(x.type, {
        priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
        embedUrl: typeof x.embedUrl === "string" ? x.embedUrl : null,
        thoughtText: typeof x.thoughtText === "string" ? x.thoughtText : undefined,
        bucket: typeof x.bucket === "string" ? x.bucket : undefined,
        storagePath: typeof x.storagePath === "string" ? x.storagePath : undefined,
        url: typeof x.url === "string" ? x.url : undefined,
      });
      const base: DropItem = {
      id: String(x.id ?? safeId()),
      title: String(x.title ?? "Untitled"),
      type,
      createdAt: Number(x.createdAt ?? Date.now()),
      url: typeof x.url === "string" ? x.url : undefined,
      embedUrl: typeof x.embedUrl === "string" ? x.embedUrl : null,
      hostLabel: typeof x.hostLabel === "string" ? x.hostLabel : undefined,
      headline: typeof x.headline === "string" ? x.headline : undefined,
      previewTitle: typeof x.previewTitle === "string" ? x.previewTitle : undefined,
      previewDescription:
        typeof x.previewDescription === "string" ? x.previewDescription : undefined,
      previewImage: typeof x.previewImage === "string" ? x.previewImage : undefined,
      bucket: typeof x.bucket === "string" ? x.bucket : undefined,
      storagePath: typeof x.storagePath === "string" ? x.storagePath : undefined,
      fileName: typeof x.fileName === "string" ? x.fileName : undefined,
      fileSize: typeof x.fileSize === "number" ? x.fileSize : undefined,
      mime: typeof x.mime === "string" ? x.mime : undefined,
      mediaKind: toMediaKind(x.mediaKind),
      mediaUrl: typeof x.mediaUrl === "string" ? x.mediaUrl : undefined,
      priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
      description: typeof x.description === "string" ? x.description : undefined,
      linkUrl: typeof x.linkUrl === "string" ? x.linkUrl : undefined,
      payProvider:
        x.payProvider === "payment_link"
          ? "payment_link"
          : x.payProvider === "stripe_connect" ||
              x.payProvider === "authorize_net_accept_hosted"
            ? "stripe_connect"
            : undefined,
      paymentRequestType:
        x.paymentRequestType === "direct" || x.paymentRequestType === "link"
          ? x.paymentRequestType
          : undefined,
      paymentLink: typeof x.paymentLink === "string" ? x.paymentLink : undefined,
      mediaSource:
        x.mediaSource === "capture" || x.mediaSource === "upload"
          ? x.mediaSource
          : undefined,
      badgeLabel: typeof x.badgeLabel === "string" ? x.badgeLabel : undefined,
      recipientUserId:
        typeof x.recipientUserId === "string" && x.recipientUserId.trim()
          ? x.recipientUserId.trim()
          : undefined,
      recipientUsername:
        typeof x.recipientUsername === "string" && x.recipientUsername.trim()
          ? x.recipientUsername.trim().toLowerCase()
          : undefined,
      recipientDisplayName:
        typeof x.recipientDisplayName === "string" && x.recipientDisplayName.trim()
          ? x.recipientDisplayName.trim()
          : undefined,
      recipientStripeAccountId:
        typeof x.recipientStripeAccountId === "string" && x.recipientStripeAccountId.trim()
          ? x.recipientStripeAccountId.trim()
          : undefined,
      customizations: normalizeDropCustomizations(x.customizations),
      titleRich: normalizeRichText(x.titleRich),
      descriptionRich: normalizeRichText(x.descriptionRich),
      visibility:
        x.visibility === "private" || x.visibility === "public"
          ? x.visibility
          : undefined,
      thoughtFormat:
        x.thoughtFormat === "text" || x.thoughtFormat === "voice" || x.thoughtFormat === "doodle"
          ? x.thoughtFormat
          : undefined,
      thoughtText: typeof x.thoughtText === "string" ? x.thoughtText : undefined,
    };
      const resolvedKind = resolveDropMediaKind(base);
      if (resolvedKind) base.mediaKind = resolvedKind;
      return base;
    })
    .filter((d) => d.id && d.title && !deletedIds.includes(d.id)));
}

export function dropDedupeKey(drop: DropItem) {
  const title = drop.title.trim().toLowerCase();
  const url = drop.url || drop.linkUrl || "";
  const storage = drop.bucket && drop.storagePath ? `${drop.bucket}:${drop.storagePath}` : "";
  const typedTitle = title ? `${drop.type}:${title}` : "";
  return typedTitle || url || storage || drop.id;
}

export function dropCompletenessScore(drop: DropItem) {
  return (
    (drop.bucket && drop.storagePath ? 4 : 0) +
    (drop.previewImage ? 3 : 0) +
    (drop.embedUrl ? 2 : 0) +
    (drop.url || drop.linkUrl ? 1 : 0)
  );
}

export function dedupeDropItems(items: DropItem[]) {
  const map = new Map<string, DropItem>();

  for (const item of items) {
    const key = dropDedupeKey(item);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      continue;
    }

    const previousScore = dropCompletenessScore(previous);
    const nextScore = dropCompletenessScore(item);
    if (nextScore > previousScore || item.createdAt > previous.createdAt) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function readBestLocalDropItems() {
  if (typeof window === "undefined") return [];
  const map = new Map<string, DropItem>();

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}:`))) continue;
    try {
      const raw = window.localStorage.getItem(key);
      const items = normalizeDropItems(raw ? JSON.parse(raw) : [], null);
      for (const item of items) {
        if (!map.has(item.id)) map.set(item.id, item);
      }
    } catch {
      // ignore bad local drop cache
    }
  }

  return dedupeDropItems(Array.from(map.values()));
}
