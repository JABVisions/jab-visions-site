"use client";

export type UniversalDropType =
  | "youtube"
  | "music"
  | "video"
  // removed: "photo"
  // removed: "audio"
  | "link"
  | "doc"
  | "project";
// intentionally NOT including "pay"

export type UniversalDrop = {
  id: string;
  type: UniversalDropType;
  title: string;
  createdAt: number;

  url?: string;
  embedUrl?: string;
  description?: string;
  tags?: string[];
};

export const DROPS_KEY = "jab_board_drops_v2";

export function readDrops(): UniversalDrop[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DROPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id ?? ""),
        type: String(x.type ?? "").toLowerCase(),
        title: String(x.title ?? "Untitled"),
        createdAt: Number(x.createdAt ?? Date.now()),
        url:
          typeof x.url === "string"
            ? x.url
            : typeof x.linkUrl === "string"
              ? x.linkUrl
              : undefined,
        embedUrl: typeof x.embedUrl === "string" ? x.embedUrl : undefined,
        description: typeof x.description === "string" ? x.description : undefined,
        tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
      }))
      .filter((d) => d.id && d.type && d.type !== "pay") as UniversalDrop[];
  } catch {
    return [];
  }
}

export function writeDrops(drops: UniversalDrop[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = drops.slice(0, 250);
    window.localStorage.setItem(DROPS_KEY, JSON.stringify(trimmed));
  } catch {
    try {
      const trimmed = drops.slice(0, 80);
      window.localStorage.setItem(DROPS_KEY, JSON.stringify(trimmed));
    } catch {
      // swallow
    }
  }
}

export function pushDrop(drop: UniversalDrop) {
  const current = readDrops();
  const next = [drop, ...current].slice(0, 250);
  writeDrops(next);
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                 */
/* -------------------------------------------------------------------------- */

export function normalizeYouTubeEmbed(input: string) {
  const u = safeUrl(input);
  if (!u) return "";

  if (u.hostname.includes("youtu.be")) {
    const id = u.pathname.replace("/", "").trim();
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  if (u.hostname.includes("youtube.com")) {
    const id = u.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}`;
    if (u.pathname.startsWith("/embed/")) return u.toString();
  }

  return "";
}

export function normalizeSpotifyEmbed(input: string) {
  const u = safeUrl(input);
  if (!u) return "";

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const kind = parts[0];
    const id = parts[1];
    if (!kind || !id) return "";
    return `https://open.spotify.com/embed/${kind}/${id}`;
  }
  return "";
}

export function safeUrl(input: string) {
  try {
    const u = new URL(input);
    return u;
  } catch {
    return null;
  }
}
