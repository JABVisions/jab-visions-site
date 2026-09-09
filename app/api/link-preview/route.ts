import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

// ---- SSRF guard --------------------------------------------------------------
// This endpoint fetches user-supplied URLs server-side, so it must never be
// allowed to reach internal/private network addresses (cloud metadata
// endpoints, localhost services, etc).

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1024 * 1024; // 1 MB is plenty for <head> metadata

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

function isPrivateIpv4(ip: string) {
  const p = ipv4ToParts(ip);
  if (!p) return true; // unparseable -> refuse
  const [a, b] = p;
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || // 192.0.0.0/24 special-purpose
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  );
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version !== 6) return true;

  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:1.2.3.4) — check the embedded IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return (
    lower === "::" ||
    lower === "::1" || // loopback
    lower.startsWith("fc") || // unique local fc00::/7
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // link-local fe80::/10
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff") // multicast
  );
}

// Throws if the URL is not a safe, public http(s) address.
async function assertPublicUrl(raw: string): Promise<URL> {
  if (raw.length > MAX_URL_LENGTH) throw new Error("URL too long");

  const url = new URL(raw); // throws on garbage
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (!hostname) throw new Error("Missing host");

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private address blocked");
    return url;
  }

  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal")
  ) {
    throw new Error("Internal host blocked");
  }

  const addresses = await lookup(lowerHost, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("Host resolves to a private address");
  }

  return url;
}

// Read at most MAX_HTML_BYTES from the response body.
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;

  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  void reader.cancel().catch(() => {});
  return out;
}

type Preview = {
  url: string;
  provider: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  embedUrl: string | null;
  type: "youtube" | "spotify" | "image" | "video" | "link";
};

function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function absUrl(base: string, maybe: string | null) {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return maybe;
  }
}

function isLikelyImageUrl(u: string) {
  return /\.(png|jpg|jpeg|gif|webp|avif)(\?.*)?$/i.test(u);
}

function isLikelyVideoUrl(u: string) {
  return /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(u);
}

function youtubeId(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function spotifyEmbed(u: string): string | null {
  try {
    const url = new URL(u);
    if (!url.hostname.includes("spotify.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (!type || !id) return null;
    return `https://open.spotify.com/embed/${type}/${id}`;
  } catch {
    return null;
  }
}

function guessType(u: string): Preview["type"] {
  const h = host(u);
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("spotify.com")) return "spotify";
  if (isLikelyImageUrl(u)) return "image";
  if (isLikelyVideoUrl(u)) return "video";
  return "link";
}

// Unfurl/crawler user-agents. Instagram, Facebook, and many other sites only
// emit their og:image tags to a known link-preview bot, so we try that first
// and fall back to a regular browser UA for sites that block bots.
const UNFURL_UAS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
];

async function fetchHtmlWith(url: string, userAgent: string) {
  try {
    // Follow redirects manually so every hop is re-validated against the
    // SSRF guard (a public URL must not be able to bounce us to a private one).
    let current = (await assertPublicUrl(url)).toString();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(current, {
          headers: {
            "user-agent": userAgent,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
          },
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        const next = new URL(location, current).toString();
        current = (await assertPublicUrl(next)).toString();
        continue;
      }

      if (!res.ok) return null;

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
      return await readCapped(res);
    }

    return null; // too many redirects
  } catch {
    return null;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Attribute-order-independent <meta> reader. Handles both
// `<meta property="og:image" content="…">` and `<meta content="…" property="og:image">`.
function meta(html: string, key: string) {
  const k = escapeRe(key);

  const beforeContent = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${k}["'][^>]*?\\bcontent\\s*=\\s*["']([^"']*)["']`,
    "i"
  );
  const afterContent = new RegExp(
    `<meta[^>]+\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name|itemprop)\\s*=\\s*["']${k}["']`,
    "i"
  );

  const hit = html.match(beforeContent)?.[1] ?? html.match(afterContent)?.[1] ?? null;
  return hit ? decodeEntities(hit.trim()) : null;
}

// `<link rel="image_src" href="…">` (older sites / some CMSes).
function linkRelHref(html: string, rel: string) {
  const r = escapeRe(rel);
  const relFirst = new RegExp(
    `<link[^>]+rel\\s*=\\s*["']${r}["'][^>]*?\\bhref\\s*=\\s*["']([^"']*)["']`,
    "i"
  );
  const hrefFirst = new RegExp(
    `<link[^>]+\\bhref\\s*=\\s*["']([^"']*)["'][^>]*?rel\\s*=\\s*["']${r}["']`,
    "i"
  );
  const hit = html.match(relFirst)?.[1] ?? html.match(hrefFirst)?.[1] ?? null;
  return hit ? decodeEntities(hit.trim()) : null;
}

function pickImage(html: string) {
  return (
    meta(html, "og:image:secure_url") ??
    meta(html, "og:image:url") ??
    meta(html, "og:image") ??
    meta(html, "twitter:image:src") ??
    meta(html, "twitter:image") ??
    meta(html, "image") ??
    linkRelHref(html, "image_src") ??
    null
  );
}

// Scrape OG metadata, preferring whichever UA actually yields an image.
async function scrapeOg(raw: string) {
  let best: { html: string; image: string | null } | null = null;

  for (const ua of UNFURL_UAS) {
    const html = await fetchHtmlWith(raw, ua);
    if (!html) continue;

    const image = pickImage(html);
    if (image) return { html, image };
    if (!best) best = { html, image: null };
  }

  return best;
}

// ---- Instagram --------------------------------------------------------------
// Instagram post/reel pages are login-gated for server fetches, so og:image
// often isn't returned. The PUBLIC embed endpoint (/embed/) is NOT gated and
// exposes the post's image — this is the same image iMessage/link unfurlers
// surface. We pull it from the embed page's JSON blobs or <img> tag.

function instagramShortcode(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(
      (p) => p === "p" || p === "reel" || p === "reels" || p === "tv"
    );
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return null;
  } catch {
    return null;
  }
}

// Unescape a URL captured from a JSON blob (& -> &, \/ -> /).
function unescapeJsonUrl(s: string) {
  return decodeEntities(s.replace(/\\u0026/gi, "&").replace(/\\\//g, "/"));
}

async function instagramPreview(raw: string): Promise<Preview | null> {
  const code = instagramShortcode(raw);
  if (!code) return null;

  const embedPage = `https://www.instagram.com/p/${code}/embed/captioned/`;
  // The embed page is served to normal browsers; use the browser UA.
  const html =
    (await fetchHtmlWith(embedPage, UNFURL_UAS[1])) ??
    (await fetchHtmlWith(`https://www.instagram.com/p/${code}/embed/`, UNFURL_UAS[1]));
  if (!html) return null;

  const jsonImg =
    html.match(/"display_url"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/"thumbnail_src"\s*:\s*"([^"]+)"/i)?.[1] ??
    null;

  const tagImg =
    html.match(/class="[^"]*EmbeddedMediaImage[^"]*"[^>]*\bsrc="([^"]+)"/i)?.[1] ??
    html.match(/<img[^>]+\bsrc="([^"]+)"[^>]*class="[^"]*EmbeddedMediaImage[^"]*"/i)?.[1] ??
    null;

  const ogImg = pickImage(html);

  const image =
    (jsonImg && unescapeJsonUrl(jsonImg)) ||
    (tagImg && decodeEntities(tagImg)) ||
    ogImg ||
    null;

  if (!image) return null;

  return {
    url: raw,
    provider: "instagram",
    title: meta(html, "og:title"),
    description: meta(html, "og:description"),
    image,
    embedUrl: null,
    type: "image",
  };
}

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.linkPreview);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("url") || "").trim();

  if (!raw || raw.length > MAX_URL_LENGTH) {
    const out: Preview = {
      url: "",
      provider: null,
      title: null,
      description: null,
      image: null,
      embedUrl: null,
      type: "link",
    };
    return NextResponse.json(out, { status: 200 });
  }

  // direct assets
  if (isLikelyImageUrl(raw)) {
    const out: Preview = {
      url: raw,
      provider: host(raw) || null,
      title: null,
      description: null,
      image: raw,
      embedUrl: null,
      type: "image",
    };
    return NextResponse.json(out, { status: 200 });
  }

  if (isLikelyVideoUrl(raw)) {
    const out: Preview = {
      url: raw,
      provider: host(raw) || null,
      title: null,
      description: null,
      image: null,
      embedUrl: raw,
      type: "video",
    };
    return NextResponse.json(out, { status: 200 });
  }

  // ✅ YouTube = guaranteed thumbnail
  const yid = youtubeId(raw);
  if (yid) {
    const out: Preview = {
      url: raw,
      provider: "youtube",
      title: null,
      description: null,
      image: `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${yid}`,
      type: "youtube",
    };
    return NextResponse.json(out, { status: 200 });
  }

  // Spotify embed
  const sp = spotifyEmbed(raw);
  if (sp) {
    const out: Preview = {
      url: raw,
      provider: "spotify",
      title: null,
      description: null,
      image: null,
      embedUrl: sp,
      type: "spotify",
    };
    return NextResponse.json(out, { status: 200 });
  }

  // Instagram = pull the real post image from the public embed endpoint.
  try {
    const ig = await instagramPreview(raw);
    if (ig?.image) {
      return NextResponse.json(
        { ...ig, image: resolveLinkPreviewImage(raw, ig.image) },
        { status: 200 }
      );
    }
  } catch {
    // fall through to the generic OG scrape below
  }

  // OG scrape fallback
  try {
    const scraped = await scrapeOg(raw);
    if (!scraped) {
      const out: Preview = {
        url: raw,
        provider: host(raw) || null,
        title: null,
        description: null,
        image: resolveLinkPreviewImage(raw, null),
        embedUrl: null,
        type: guessType(raw),
      };
      return NextResponse.json(out, { status: 200 });
    }

    const { html } = scraped;
    const title = meta(html, "og:title") ?? meta(html, "twitter:title");
    const description = meta(html, "og:description") ?? meta(html, "twitter:description");
    const image = scraped.image ?? pickImage(html);
    const embed =
      meta(html, "og:video:secure_url") ??
      meta(html, "og:video") ??
      meta(html, "twitter:player");

    const out: Preview = {
      url: raw,
      provider: host(raw) || null,
      title,
      description,
      image: resolveLinkPreviewImage(raw, absUrl(raw, image)),
      embedUrl: absUrl(raw, embed),
      type: guessType(raw),
    };

    return NextResponse.json(out, { status: 200 });
  } catch {
    const out: Preview = {
      url: raw,
      provider: host(raw) || null,
      title: null,
      description: null,
      image: resolveLinkPreviewImage(raw, null),
      embedUrl: null,
      type: guessType(raw),
    };
    return NextResponse.json(out, { status: 200 });
  }
}
