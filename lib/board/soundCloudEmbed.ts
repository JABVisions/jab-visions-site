/** SoundCloud widget URLs. The player rejects nested player links, short
 *  share hosts, and tracking query strings with "not a valid SoundCloud URL". */

const PLAYER = "https://w.soundcloud.com/player/";
const TRACKING_PARAMS = /^(si|utm_|fbclid|gclid|igshid|ref|ref_)/i;
const BLOCKED_PATHS = new Set([
  "",
  "discover",
  "feed",
  "you",
  "settings",
  "pages",
  "search",
  "signin",
  "signup",
  "upload",
  "messages",
  "notifications",
  "library",
]);

function withProtocol(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(withProtocol(raw));
  } catch {
    return null;
  }
}

export function isSoundCloudHost(host: string) {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return (
    h === "soundcloud.com" ||
    h.endsWith(".soundcloud.com") ||
    h === "snd.sc" ||
    h.endsWith(".snd.sc")
  );
}

export function isSoundCloudUrl(raw: string | null | undefined) {
  if (!raw?.trim()) return false;
  const url = parseUrl(raw);
  return Boolean(url && isSoundCloudHost(url.hostname));
}

function isPlayerUrl(url: URL) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  return host === "w.soundcloud.com" && url.pathname.startsWith("/player");
}

function isApiResource(url: URL) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  return host === "api.soundcloud.com" && url.pathname.split("/").filter(Boolean).length >= 2;
}

function isShortHost(host: string) {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return h === "on.soundcloud.com" || h === "snd.sc" || h.endsWith(".snd.sc");
}

function stripTracking(url: URL) {
  const next = new URL(url.toString());
  for (const key of [...next.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) next.searchParams.delete(key);
  }
  return next;
}

/** Peel nested `w.soundcloud.com/player/?url=` wrappers down to the resource. */
export function unwrapSoundCloudPlayerUrl(raw: string, depth = 0): string | null {
  if (depth > 4) return null;
  const url = parseUrl(raw);
  if (!url) return null;
  if (!isPlayerUrl(url)) return url.toString();
  const inner = url.searchParams.get("url");
  if (!inner) return null;
  return unwrapSoundCloudPlayerUrl(inner, depth + 1);
}

export function soundCloudResourceUrl(raw: string): string | null {
  const unwrapped = unwrapSoundCloudPlayerUrl(raw);
  if (!unwrapped) return null;
  const url = parseUrl(unwrapped);
  if (!url || (!isSoundCloudHost(url.hostname) && !isApiResource(url))) return null;

  if (isApiResource(url)) {
    url.hash = "";
    url.search = "";
    url.protocol = "https:";
    return url.toString();
  }

  const clean = stripTracking(url);
  clean.hash = "";
  const host = clean.hostname.replace(/^www\./i, "").replace(/^m\./i, "").toLowerCase();

  if (isShortHost(host)) {
    const path = clean.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return null;
    clean.hostname = host;
    clean.protocol = "https:";
    clean.pathname = path;
    clean.search = "";
    return clean.toString();
  }

  const parts = clean.pathname.split("/").filter(Boolean);
  if (!parts.length || BLOCKED_PATHS.has(parts[0].toLowerCase())) return null;

  clean.hostname = "soundcloud.com";
  clean.protocol = "https:";
  clean.pathname = `/${parts.join("/")}`;
  clean.search = "";
  return clean.toString();
}

export function soundCloudPlayerUrl(resource: string) {
  return `${PLAYER}?url=${encodeURIComponent(resource)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true&show_artwork=true`;
}

export function extractSoundCloudIframeSrc(html: string | null | undefined) {
  if (!html) return null;
  const match = html.match(/\bsrc=["']([^"']+)["']/i);
  const src = match?.[1]?.trim();
  if (!src || !isSoundCloudUrl(src)) return null;
  return src;
}

/** Sync widget src. Unwraps nested players; short links still need oEmbed. */
export function toSoundCloudEmbed(rawUrl: string): string | null {
  const resource = soundCloudResourceUrl(rawUrl);
  if (!resource) return null;
  return soundCloudPlayerUrl(resource);
}

async function followSoundCloudRedirect(url: string) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

async function oEmbedPlayerSrc(resource: string) {
  const endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(resource)}`;
  const res = await fetch(endpoint, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { html?: string };
  return extractSoundCloudIframeSrc(data?.html);
}

/** Resolve a paste/share/player URL into the widget src SoundCloud actually plays. */
export async function resolveSoundCloudEmbed(rawUrl: string): Promise<string | null> {
  const resource = soundCloudResourceUrl(rawUrl);
  if (!resource) return null;

  const parsed = parseUrl(resource);
  if (parsed && isApiResource(parsed)) return soundCloudPlayerUrl(resource);

  try {
    const direct = await oEmbedPlayerSrc(resource);
    if (direct) return direct;
  } catch {
    /* try the canonical redirect next */
  }

  if (parsed && isShortHost(parsed.hostname)) {
    const followed = await followSoundCloudRedirect(resource);
    if (followed && followed !== resource) {
      try {
        const fromRedirect = await oEmbedPlayerSrc(soundCloudResourceUrl(followed) || followed);
        if (fromRedirect) return fromRedirect;
      } catch {
        /* fallback below */
      }
      const fallback = toSoundCloudEmbed(followed);
      if (fallback) return fallback;
    }
  }

  return soundCloudPlayerUrl(resource);
}
