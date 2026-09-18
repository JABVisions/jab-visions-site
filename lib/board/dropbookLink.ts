import { fetchLinkPreview } from "@/lib/board/linkPreview";
import {
  toAppleMusicEmbed,
  toSoundCloudEmbed,
  toSpotifyEmbed,
  toYouTubeEmbed,
} from "@/lib/board/dropItem";

export type DropbookLinkKind = "youtube" | "news" | "music" | "link";

export type ResolvedDropbookLink = {
  kind: DropbookLinkKind;
  url: string;
  title: string;
  description?: string;
  image?: string;
  embedUrl?: string;
  provider?: string;
  /** Short chip footer label */
  chipLabel: string;
};

const NEWS_HOSTS = new Set([
  "nytimes.com",
  "washingtonpost.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "reuters.com",
  "theguardian.com",
  "apnews.com",
  "npr.org",
  "wsj.com",
  "bloomberg.com",
  "forbes.com",
  "businessinsider.com",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "politico.com",
  "time.com",
  "newsweek.com",
  "usatoday.com",
  "latimes.com",
  "nbcnews.com",
  "abcnews.go.com",
  "cbsnews.com",
  "foxnews.com",
  "aljazeera.com",
  "independent.co.uk",
  "telegraph.co.uk",
  "huffpost.com",
  "axios.com",
  "vox.com",
  "slate.com",
  "theatlantic.com",
  "newyorker.com",
  "economist.com",
  "ft.com",
  "cnbc.com",
  "marketwatch.com",
  "msnbc.com",
  "news.yahoo.com",
  "news.google.com",
]);

function normalizeRawUrl(raw: unknown) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).toString();
  } catch {
    return "";
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(url: string) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function isNewsHost(host: string) {
  if (!host) return false;
  if (NEWS_HOSTS.has(host)) return true;
  if (host.startsWith("news.")) return true;
  if (host.endsWith(".news")) return true;
  for (const known of NEWS_HOSTS) {
    if (host === known || host.endsWith(`.${known}`)) return true;
  }
  return false;
}

function isNewsPath(pathname: string) {
  return /(^|\/)(news|article|articles|story|stories)(\/|$)/i.test(pathname);
}

export function isYouTubeDropUrl(raw: string | null | undefined): boolean {
  return classifyDropbookLinkUrl(raw ?? "") === "youtube";
}

/** Apple Music / Spotify / SoundCloud share links — Music Drops, not uploaded audio. */
export function isMusicServiceUrl(raw: string | null | undefined): boolean {
  return classifyDropbookLinkUrl(raw ?? "") === "music";
}

export function isNewsDropUrl(raw: string | null | undefined): boolean {
  return classifyDropbookLinkUrl(raw ?? "") === "news";
}

/** Streaming links that should iframe-embed instead of playing as an audio file. */
export function isStreamingEmbedUrl(raw: string | null | undefined): boolean {
  const kind = classifyDropbookLinkUrl(raw ?? "");
  return kind === "youtube" || kind === "music";
}

/** URL alone decides YouTube / News / Music / Link — no mode picker. */
export function classifyDropbookLinkUrl(raw: unknown): DropbookLinkKind | null {
  const url = normalizeRawUrl(raw);
  if (!url) return null;
  const host = hostOf(url);
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (
    host.includes("spotify.com") ||
    host.includes("music.apple.com") ||
    host.includes("soundcloud.com")
  ) {
    return "music";
  }
  if (isNewsHost(host) || isNewsPath(pathOf(url))) return "news";
  return "link";
}

/**
 * Live URL-field classification. Strong kinds (YouTube / News / Music) switch
 * immediately; generic Link waits for a real domain so half-typed music URLs
 * don't steal the flavor.
 */
export function classifiedStudioLinkKind(raw: unknown): DropbookLinkKind | null {
  const kind = classifyDropbookLinkUrl(raw);
  if (!kind) return null;
  if (kind !== "link") return kind;
  const host = hostOf(normalizeRawUrl(raw));
  return host.includes(".") ? "link" : null;
}

export function musicEmbedFor(url: string) {
  return toSpotifyEmbed(url) || toAppleMusicEmbed(url) || toSoundCloudEmbed(url) || undefined;
}

function defaultTitle(kind: DropbookLinkKind, url: string) {
  const host = hostOf(url);
  if (kind === "youtube") return "YouTube";
  if (kind === "news") return host || "News";
  if (kind === "music") {
    if (host.includes("spotify")) return "Spotify";
    if (host.includes("apple")) return "Apple Music";
    if (host.includes("soundcloud")) return "SoundCloud";
    return "Music";
  }
  return host || "Link";
}

function chipLabelFor(kind: DropbookLinkKind, title: string) {
  if (kind === "youtube") return title.length > 18 ? "YouTube ▶" : `${title} ▶`;
  if (kind === "news") return title.length > 18 ? "News 📰" : `${title} 📰`;
  if (kind === "music") return title.length > 18 ? "Song ♫" : `${title} ♫`;
  return title.length > 22 ? `${title.slice(0, 20)}…` : title;
}

/**
 * Resolve a pasted URL into a YouTube / news / music / web link payload.
 * Used for standalone Link Drops and Dropbook pages.
 */
export async function resolveDropbookLink(raw: string): Promise<ResolvedDropbookLink | null> {
  const url = normalizeRawUrl(raw);
  const kind = classifyDropbookLinkUrl(url);
  if (!url || !kind) return null;

  const preview = await fetchLinkPreview(url).catch(() => null);
  const embedUrl =
    kind === "youtube"
      ? toYouTubeEmbed(url) || preview?.embedUrl || undefined
      : kind === "music"
        ? musicEmbedFor(url) || preview?.embedUrl || undefined
        : preview?.embedUrl || undefined;

  const title =
    preview?.title?.trim() ||
    defaultTitle(kind, url);
  const description = preview?.description?.trim() || undefined;
  const image = preview?.image || undefined;
  const provider = preview?.provider || hostOf(url) || undefined;

  return {
    kind,
    url,
    title,
    description,
    image,
    embedUrl,
    provider,
    chipLabel: chipLabelFor(kind, title),
  };
}

/** Standalone Studio LINK bar Posts persist as the classified URL kind. */
export function studioLinkPersistKind(link: ResolvedDropbookLink): DropbookLinkKind {
  return link.kind;
}

/** Dropbook slides have no news kind — news pages sit on a link slide. */
export function dropbookSlideKindFor(
  kind: DropbookLinkKind
): "youtube" | "music" | "link" {
  return kind === "youtube" || kind === "music" ? kind : "link";
}

/** YouTube / Music Drops use their platform embed; news and web links keep preview embeds. */
export function studioLinkEmbedUrl(link: ResolvedDropbookLink): string | undefined {
  if (link.kind === "youtube") {
    return toYouTubeEmbed(link.url) || link.embedUrl || undefined;
  }
  if (link.kind === "music") {
    return musicEmbedFor(link.url) || link.embedUrl || undefined;
  }
  return link.embedUrl;
}
