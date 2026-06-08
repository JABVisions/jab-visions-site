import { AssetKind, DropRoute } from "./types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function kindLabel(kind: AssetKind) {
  switch (kind) {
    case "media":
      return "Media Drop";
    case "music":
      return "Music Drop";
    case "youtube":
      return "YouTube Drop";
    case "doc":
      return "Doc Drop";
    case "link":
      return "Link Drop";
    case "note":
      return "Note Drop";
  }
}

export function kindEmoji(kind: AssetKind) {
  switch (kind) {
    case "media":
      return "🖼️";
    case "music":
      return "🎧";
    case "youtube":
      return "📺";
    case "doc":
      return "📄";
    case "link":
      return "🔗";
    case "note":
      return "📝";
  }
}

export function RouteTitle(route: DropRoute) {
  switch (route) {
    case "home":
      return "Home";
    case "feed":
      return "Feed";
    case "forums":
      return "Forums";
    case "work":
      return "Work";
    case "profile":
      return "Profile";
    case "friend-zone":
      return "Friend Zone";
    case "options":
      return "Options";
    case "explore":
      return "Explore";
    default:
      return "Drop Pad";
  }
}

export function safeHostname(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseYouTubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return id;
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "" };
  const id = parseYouTubeId(url);
  if (!id) return { embedUrl: "" };
  return { embedUrl: `https://www.youtube.com/embed/${id}` };
}

export function parseSpotify(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("open.spotify.com") && u.pathname.startsWith("/embed/")) {
      return { embedUrl: url, label: "Spotify" };
    }
    if (!u.hostname.includes("open.spotify.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const type = parts[0];
      const id = parts[1];
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      return { embedUrl, label: "Spotify" };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSoundCloud(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("soundcloud.com") && !u.hostname.includes("snd.sc")) return null;
    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
    return { embedUrl, label: "SoundCloud" };
  } catch {
    return null;
  }
}

export function parseAppleMusic(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "embed.music.apple.com") return { embedUrl: url, label: "Apple Music" };
    if (host !== "music.apple.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") {
      return {
        embedUrl: `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`,
        label: "Apple Music",
      };
    }
    if (parts.length < 3) return null;

    return { embedUrl: `https://embed.music.apple.com${u.pathname}${u.search}`, label: "Apple Music" };
  } catch {
    return null;
  }
}

export function buildMusicEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "", provider: "" };

  const sp = parseSpotify(url);
  if (sp) return { embedUrl: sp.embedUrl, provider: sp.label };

  const sc = parseSoundCloud(url);
  if (sc) return { embedUrl: sc.embedUrl, provider: sc.label };

  const am = parseAppleMusic(url);
  if (am) return { embedUrl: am.embedUrl, provider: am.label };

  return { embedUrl: "", provider: "" };
}

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
