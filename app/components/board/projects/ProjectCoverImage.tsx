"use client";

import React, { useEffect, useState } from "react";
import { getCachedSignedMediaUrl } from "@/lib/board/signedMediaUrl";
import {
  projectCoverCoords,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ProjectCoverImage({
  media,
  title,
  className,
  placeholderClassName,
}: {
  media?: ProjectCoverMedia | null;
  title: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const fallbackSrc = media?.src?.startsWith("data:") || media?.src?.startsWith("blob:")
    ? media.src
    : media?.src || "";
  const [src, setSrc] = useState(fallbackSrc);

  useEffect(() => {
    let cancelled = false;
    const coords = projectCoverCoords(media);
    const nextFallback =
      media?.src?.startsWith("data:") || media?.src?.startsWith("blob:")
        ? media.src
        : media?.src || "";
    setSrc(nextFallback);

    if (!coords) return;

    void getCachedSignedMediaUrl(coords.bucket, coords.storagePath).then((signed) => {
      if (!cancelled && signed) setSrc(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [media?.src, media?.bucket, media?.storagePath, media?.kind]);

  if (!src) {
    if (projectCoverCoords(media)) {
      return (
        <div
          className={clsx("h-full w-full bg-black/40", className)}
          aria-hidden
        />
      );
    }
    return (
      <div
        className={clsx(
          "flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.16),transparent_48%),linear-gradient(180deg,rgba(12,12,20,0.92),rgba(4,4,8,0.98))]",
          placeholderClassName
        )}
      >
        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] tracking-[0.28em] text-white/55">
          PROJECT TILE
        </div>
      </div>
    );
  }

  if (media?.kind === "video") {
    return (
      <video
        src={src}
        className={clsx("h-full w-full object-cover", className)}
        muted
        playsInline
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      className={clsx("h-full w-full object-cover", className)}
    />
  );
}
