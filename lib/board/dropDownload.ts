/** Client-side helpers for downloading Board-owned drop files. */

export type DropDownloadKind =
  | "image"
  | "video"
  | "audio"
  | "doc"
  | "text"
  | "html"
  | "open-link"
  | "none";

function cleanExt(value: string): string {
  return value.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function slugifyDownloadName(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80);
  return slug || "board-drop";
}

export function buildDropDownloadFilename(opts: {
  title?: string | null;
  creator?: string | null;
  extension: string;
}): string {
  const creator = slugifyDownloadName(opts.creator?.trim() || "");
  const title = slugifyDownloadName(opts.title?.trim() || "vision-drop");
  const base =
    creator && title && creator !== title
      ? `${creator}-${title}`
      : title || creator || "board-drop";
  const ext = cleanExt(opts.extension) || "bin";
  return `${base.slice(0, 100)}.${ext}`;
}

function extFromNameOrUrl(value?: string | null): string {
  if (!value) return "";
  try {
    const path = value.includes("://") ? new URL(value).pathname : value;
    const leaf = path.split("/").pop() || "";
    const clean = leaf.split("?")[0].split("#")[0];
    const dot = clean.lastIndexOf(".");
    if (dot === -1) return "";
    return cleanExt(clean.slice(dot + 1));
  } catch {
    const clean = value.split("?")[0].split("#")[0];
    const dot = clean.lastIndexOf(".");
    if (dot === -1) return "";
    return cleanExt(clean.slice(dot + 1));
  }
}

function extFromMime(mime?: string | null): string {
  if (!mime) return "";
  const normalized = mime.toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/html": "html",
    "application/vnd.jab.dropbook+json": "dropbook.json",
    "application/json": "json",
  };
  return map[normalized] || "";
}

export function resolveDropDownloadExtension(opts: {
  kind: Exclude<DropDownloadKind, "open-link" | "none">;
  mime?: string | null;
  fileName?: string | null;
  url?: string | null;
}): string {
  const fromName = extFromNameOrUrl(opts.fileName);
  const fromUrl = extFromNameOrUrl(opts.url);
  const fromMime = extFromMime(opts.mime);
  if (opts.kind === "video") return fromName || fromUrl || fromMime || "mp4";
  if (opts.kind === "audio") return fromName || fromUrl || fromMime || "mp3";
  if (opts.kind === "image") return fromName || fromUrl || fromMime || "jpg";
  if (opts.kind === "html") return fromName || fromUrl || fromMime || "html";
  if (opts.kind === "text") return "txt";
  return fromName || fromUrl || fromMime || "bin";
}

export function classifyDropDownload(opts: {
  embedKind?: string | null;
  mediaKind?: string | null;
  mime?: string | null;
  fileName?: string | null;
  href?: string | null;
  dropType?: string | null;
  hasTextBody?: boolean;
  fromDescript?: boolean;
  fromDropbook?: boolean;
  external?: boolean;
}): DropDownloadKind {
  const embedKind = (opts.embedKind || "").toLowerCase();
  const mediaKind = (opts.mediaKind || "").toLowerCase();
  const dropType = (opts.dropType || "").toLowerCase();
  const mime = (opts.mime || "").toLowerCase();
  const fileName = opts.fileName || "";
  const href = opts.href || "";

  if (
    embedKind === "youtube" ||
    embedKind === "spotify" ||
    embedKind === "apple_music" ||
    embedKind === "soundcloud"
  ) {
    return "open-link";
  }

  if (opts.fromDropbook || /\.dropbook\.json$/i.test(fileName)) return "doc";
  if (opts.fromDescript || /^text\/html/.test(mime) || /\.html?$/i.test(fileName)) {
    return "html";
  }

  if (embedKind === "image" || mediaKind === "image" || /^image\//.test(mime)) {
    return "image";
  }
  if (embedKind === "video" || mediaKind === "video" || /^video\//.test(mime)) {
    return "video";
  }
  if (embedKind === "audio" || mediaKind === "audio" || /^audio\//.test(mime)) {
    return "audio";
  }

  if (
    /\bdoc\b/.test(dropType) ||
    /^application\//.test(mime) ||
    /\.(pdf|doc|docx|txt|rtf|csv|zip)$/i.test(fileName)
  ) {
    return "doc";
  }

  if (
    opts.hasTextBody &&
    (/\b(?:thought|text|note)\b/.test(dropType) || (!href && !mediaKind))
  ) {
    return "text";
  }

  // External generic links (Instagram, articles, etc.) are not Board-owned files.
  if (opts.external && embedKind !== "image" && embedKind !== "video" && embedKind !== "audio") {
    return "open-link";
  }

  if (href && !opts.external) {
    if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(href)) return "image";
    if (/\.(mp4|webm|mov|m4v)$/i.test(href)) return "video";
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(href)) return "audio";
  }

  if (opts.hasTextBody) return "text";
  return "none";
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function triggerAnchorDownload(url: string, filename: string, opts?: { openTab?: boolean }) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  if (opts?.openTab) anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  triggerAnchorDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/** iPhone Safari often ignores blob `download`; open the signed file instead. */
export function openOrDownloadUrl(url: string, filename: string): void {
  triggerAnchorDownload(url, filename, { openTab: isIosSafari() });
}

export async function downloadDropFromUrl(url: string, filename: string): Promise<void> {
  if (isIosSafari()) {
    openOrDownloadUrl(url, filename);
    return;
  }
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const blob = await response.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    openOrDownloadUrl(url, filename);
  }
}

export function downloadDropText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(blob, filename);
}
