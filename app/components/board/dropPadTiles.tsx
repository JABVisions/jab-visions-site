"use client";

// Small presentational drop tiles for the DropPad OS surface.
// Extracted verbatim from DropPadOS.tsx. Styling is Tailwind-only.

import React from "react";
import { clsx, kindEmoji, safeHostname, type AssetItem } from "./dropPadShared";

/* -------------------------------------------------------------------------- */
/* UI tiles                                                                    */
/* -------------------------------------------------------------------------- */

export function TileFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-black/20 overflow-hidden",
        "shadow-[0_12px_44px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropHeader({
  emoji,
  title,
  meta,
  description,
}: {
  emoji: string;
  title: string;
  meta?: string;
  description?: string;
}) {
  return (
    <div className="px-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">{title}</div>
          {meta ? <div className="mt-1 text-xs text-white/50 truncate">{meta}</div> : null}
        </div>
        <div className="text-xl shrink-0">{emoji}</div>
      </div>

      {description ? (
        <div className="mt-2 text-xs text-white/55 line-clamp-2">{description}</div>
      ) : null}
    </div>
  );
}

export function MediaDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.mediaUrl;

  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("media")} title={a.title} meta="Image embed" description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="inline-block max-w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 align-top">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={a.title} className="block h-auto max-h-72 max-w-full object-contain" loading="lazy" />
          ) : (
            <div className="grid min-h-32 min-w-48 place-items-center text-sm text-white/50">No image</div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

export function MusicDropTile({ a }: { a: AssetItem }) {
  const embedUrl = a.payload?.embedUrl;
  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("music")} title={a.title} meta={embedUrl ? "Embedded player" : "No embed"} description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
          {embedUrl ? (
            <iframe
              title={a.title}
              src={embedUrl}
              className="w-full h-44"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          ) : (
            <div className="h-44 grid place-items-center text-sm text-white/50">Unsupported music link</div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

export function YouTubeDropTile({ a }: { a: AssetItem }) {
  const embedUrl = a.payload?.embedUrl;
  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("youtube")} title={a.title} meta={embedUrl ? "YouTube embed" : "No embed"} description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
          {embedUrl ? (
            <iframe
              title={a.title}
              src={embedUrl}
              className="w-full h-44"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="lazy"
            />
          ) : (
            <div className="h-44 grid place-items-center text-sm text-white/50">Invalid YouTube link</div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

export function LinkDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.url;
  const host = safeHostname(url);
  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("link")} title={a.title} meta={host ? host : "Link"} description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs tracking-[0.25em] text-white/45">LINK PREVIEW</div>
          <div className="mt-2 text-sm text-white/80 break-words">{url ?? "No URL"}</div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-3 text-sm text-lime-200/80 hover:text-lime-200 transition"
            >
              Open →
            </a>
          ) : null}
        </div>
      </div>
    </TileFrame>
  );
}

export function DocDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.url;
  const host = safeHostname(url);

  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("doc")} title={a.title} meta={host ? `Doc link • ${host}` : "Doc link"} description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs tracking-[0.25em] text-white/45">DOC DROP</div>
          <div className="mt-2 text-sm text-white/80 break-words">{url ?? "No URL"}</div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-3 text-sm text-lime-200/80 hover:text-lime-200 transition"
            >
              Open Doc →
            </a>
          ) : null}
          <div className="mt-3 text-xs text-white/45">(Next: embed previews + PDF thumbs.)</div>
        </div>
      </div>
    </TileFrame>
  );
}

export function NoteDropTile({ a }: { a: AssetItem }) {
  const text = a.payload?.text ?? "";
  return (
    <TileFrame>
      <DropHeader emoji={kindEmoji("note")} title={a.title} meta="Text note" description={a.description} />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/80 whitespace-pre-wrap">{text || "No note"}</div>
        </div>
      </div>
    </TileFrame>
  );
}

export function EmbeddedAssetTile({ a }: { a: AssetItem }) {
  switch (a.kind) {
    case "media":
      return <MediaDropTile a={a} />;
    case "music":
      return <MusicDropTile a={a} />;
    case "youtube":
      return <YouTubeDropTile a={a} />;
    case "link":
      return <LinkDropTile a={a} />;
    case "doc":
      return <DocDropTile a={a} />;
    case "note":
      return <NoteDropTile a={a} />;
    default:
      return <NoteDropTile a={a} />;
  }
}
