import { NextResponse } from "next/server";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";

export const runtime = "nodejs";

type Preview = {
  url: string;
  provider: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  images?: string[];
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

function appleMusicEmbed(u: string): string | null {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    if (host === "embed.music.apple.com") return url.toString();
    if (host !== "music.apple.com" && !host.endsWith(".music.apple.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") {
      return `https://embed.music.apple.com/${parts.slice(1).join("/")}${url.search}`;
    }
    if (parts.length < 3) return null;
    return `https://embed.music.apple.com${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function soundCloudEmbed(u: string): string | null {
  try {
    const url = new URL(u);
    if (!url.hostname.toLowerCase().includes("soundcloud.com")) return null;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false&visual=true`;
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
    const res = await fetch(url, {
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
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

function plainText(value: string | null) {
  if (!value) return null;
  const text = decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return text || null;
}

function jsonLdHeadline(html: string) {
  const hit = html.match(/"headline"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1];
  if (!hit) return null;
  try {
    return plainText(JSON.parse(`"${hit}"`));
  } catch {
    return plainText(hit.replace(/\\"/g, '"'));
  }
}

function articleHeadline(html: string) {
  return (
    plainText(meta(html, "og:title")) ??
    plainText(meta(html, "twitter:title")) ??
    plainText(meta(html, "parsely-title")) ??
    plainText(meta(html, "sailthru.title")) ??
    plainText(meta(html, "headline")) ??
    jsonLdHeadline(html) ??
    plainText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? null) ??
    plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null)
  );
}

function pickArticleImages(base: string, html: string, lead: string | null) {
  const candidates: string[] = [];
  if (lead) candidates.push(lead);

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(?:og:image|twitter:image|itemprop=["']image)/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) candidates.push(decodeEntities(content));
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\b(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) candidates.push(decodeEntities(src));
  }

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const absolute = absUrl(base, candidate);
    if (!absolute || !/^https?:\/\//i.test(absolute)) continue;
    if (/\b(?:logo|icon|avatar|sprite|pixel|tracker|badge)\b/i.test(absolute)) continue;
    const key = absolute.replace(/[?#].*$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    images.push(absolute);
    if (images.length === 4) break;
  }
  return images;
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

async function readerPreview(raw: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`https://r.jina.ai/${raw}`, {
      headers: { accept: "text/plain" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const text = await response.text();
    const title = plainText(
      text.match(/^Title:\s*(.+)$/im)?.[1] ??
      text.match(/^#\s+(.+)$/m)?.[1] ??
      null
    );
    const images = Array.from(text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g))
      .map((match) => match[1])
      .filter((image) => !/\b(?:logo|icon|avatar|sprite|pixel|tracker|badge)\b/i.test(image))
      .slice(0, 4);
    return title || images.length ? { title, images } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("url") || "").trim();

  if (!raw) {
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

  const appleMusic = appleMusicEmbed(raw);
  if (appleMusic) {
    const out: Preview = {
      url: raw,
      provider: "apple_music",
      title: null,
      description: null,
      image: null,
      embedUrl: appleMusic,
      type: "link",
    };
    return NextResponse.json(out, { status: 200 });
  }

  const soundCloud = soundCloudEmbed(raw);
  if (soundCloud) {
    const out: Preview = {
      url: raw,
      provider: "soundcloud",
      title: null,
      description: null,
      image: null,
      embedUrl: soundCloud,
      type: "link",
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
      const reader = await readerPreview(raw);
      const out: Preview = {
        url: raw,
        provider: host(raw) || null,
        title: reader?.title ?? null,
        description: null,
        image: resolveLinkPreviewImage(raw, reader?.images[0] ?? null),
        images: reader?.images ?? [],
        embedUrl: null,
        type: guessType(raw),
      };
      return NextResponse.json(out, { status: 200 });
    }

    const { html } = scraped;
    const extractedTitle = articleHeadline(html);
    const reader = extractedTitle ? null : await readerPreview(raw);
    const title = extractedTitle ?? reader?.title ?? null;
    const description = meta(html, "og:description") ?? meta(html, "twitter:description");
    const image = scraped.image ?? pickImage(html);
    const images = pickArticleImages(raw, html, image);
    const allImages = Array.from(new Set([...images, ...(reader?.images ?? [])])).slice(0, 4);
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
      images: allImages.map((item) => resolveLinkPreviewImage(raw, item) ?? item),
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
