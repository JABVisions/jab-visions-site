"use client";

export type UniversalDropType =
  | "youtube"
  | "music"
  | "video"
  // removed: "photo"
  // removed: "audio"
  | "link"
  | "doc"
  | "project"
  | "thought";
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

  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  authorAvatar?: string;
  authorGlow?: string;
  authorAuraIntensity?: number;

  imageUrl?: string;
  mediaUrl?: string;
  mediaKind?: "image" | "video" | "audio";
  visibility?: "public" | "private";
  thoughtFormat?: "text" | "voice" | "doodle";
  thoughtText?: string;

  projectId?: string;
  projectType?: string;
  projectStatus?: string;
  goal?: string;
  milestone?: string;
  source?: string;
  origin?: string;
  meta?: Record<string, any>;
};

export const DROPS_KEY = "jab_board_drops_v2";
export const DROPS_UPDATED_EVENT = "board:drops:updated";

function parseStoredDrops(raw: string | null): UniversalDrop[] {
  if (!raw) return [];
  try {
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
        authorId: typeof x.authorId === "string" ? x.authorId : undefined,
        authorName: typeof x.authorName === "string" ? x.authorName : undefined,
        authorUsername:
          typeof x.authorUsername === "string" ? x.authorUsername : undefined,
        authorAvatar: typeof x.authorAvatar === "string" ? x.authorAvatar : undefined,
        authorGlow: typeof x.authorGlow === "string" ? x.authorGlow : undefined,
        authorAuraIntensity:
          typeof x.authorAuraIntensity === "number" ? x.authorAuraIntensity : undefined,
        imageUrl: typeof x.imageUrl === "string" ? x.imageUrl : undefined,
        mediaUrl: typeof x.mediaUrl === "string" ? x.mediaUrl : undefined,
        mediaKind:
          x.mediaKind === "image" || x.mediaKind === "video" || x.mediaKind === "audio"
            ? x.mediaKind
            : undefined,
        visibility:
          x.visibility === "private" || x.visibility === "public"
            ? x.visibility
            : undefined,
        thoughtFormat:
          x.thoughtFormat === "text" ||
          x.thoughtFormat === "voice" ||
          x.thoughtFormat === "doodle"
            ? x.thoughtFormat
            : undefined,
        thoughtText: typeof x.thoughtText === "string" ? x.thoughtText : undefined,
        projectId: typeof x.projectId === "string" ? x.projectId : undefined,
        projectType: typeof x.projectType === "string" ? x.projectType : undefined,
        projectStatus:
          typeof x.projectStatus === "string" ? x.projectStatus : undefined,
        goal: typeof x.goal === "string" ? x.goal : undefined,
        milestone: typeof x.milestone === "string" ? x.milestone : undefined,
        source: typeof x.source === "string" ? x.source : undefined,
        origin: typeof x.origin === "string" ? x.origin : undefined,
        meta:
          x.meta && typeof x.meta === "object" && !Array.isArray(x.meta)
            ? x.meta
            : undefined,
      }))
      .filter((d) => d.id && d.type && d.type !== "pay") as UniversalDrop[];
  } catch {
    return [];
  }
}

function dropFamily(drop: UniversalDrop): "streaming_music" | "stored_video" | "other" {
  const origin = String(drop.origin || drop.meta?.origin || "").toLowerCase();
  if (origin === "project_room" || drop.mediaKind === "video" || drop.type === "video") {
    return "stored_video";
  }
  const href = String(drop.url || drop.embedUrl || drop.mediaUrl || "").toLowerCase();
  if (
    drop.type === "music" ||
    href.includes("soundcloud.com") ||
    href.includes("spotify.com") ||
    href.includes("music.apple.com")
  ) {
    return "streaming_music";
  }
  return "other";
}

function dropFamiliesCompatible(left: UniversalDrop, right: UniversalDrop) {
  const a = dropFamily(left);
  const b = dropFamily(right);
  if (a === b) return true;
  if (a === "streaming_music" || b === "streaming_music") return false;
  if (a === "stored_video" || b === "stored_video") return a === "other" || b === "other";
  return true;
}

function preferMusicField(preferred?: string, fallback?: string) {
  const a = String(preferred || "");
  const b = String(fallback || "");
  if (/soundcloud\.com|spotify\.com|music\.apple\.com/i.test(a)) return a || undefined;
  if (/soundcloud\.com|spotify\.com|music\.apple\.com/i.test(b)) return b || undefined;
  return preferred || fallback;
}

function mergeUniversalDropCopies(previous: UniversalDrop, next: UniversalDrop): UniversalDrop {
  return {
    ...previous,
    ...next,
    url: preferMusicField(next.url, previous.url),
    embedUrl: preferMusicField(next.embedUrl, previous.embedUrl),
    mediaUrl: preferMusicField(next.mediaUrl, previous.mediaUrl),
    imageUrl: next.imageUrl || previous.imageUrl,
    meta: {
      ...(previous.meta && typeof previous.meta === "object" ? previous.meta : {}),
      ...(next.meta && typeof next.meta === "object" ? next.meta : {}),
      embedUrl:
        preferMusicField(
          next.meta?.embedUrl,
          previous.meta?.embedUrl
        ) || next.embedUrl || previous.embedUrl,
    },
  };
}

export function mergeUniversalDrops(items: UniversalDrop[]): UniversalDrop[] {
  const map = new Map<string, UniversalDrop>();
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id) continue;
    const family = dropFamily(item);
    const key = `${family}:${id}`;
    const previous = map.get(key);
    if (!previous) {
      const clash = [...map.values()].find(
        (existing) => existing.id === id && !dropFamiliesCompatible(existing, item)
      );
      if (clash) {
        map.set(key, item);
        continue;
      }
      const sameId = [...map.entries()].find(([, existing]) => existing.id === id);
      if (sameId && dropFamiliesCompatible(sameId[1], item)) {
        map.set(sameId[0], mergeUniversalDropCopies(sameId[1], item));
        continue;
      }
      map.set(key, item);
      continue;
    }
    map.set(key, mergeUniversalDropCopies(previous, item));
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function readDrops(): UniversalDrop[] {
  if (typeof window === "undefined") return [];
  try {
    const collected: UniversalDrop[] = [];
    const keys = new Set<string>([DROPS_KEY]);
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key === DROPS_KEY || key?.startsWith(`${DROPS_KEY}:`)) keys.add(key);
      }
    } catch {
      // keep the unscoped key
    }
    for (const key of keys) {
      collected.push(...parseStoredDrops(window.localStorage.getItem(key)));
    }
    return mergeUniversalDrops(collected);
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
  writeDrops(mergeUniversalDrops([drop, ...current]));
}

export function removeDrops(matcher: (drop: UniversalDrop) => boolean) {
  const current = readDrops();
  const next = current.filter((drop) => !matcher(drop));
  writeDrops(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DROPS_UPDATED_EVENT));
  }
  return next;
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
