"use client";

import Link from "next/link";

type FeedDrop = {
  id: string;
  type: "status" | "forum" | "board" | "photo" | "link" | "system";
  title?: string;
  text: string;
  author?: string;
  createdAt: number;
  href?: string;
  tags?: string[];
  linkUrl?: string | null;
  provider?: string | null;
  linkType?: "video" | "music" | "link" | "photo" | "other";
  image?: string | null;
  embedUrl?: string | null;
};

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function cleanHost(url?: string | null) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
}

function embedClass(embedUrl?: string | null) {
  if (!embedUrl) return "other";
  const u = embedUrl.toLowerCase();
  if (u.includes("youtube")) return "youtube";
  if (u.includes("spotify")) return "spotify";
  if (u.includes("soundcloud")) return "soundcloud";
  return "other";
}

export default function RecentDrops({
  drops,
  openEmbeds,
  setOpenEmbeds,
}: {
  drops: FeedDrop[];
  openEmbeds: Record<string, boolean>;
  setOpenEmbeds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  if (!drops || drops.length === 0) {
    return (
      <div className="note-card">
        <div className="note-title">No drops yet.</div>
        <div className="note-text">Once Feed/Forums posts write to the shared stream, they show here.</div>
      </div>
    );
  }

  return (
    <div className="drops-like-soundtrack">
      {drops.slice(0, 5).map((d) => {
        const hasEmbed = !!d.embedUrl;
        const hasThumb = !!d.image;
        const embedOpen = !!openEmbeds[d.id];

        const externalUrl = d.linkUrl ?? d.href ?? null;
        const host = d.provider ?? cleanHost(d.linkUrl);

        const toggleLabel = embedOpen
          ? "Hide"
          : d.linkType === "music"
          ? "Play"
          : d.linkType === "video"
          ? "Watch"
          : "Open";

        return (
          <div key={d.id} className="music-item-embed">
            {/* TOP (match soundtrack header row) */}
            <div className="music-item-top">
              <div className="music-meta">
                <div className="music-title">{d.title || host || d.type.toUpperCase()}</div>
                <div className="music-sub">
                  <span className="badge">{d.type}</span>
                  <span className="badge">{timeAgo(d.createdAt)}</span>
                  {host ? <span className="badge">{host}</span> : null}

                  {externalUrl ? (
                    <a className="music-link" href={externalUrl} target="_blank" rel="noreferrer">
                      Open original
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Right-side button matches soundtrack "Remove" pill */}
              {hasEmbed ? (
                <button
                  type="button"
                  className="music-remove"
                  onClick={() => setOpenEmbeds((p) => ({ ...p, [d.id]: !p[d.id] }))}
                >
                  {toggleLabel}
                </button>
              ) : externalUrl ? (
                <a className="music-remove" href={externalUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
            </div>

            {/* MEDIA (exact embed-shell styling) */}
            {hasEmbed && embedOpen ? (
              <div className={`embed-shell ${embedClass(d.embedUrl)}`}>
                <iframe
                  src={d.embedUrl!}
                  title={`Embed: ${d.title ?? host ?? "drop"}`}
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : hasThumb ? (
              <a className="drop-thumb-like-music" href={externalUrl ?? "#"} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image!} alt="" />
              </a>
            ) : null}

            {/* TEXT */}
            {d.text ? <div className="drop-text-like-music">{d.text}</div> : null}

            {/* FOOTER */}
            <div className="drop-footer-like-music">
              <div className="drop-author-like-music">{d.author ? `by ${d.author}` : " "}</div>
              {d.href ? (
                <Link href={d.href} className="drop-open">
                  Open →
                </Link>
              ) : null}
            </div>

            {/* TAGS (reuse your existing tag styles) */}
            {d.tags && d.tags.length ? (
              <div className="drop-tags">
                {d.tags.slice(0, 4).map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
