/**
 * Central upload size limits for every Board drop surface.
 *
 * These are the app-level guardrails. Supabase Storage also enforces a
 * per-bucket `file_size_limit` set in the dashboard (Storage → bucket →
 * Settings), and the *smaller* of the two wins. If an upload fails with
 * "Payload too large" / "exceeded the maximum allowed size" while it is under
 * the limit below, raise the bucket limit in Supabase to match.
 */

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  /** Photos, doodles, and art layers. */
  image: 25 * MB,
  /** Voice drops, music drops, and audio attachments. */
  audio: 150 * MB,
  /** Video drops and Pay Drop video context. */
  video: 500 * MB,
  /** Docs and Descript exports. */
  doc: 50 * MB,
  /** Avatars and cover images. */
  avatar: 10 * MB,
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

export function uploadKindForFile(file: {
  type?: string;
  name?: string;
}): UploadKind {
  const type = typeof file.type === "string" ? file.type : "";
  const name = typeof file.name === "string" ? file.name : "";

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return "audio";
  if (/\.(mp4|webm|mov|m4v)$/i.test(name)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif|heic|svg)$/i.test(name)) return "image";
  return "doc";
}

export function formatBytes(bytes: number) {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * Returns an error message when the file is over its limit, or null when the
 * upload is allowed.
 */
export function checkUploadSize(
  file: { size: number; type?: string; name?: string },
  kind: UploadKind = uploadKindForFile(file)
): string | null {
  const limit = UPLOAD_LIMITS[kind];
  if (file.size <= limit) return null;
  return `That ${kind} is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}.`;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  // Audio — files picked on mobile often arrive with an empty `File.type`, and
  // storing them as application/octet-stream makes iOS Safari refuse to decode
  // them in an <audio> element.
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  weba: "audio/webm",
  // Video
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  svg: "image/svg+xml",
  // Docs
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
  txt: "text/plain",
  json: "application/json",
};

/**
 * Best-effort Content-Type for an upload. Prefers the browser-reported type and
 * falls back to the file extension, because a wrong or missing Content-Type is
 * served back verbatim by Supabase Storage and breaks `<audio>`/`<video>`
 * playback (most strictly on iOS Safari).
 */
export function resolveUploadContentType(file: { type?: string; name?: string }): string {
  const reported = typeof file.type === "string" ? file.type.trim() : "";
  if (reported && reported !== "application/octet-stream") return reported;

  const name = typeof file.name === "string" ? file.name : "";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] || reported || "application/octet-stream";
}
