/**
 * Central upload size limits for every Board drop surface.
 *
 * These are the app-level guardrails. Supabase Storage also enforces a
 * per-bucket `file_size_limit` set in the dashboard (Storage → bucket →
 * Settings), and the *smaller* of the two wins. If an upload fails with
 * "Payload too large" / "exceeded the maximum allowed size" while it is under
 * the limit below, raise the bucket limit in Supabase to match.
 *
 * Vercel serverless request bodies cap around 4.5MB, so files above
 * `SERVERLESS_UPLOAD_BODY_LIMIT` must skip `/api/board/media` and upload
 * directly (tus / Supabase storage). Do not silently fail those with a tiny cap.
 */

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  /** Photos, doodles, and art layers. */
  image: 25 * MB,
  /** Voice drops, music drops, and audio attachments. */
  audio: 250 * MB,
  /**
   * Video drops, Project Room audition tapes, and Pay Drop video context.
   * Sized for minutes-long iPhone tapes (1080p ~130MB/min, 4K ~350MB/min).
   */
  video: 4 * 1024 * MB,
  /** Docs and Descript exports. */
  doc: 50 * MB,
  /** Avatars and cover images. */
  avatar: 10 * MB,
} as const;

/** Vercel serverless incoming body cap. Larger files must not go through FormData APIs. */
export const SERVERLESS_UPLOAD_BODY_LIMIT = 4 * MB;

/** Supabase resumable uploads require 6MB chunks. */
export const TUS_CHUNK_SIZE = 6 * MB;

/** Files at or above this use tus instead of a single storage POST. */
export const TUS_UPLOAD_THRESHOLD = 6 * MB;

const UPLOAD_TIMEOUT_FLOOR_MS = 180_000;
const UPLOAD_TIMEOUT_CAP_MS = 60 * 60_000;

/**
 * Give long audition tapes time to finish on mobile networks.
 * ~1 minute per 30MB, 3-minute floor, 60-minute cap.
 */
export function uploadTimeoutMsForBytes(bytes: number): number {
  const mb = Math.max(1, bytes / MB);
  return Math.min(UPLOAD_TIMEOUT_CAP_MS, Math.max(UPLOAD_TIMEOUT_FLOOR_MS, Math.ceil(mb / 30) * 60_000));
}

/**
 * Drop Studio waits this long for onComplete (Project Room uploads included).
 * The old 20s cap parked valid audition tapes in Drafts before the room save finished.
 */
export function studioCompleteTimeoutMs(bytes: number, isAudioMix = false): number {
  const safeBytes = bytes > 0 ? bytes : 1024 * MB;
  return Math.max(isAudioMix ? 90_000 : 0, uploadTimeoutMsForBytes(safeBytes) + 15_000);
}

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

/** Photo / video / voice kind for Drop Studio, including iOS files with an empty MIME. */
export function studioMediaKindForFile(file: { type?: string; name?: string }): "image" | "video" | "audio" {
  const kind = uploadKindForFile(file);
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "image";
}

/**
 * Stamp a real Content-Type onto camera-roll files that arrive as
 * `application/octet-stream` (or empty). Blob URLs and `<video>` both need it.
 */
export function fileWithResolvedContentType(file: File): File {
  const type = resolveUploadContentType(file);
  if (!type || type === file.type) return file;
  // iPhone Safari OOMs if we clone a camera-roll / MediaRecorder tape into a new File.
  if (uploadKindForFile(file) === "video" || file.size > 8 * MB || file.size <= 0) {
    return file;
  }
  try {
    return new File([file], file.name || "board-media", {
      type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/**
 * Storage RLS on board-media is owner-folder based (`{userId}/...`), matching
 * Drop Console `uploads/{userId}` and Drop Tile `{userId}/{dropId}`.
 * Bare folders like `project-media` are rejected by the bucket policy.
 */
export function ownerScopedUploadFolder(folder: string, userId: string): string {
  const user = String(userId || "").trim();
  const clean = String(folder || "uploads")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
  if (!user) return clean || "uploads";
  if (clean === user || clean.startsWith(`${user}/`)) return clean;
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "uploads" && parts[1] === user) return clean;
  return `${user}/${clean || "uploads"}`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * MB) {
    const gb = bytes / (1024 * MB);
    return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)}GB`;
  }
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
  file: { size?: number; type?: string; name?: string },
  kind: UploadKind = uploadKindForFile(file)
): string | null {
  const limit = UPLOAD_LIMITS[kind];
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0;
  // iPhone Files sometimes report 0 until tus reads the blob. That is not over-limit.
  if (size <= 0 || size <= limit) return null;
  return `That ${kind} is ${formatBytes(size)} — the limit is ${formatBytes(limit)}.`;
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
  if (MIME_BY_EXTENSION[ext]) return MIME_BY_EXTENSION[ext];
  if (reported) return reported;
  const kind = uploadKindForFile(file);
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/mp4";
  if (kind === "image") return "image/jpeg";
  return "application/octet-stream";
}
