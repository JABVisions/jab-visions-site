import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return null;
  return await res.text();
}

function meta(html: string, key: string) {
  const re = new RegExp(
    `<meta\\s+(?:property|name)=["']${key}["']\\s+content=["']([^"']+)["']\\s*/?>`,
    "i"
  );
  return html.match(re)?.[1]?.trim() ?? null;
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

  // OG scrape fallback
  try {
    const html = await fetchHtml(raw);
    if (!html) {
      const out: Preview = {
        url: raw,
        provider: host(raw) || null,
        title: null,
        description: null,
        image: null,
        embedUrl: null,
        type: guessType(raw),
      };
      return NextResponse.json(out, { status: 200 });
    }

    const title = meta(html, "og:title") ?? meta(html, "twitter:title");
    const description = meta(html, "og:description") ?? meta(html, "twitter:description");
    const image = meta(html, "og:image") ?? meta(html, "twitter:image");
    const embed =
      meta(html, "og:video:secure_url") ??
      meta(html, "og:video") ??
      meta(html, "twitter:player");

    const out: Preview = {
      url: raw,
      provider: host(raw) || null,
      title,
      description,
      image: absUrl(raw, image),
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
      image: null,
      embedUrl: null,
      type: guessType(raw),
    };
    return NextResponse.json(out, { status: 200 });
  }
}
