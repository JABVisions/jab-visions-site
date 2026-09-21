"use client";

import React, { useEffect, useState } from "react";
import { getCachedSignedMediaUrl } from "@/lib/board/signedMediaUrl";
import {
  projectCoverCoords,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";
import { playableFeedMediaSrc, playablePosterSrc } from "@/lib/board/feedDropMedia";
import { captureVideoPosterFile } from "@/lib/board/videoPoster";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ProjectCoverImage({
  media,
  title,
  className,
  placeholderClassName,
  fit = "cover",
}: {
  media?: ProjectCoverMedia | null;
  title: string;
  className?: string;
  placeholderClassName?: string;
  fit?: "cover" | "contain";
}) {
  const localSrc =
    media?.src?.startsWith("data:") || media?.src?.startsWith("blob:") ? media.src : "";
  const [src, setSrc] = useState(localSrc);
  const [poster, setPoster] = useState("");

  useEffect(() => {
    let cancelled = false;
    const coords = projectCoverCoords(media);
    const nextLocal =
      media?.src?.startsWith("data:") || media?.src?.startsWith("blob:") ? media.src : "";
    setSrc(nextLocal);
    setPoster("");

    if (!coords) {
      if (media?.kind === "image") {
        setSrc(playableFeedMediaSrc(media.src) || playablePosterSrc(media.src) || nextLocal);
      } else if (media?.kind === "video") {
        const playable = playableFeedMediaSrc(media.src);
        if (playable) setSrc(playable);
      }
      return;
    }

    void getCachedSignedMediaUrl(coords.bucket, coords.storagePath, {
      allowPublicFallback: coords.bucket !== "board-media",
    }).then(async (signed) => {
      if (cancelled || !signed) return;
      if (media?.kind === "video") {
        const playable = playableFeedMediaSrc(signed);
        if (playable) {
          setSrc(playable);
          const still = await captureVideoPosterFile(playable);
          if (!cancelled && still) setPoster(URL.createObjectURL(still));
        }
        return;
      }
      const still = playableFeedMediaSrc(signed) || playablePosterSrc(signed);
      if (still) setSrc(still);
    });

    return () => {
      cancelled = true;
    };
  }, [media?.src, media?.bucket, media?.storagePath, media?.kind]);

  const imageFitClass =
    fit === "contain"
      ? "h-auto w-full max-h-[min(90vh,56rem)] object-contain bg-black/40"
      : "h-full w-full object-cover";

  if (!src && !poster) {
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
    if (poster) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={title}
          className={clsx(fit === "contain" ? imageFitClass : "h-full w-full object-cover", className)}
        />
      );
    }
    return (
      <video
        src={src}
        poster={poster || undefined}
        className={clsx(fit === "contain" ? imageFitClass : "h-full w-full object-cover", className)}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      className={clsx(imageFitClass, className)}
    />
  );
}
