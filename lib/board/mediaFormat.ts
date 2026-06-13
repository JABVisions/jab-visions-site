// File: lib/board/mediaFormat.ts
// Board Drop frames — portrait (4:5) is the default; landscape (16:9) for wide
// media. Stored in drop customizations (`effects.frame`), not the drop schema.

export const BOARD_DROP_ASPECT_W = 4;
export const BOARD_DROP_ASPECT_H = 5;

/** Use directly in CSS `aspect-ratio`. */
export const BOARD_DROP_ASPECT_CSS = `${BOARD_DROP_ASPECT_W} / ${BOARD_DROP_ASPECT_H}`;

/** Numeric ratio (width / height) for canvas crop math. */
export const BOARD_DROP_ASPECT_RATIO = BOARD_DROP_ASPECT_W / BOARD_DROP_ASPECT_H;

export const BOARD_DROP_LANDSCAPE_ASPECT_W = 16;
export const BOARD_DROP_LANDSCAPE_ASPECT_H = 9;
export const BOARD_DROP_LANDSCAPE_ASPECT_CSS = `${BOARD_DROP_LANDSCAPE_ASPECT_W} / ${BOARD_DROP_LANDSCAPE_ASPECT_H}`;
export const BOARD_DROP_LANDSCAPE_RATIO =
  BOARD_DROP_LANDSCAPE_ASPECT_W / BOARD_DROP_LANDSCAPE_ASPECT_H;

export type DropMediaFrame = "portrait" | "landscape";
export type DropMediaRotation = 0 | 90 | 180 | 270;

export function dropFrameAspectCss(frame: DropMediaFrame = "portrait"): string {
  return frame === "landscape" ? BOARD_DROP_LANDSCAPE_ASPECT_CSS : BOARD_DROP_ASPECT_CSS;
}

export function dropFrameAspectRatio(frame: DropMediaFrame = "portrait"): number {
  return frame === "landscape" ? BOARD_DROP_LANDSCAPE_RATIO : BOARD_DROP_ASPECT_RATIO;
}

export function detectDropFrameFromDimensions(width: number, height: number): DropMediaFrame {
  if (!width || !height) return "portrait";
  return width / height > 1.05 ? "landscape" : "portrait";
}

export function normalizeDropMediaRotation(value: unknown): DropMediaRotation {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

export function resolveDropMediaFrame(
  customizations?: { effects?: { frame?: string | null } | null } | null,
  intrinsic?: { width: number; height: number }
): DropMediaFrame {
  const saved = customizations?.effects?.frame;
  if (saved === "landscape" || saved === "portrait") return saved;
  if (intrinsic?.width && intrinsic?.height) {
    return detectDropFrameFromDimensions(intrinsic.width, intrinsic.height);
  }
  return "portrait";
}

const SOCIAL_MEDIA_HOSTS = [
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "threads.net",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "snapchat.com",
  "bsky.app",
];

/** YouTube, News, Link, and other URL-based drops — not uploaded Vision/Thought media. */
export function isLinkStyleBoardDrop(dropType: string): boolean {
  const dt = String(dropType || "")
    .toLowerCase()
    .trim();
  if (!dt) return false;
  return (
    dt.includes("youtube") ||
    dt === "news" ||
    dt === "link" ||
    dt.includes("linky")
  );
}

export function isSocialMediaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return SOCIAL_MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Link chips and embeds default to landscape 16:9; uploaded studio media keeps 4:5 unless rotated. */
export function resolveBoardDropDisplayFrame(
  customizations?: { effects?: { frame?: string | null } | null } | null,
  opts?: { dropType?: string; href?: string; intrinsic?: { width: number; height: number } }
): DropMediaFrame {
  const dropType = opts?.dropType ?? "";
  if (isLinkStyleBoardDrop(dropType)) return "landscape";
  if (opts?.href && isSocialMediaUrl(opts.href)) return "landscape";
  return resolveDropMediaFrame(customizations, opts?.intrinsic);
}

// Board photo output targets ≥1080px on the long edge — see lib/board/imageQuality.ts.
