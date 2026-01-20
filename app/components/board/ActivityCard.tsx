// File: app/components/board/ActivityCard.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { BoardActivity } from "@/lib/board/activity";

const EVT_DEPOSIT = "board:bucketBrain:deposit";
const EVT_OPEN = "board:bucketBrain:open";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------- embed helpers --------------------------- */

type EmbedKind =
  | "youtube"
  | "spotify"
  | "soundcloud"
  | "image"
  | "video"
  | "audio"
  | "none";

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function getExt(url: string) {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function guessMediaKind(url: string): EmbedKind {
  const ext = getExt(url);

  // Images
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return "image";

  // Video
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";

  // Audio
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";

  return "none";
}

function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "") || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return (
        u.searchParams.get("v") ||
        u.pathname.split("/").filter(Boolean).pop() ||
        null
      );
    }
  } catch {}
  return null;
}

function toYouTubeEmbed(url: string, origin?: string): string | null {
  const id = ytId(url);
  if (!id) return null;

  const params = new URLSearchParams({
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
  });

  if (origin) params.set("origin", origin);

  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/open\.spotify\.com$/i.test(u.hostname)) return null;
    return `https://open.spotify.com/embed${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * ✅ FIX: only treat URLs as SoundCloud if they are actually SoundCloud domains.
 */
function toSoundCloudEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    const isSC =
      host === "soundcloud.com" ||
      host.endsWith(".soundcloud.com") ||
      host === "snd.sc" ||
      host.endsWith(".snd.sc") ||
      host === "on.soundcloud.com" ||
      host.endsWith(".on.soundcloud.com");

    if (!isSC) return null;

    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
      url
    )}&auto_play=false&visual=true`;
  } catch {
    return null;
  }
}

function computeEmbed(href: string): { kind: EmbedKind; url: string } {
  if (!href) return { kind: "none", url: "" };

  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  // 1) YouTube
  const yt = toYouTubeEmbed(href, origin);
  if (yt) return { kind: "youtube", url: yt };

  // 2) Spotify
  const sp = toSpotifyEmbed(href);
  if (sp) return { kind: "spotify", url: sp };

  // 3) SoundCloud (ONLY if soundcloud hostname)
  const sc = toSoundCloudEmbed(href);
  if (sc) return { kind: "soundcloud", url: sc };

  // 4) Media files (image/video/audio)
  const mk = guessMediaKind(href);
  if (mk !== "none") return { kind: mk, url: href };

  return { kind: "none", url: "" };
}

/* --------------------------- component --------------------------- */

type Props = {
  item: BoardActivity;
  compact?: boolean;
  openBucketOnSignal?: boolean; // feels “command-center-ish”
};

export default function ActivityCard({
  item,
  compact,
  openBucketOnSignal = false,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);

  const title = item?.title || "Drop";
  const body = (item as any)?.body || (item as any)?.text || "";
  const id = String((item as any)?.id || "");

  // Be tolerant: href can be stored a few ways depending on older drops
  const href =
    (typeof (item as any)?.href === "string" && (item as any).href) ||
    (typeof (item as any)?.url === "string" && (item as any).url) ||
    (typeof (item as any)?.link === "string" && (item as any).link) ||
    "";

  const kindLabel = useMemo(() => {
    const k = String((item as any)?.kind || (item as any)?.type || "drop");
    return k.toUpperCase();
  }, [item]);

  const embed = useMemo(() => computeEmbed(href), [href]);
  const external = href ? isExternalHref(href) : false;

  // Show embed unless user forces fallback or embed fails
  const showEmbed = !!embed.url && !embedFailed && embed.kind !== "none";

  function signal(folder: "pass" | "pin" | "push") {
    if (!id) return;

    window.dispatchEvent(
      new CustomEvent(EVT_DEPOSIT, {
        detail: { folder, activityId: id },
      })
    );

    if (openBucketOnSignal) {
      window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
    }

    const word = folder === "pass" ? "PASS" : folder === "pin" ? "PIN" : "PUSH";
    setToast(`${word} saved to Bucket`);
    window.setTimeout(() => setToast(null), 1200);
  }

  return (
    <div className={clsx("card", compact && "compact")}>
      <div className="head">
        <div className="kind">{kindLabel}</div>
        <div className="title">{title}</div>
      </div>

      {body ? <div className="body">{body}</div> : null}

      {/* ✅ EMBED (now media-aware) */}
      {showEmbed ? (
        <div className={clsx("embed", embed.kind)}>
          {embed.kind === "image" && (
            <div className="mediaFrame">
              <img
                src={embed.url}
                alt={title || "Media drop"}
                className="img"
                loading="lazy"
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {embed.kind === "video" && (
            <div className="mediaFrame">
              <video
                className="vid"
                src={embed.url}
                controls
                playsInline
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {embed.kind === "audio" && (
            <div className="mediaFrame">
              <audio
                className="aud"
                src={embed.url}
                controls
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {(embed.kind === "youtube" ||
            embed.kind === "spotify" ||
            embed.kind === "soundcloud") && (
            <iframe
              title={`embed-${embed.kind}-${id}`}
              src={embed.url}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setEmbedFailed(true)}
            />
          )}

          <div className="embedFoot">
            {href ? (
              <a
                className="embedLink"
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
              >
                Open attachment
              </a>
            ) : (
              <span className="embedLink dim">No attachment</span>
            )}

            {href ? (
              <button
                type="button"
                className="embedFallback"
                onClick={() => setEmbedFailed(true)}
                title="If the embed is blocked, switch to link view"
              >
                Embed blocked? Show link
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* fallback link view */}
      {!showEmbed && href ? (
        <a
          className="href"
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {href}
        </a>
      ) : null}

      {/* ✅ Reaction rail stays in card */}
      <div className="rail" aria-label="Reaction rail">
        <button
          type="button"
          className="rbtn pass"
          onClick={() => signal("pass")}
          title="PASS (acknowledge)"
        >
          <span className="glyph" aria-hidden>
            <PassGlyph />
          </span>
          <span className="lbl">PASS</span>
        </button>

        <button
          type="button"
          className="rbtn pin"
          onClick={() => signal("pin")}
          title="PIN (save)"
        >
          <span className="glyph" aria-hidden>
            <StarGlyph />
          </span>
          <span className="lbl">PIN</span>
        </button>

        <button
          type="button"
          className="rbtn push"
          onClick={() => signal("push")}
          title="PUSH (boost)"
        >
          <span className="glyph" aria-hidden>
            <ArrowGlyph />
          </span>
          <span className="lbl">PUSH</span>
        </button>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}

      <style jsx>{`
        .card {
          position: relative;
          border-radius: 22px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.1);
          padding: 12px;
          overflow: hidden;
        }

        .head {
          display: grid;
          gap: 6px;
        }

        .kind {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0, 140, 135, 0.95);
        }

        .title {
          font-size: 14px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.76);
          letter-spacing: 0.02em;
        }

        .body {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.58);
          white-space: pre-wrap;
          line-height: 1.45;
        }

        /* embed */
        .embed {
          margin-top: 12px;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.04);
        }

        iframe {
          width: 100%;
          height: 240px;
          border: none;
          display: block;
          background: rgba(255, 255, 255, 0.06);
        }

        .embed.spotify iframe {
          height: 160px;
        }

        .mediaFrame {
          background: rgba(0, 0, 0, 0.06);
        }

        .img {
          width: 100%;
          height: auto;
          display: block;
        }

        .vid {
          width: 100%;
          display: block;
          background: #000;
          max-height: 520px;
        }

        .aud {
          width: 100%;
          display: block;
          padding: 10px;
        }

        .embedFoot {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.55);
          border-top: 1px solid rgba(0, 0, 0, 0.08);
        }

        .embedLink {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .embedLink.dim {
          color: rgba(0, 0, 0, 0.45);
          text-decoration: none;
        }

        .embedFallback {
          border-radius: 999px;
          padding: 8px 10px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.82);
          color: rgba(0, 0, 0, 0.7);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .href {
          display: inline-block;
          margin-top: 10px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
          word-break: break-word;
        }

        .rail {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .rbtn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.82);
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease;
        }

        .rbtn:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .glyph {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
        }

        .lbl {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }

        .pass:hover {
          box-shadow: 0 0 0 6px rgba(0, 140, 135, 0.08);
        }
        .pin:hover {
          box-shadow: 0 0 0 6px rgba(255, 0, 190, 0.08);
        }
        .push:hover {
          box-shadow: 0 0 0 6px rgba(120, 255, 240, 0.1);
        }

        .toast {
          position: absolute;
          right: 12px;
          bottom: 12px;
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.06em;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.72);
        }

        .compact .body {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

/* ---------- glyphs ---------- */

function PassGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.3 11.1V6.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V10"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.1 12.2l-.2-2.1c-.08-.9-.83-1.55-1.7-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.4 9.8l6.7-.9L12 2.8z"
        fill="transparent"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4l7 7-1.7 1.7L13.2 8.6V20h-2.4V8.6L6.7 12.7 5 11l7-7z"
        fill="transparent"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
