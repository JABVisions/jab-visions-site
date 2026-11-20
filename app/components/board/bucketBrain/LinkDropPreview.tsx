"use client";

import { useEffect, useState } from "react";
import styles from "./workBoardPreview.module.css";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import {
  storedLinkThumbnail,
  type WorkBoardLibraryDrop,
} from "@/lib/board/brain/workBoardPreview";
import { safeHostname } from "@/lib/board/utils";

const thumbnailCache = new Map<string, string | null>();

function faviconFor(url: string) {
  const host = safeHostname(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : "";
}

function useLinkDropThumbnail(url: string, stored: string | null) {
  const [image, setImage] = useState<string | null>(stored || thumbnailCache.get(url) || null);

  useEffect(() => {
    if (stored) {
      setImage(stored);
      return;
    }
    const cached = thumbnailCache.get(url);
    if (cached !== undefined) {
      setImage(cached);
      return;
    }
    let cancelled = false;
    fetchLinkPreview(url)
      .then((preview) => {
        const raw = preview?.image || preview?.images?.find((item) => Boolean(item)) || null;
        return resolveLinkPreviewImage(url, raw);
      })
      .catch(() => null)
      .then((next) => {
        thumbnailCache.set(url, next);
        if (!cancelled) setImage(next);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, url]);

  return image;
}

export function LinkDropThumb({
  drop,
  href,
}: {
  drop: WorkBoardLibraryDrop;
  href: string;
}) {
  const stored = storedLinkThumbnail(drop);
  const image = useLinkDropThumbnail(href, stored);
  const [imageBroken, setImageBroken] = useState(false);
  const [faviconBroken, setFaviconBroken] = useState(false);
  const favicon = faviconFor(href);
  const showPhoto = Boolean(image) && !imageBroken;
  const src = showPhoto ? image : !faviconBroken ? favicon : "";

  useEffect(() => {
    setImageBroken(false);
    setFaviconBroken(false);
  }, [href, image]);

  if (!src) {
    return <span aria-hidden>{safeHostname(href) || "Link"}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={showPhoto ? undefined : styles.linkFavicon}
      onError={() => {
        if (showPhoto) setImageBroken(true);
        else setFaviconBroken(true);
      }}
    />
  );
}

export function LinkDropCard({
  drop,
  href,
}: {
  drop: WorkBoardLibraryDrop;
  href: string;
}) {
  const host = safeHostname(href);
  return (
    <div className={styles.linkCard}>
      <a
        className={styles.linkThumb}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${drop.title}`}
      >
        <LinkDropThumb drop={drop} href={href} />
      </a>
      {drop.description ? <p className={styles.linkDesc}>{drop.description}</p> : null}
      <a className={styles.dropLink} href={href} target="_blank" rel="noopener noreferrer">
        Drop link
        {host ? <span className={styles.dropLinkHost}>{host}</span> : null}
      </a>
    </div>
  );
}
