// Link / embed helpers for Drop Studio's link bar (YouTube, news, music, link).

import {
  buildMusicEmbed,
  buildYouTubeEmbed,
  normalizeUrl,
  parseYouTubeId,
  safeHostname,
} from "@/lib/board/utils";
import type { DropFlavorKey } from "@/lib/board/dropFlavors";

export type StudioLinkFlavor = Extract<DropFlavorKey, "youtube" | "news" | "music" | "link">;

export type StudioLinkDrop = {
  flavor: StudioLinkFlavor;
  url: string;
  embedUrl?: string;
  title?: string;
  previewUrl?: string;
};

export function linkFlavorLabel(flavor: StudioLinkFlavor) {
  if (flavor === "youtube") return "YouTube";
  if (flavor === "news") return "News";
  if (flavor === "music") return "Music";
  return "Link";
}

export function linkFlavorGlyph(flavor: StudioLinkFlavor) {
  if (flavor === "youtube") return "📺";
  if (flavor === "news") return "📰";
  if (flavor === "music") return "🎧";
  return "🔗";
}

export function linkFlavorPlaceholder(flavor: StudioLinkFlavor) {
  if (flavor === "youtube") return "Paste a YouTube link";
  if (flavor === "news") return "Paste an article link";
  if (flavor === "music") return "Paste Spotify / SoundCloud / Apple Music";
  return "Paste any link";
}

/** Resolve a pasted URL into a studio link drop (embed + optional thumbnail). */
export function resolveStudioLink(
  flavor: StudioLinkFlavor,
  raw: string
): { ok: true; drop: StudioLinkDrop } | { ok: false; error: string } {
  const url = normalizeUrl(raw.trim());
  if (!url) {
    return { ok: false, error: linkFlavorPlaceholder(flavor) };
  }

  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return { ok: false, error: "That doesn’t look like a valid URL." };
  }

  if (flavor === "youtube") {
    const { embedUrl } = buildYouTubeEmbed(url);
    if (!embedUrl) {
      return { ok: false, error: "That doesn’t look like a valid YouTube link." };
    }
    const id = parseYouTubeId(url);
    return {
      ok: true,
      drop: {
        flavor,
        url,
        embedUrl,
        title: "YouTube clip",
        previewUrl: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined,
      },
    };
  }

  if (flavor === "music") {
    const { embedUrl, provider } = buildMusicEmbed(url);
    // YouTube Music / video-as-music also OK via YouTube embed.
    if (!embedUrl) {
      const yt = buildYouTubeEmbed(url);
      if (yt.embedUrl) {
        const id = parseYouTubeId(url);
        return {
          ok: true,
          drop: {
            flavor,
            url,
            embedUrl: yt.embedUrl,
            title: "Music",
            previewUrl: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined,
          },
        };
      }
      return { ok: false, error: "Unsupported music link. Use Spotify, SoundCloud, Apple Music, or YouTube." };
    }
    return {
      ok: true,
      drop: {
        flavor,
        url,
        embedUrl,
        title: provider || "Music",
      },
    };
  }

  // news + generic link — store the URL; no required embed.
  const host = safeHostname(url);
  return {
    ok: true,
    drop: {
      flavor,
      url,
      title: host || (flavor === "news" ? "News" : "Link"),
    },
  };
}
