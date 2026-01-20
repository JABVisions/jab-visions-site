"use client";

import React from "react";

type Props = {
  url: string;
  title?: string;
  className?: string;
};

function isYouTube(url: string) {
  return /(^|\/\/)(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function getYouTubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "") || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1] || null;
      return u.searchParams.get("v");
    }
  } catch {}
  return null;
}

function getYouTubeEmbedUrl(url: string) {
  const id = getYouTubeId(url);
  if (!id) return null;

  // origin helps some edge cases; playsinline keeps it in-tile on iOS
  const origin =
    typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";

  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${origin ? `&origin=${origin}` : ""}`;
}

export default function EmbedBlock({ url, title, className }: Props) {
  const ytEmbed = isYouTube(url) ? getYouTubeEmbedUrl(url) : null;

  if (ytEmbed) {
    return (
      <div
        className={[
          "rounded-2xl overflow-hidden border border-black/10 bg-white",
          "pointer-events-auto", // important if parent disables events
          className,
        ].join(" ")}
      >
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src={ytEmbed}
            title={title || "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Fallback hint */}
        <div className="px-3 py-2 text-xs text-black/60">
          If this video shows “Error 153,” the uploader likely disabled embedding.
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 underline"
          >
            Watch on YouTube
          </a>
        </div>
      </div>
    );
  }

  // Basic “link embed” fallback (you can expand this into rich cards per type)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={[
        "block rounded-2xl border border-black/10 bg-white p-4",
        "hover:bg-white/80 transition",
        className,
      ].join(" ")}
    >
      <div className="text-sm font-medium text-black">Open link</div>
      <div className="mt-1 text-xs text-black/60 break-all">{url}</div>
    </a>
  );
}
