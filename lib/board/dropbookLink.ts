import { fetchLinkPreview } from "@/lib/board/linkPreview";
import {
  toAppleMusicEmbed,
  toSoundCloudEmbed,
  toSpotifyEmbed,
  toYouTubeEmbed,
} from "@/lib/board/dropItem";

export type DropbookLinkKind = "youtube" | "music" | "link";

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

function normalizeRawUrl(raw: string) {
  const trimmed = raw.trim();
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

/** URL alone decides the Dropbook page kind — no mode picker. */
export function classifyDropbookLinkUrl(raw: string): DropbookLinkKind | null {
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
  return "link";
}

function musicEmbedFor(url: string) {
  return toSpotifyEmbed(url) || toAppleMusicEmbed(url) || toSoundCloudEmbed(url) || undefined;
}

function defaultTitle(kind: DropbookLinkKind, url: string) {
  const host = hostOf(url);
  if (kind === "youtube") return "YouTube";
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
  if (kind === "music") return title.length > 18 ? "Song ♫" : `${title} ♫`;
  return title.length > 22 ? `${title.slice(0, 20)}…` : title;
}

/**
 * Resolve a pasted URL into a YouTube / music / web link payload.
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
