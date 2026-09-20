import { Upload } from "tus-js-client";
import { BUCKET_DOCS, BUCKET_MEDIA } from "@/lib/board/dropItem";
import {
  SERVERLESS_UPLOAD_BODY_LIMIT,
  TUS_CHUNK_SIZE,
  TUS_UPLOAD_THRESHOLD,
  DIRECT_STORAGE_UPLOAD_MAX_BYTES,
  UPLOAD_LIMITS,
  checkUploadSize,
  fileWithResolvedContentType,
  formatBytes,
  ownerScopedUploadFolder,
  resolveUploadContentType,
  uploadKindForFile,
  uploadTimeoutMsForBytes,
} from "@/lib/board/uploadLimits";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Floor used by callers that don't have a file size yet. Prefer `uploadTimeoutMsForBytes`. */
export const BOARD_MEDIA_UPLOAD_TIMEOUT_MS = 180_000;
export const BOARD_MEDIA_READ_TIMEOUT_MS = 12_000;
export const BOARD_MEDIA_SESSION_TIMEOUT_MS = 12_000;
const COPY_BYTES_LIMIT = 8 * 1024 * 1024;
const UNKNOWN_VIDEO_BYTES = 1024 * 1024 * 1024;

export type BoardMediaUploadResult = {
  bucket: string;
  storagePath: string;
  publicUrl: string;
  signedUrl: string;
};

export class BoardMediaUploadError extends Error {
  constructor(message: string, readonly code = "upload") {
    super(message);
    this.name = "BoardMediaUploadError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function parseBoardMediaUploadResponse(value: unknown): BoardMediaUploadResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true) return null;
  const storagePath = String(record.storagePath || record.path || "").trim();
  const bucket = String(record.bucket || BUCKET_MEDIA).trim();
  const publicUrl = String(record.publicUrl || record.public_url || "").trim();
  const signedUrl = String(record.signedUrl || record.image_url || record.signed_url || "").trim();
  if (!bucket || !storagePath) return null;
  return { bucket, storagePath, publicUrl, signedUrl };
}

export function guessUploadBytes(file: { size?: number; type?: string; name?: string }): number {
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0;
  if (size > 0) return size;
  return uploadKindForFile(file) === "video" ? UNKNOWN_VIDEO_BYTES : 1024 * 1024;
}

export function shouldSkipServerlessMediaUpload(file: {
  size?: number;
  type?: string;
  name?: string;
}): boolean {
  const size = typeof file.size === "number" ? file.size : 0;
  if (size <= 0) return true;
  if (uploadKindForFile(file) === "video") return true;
  return size > SERVERLESS_UPLOAD_BODY_LIMIT;
}

export function prefersDirectStorageUpload(file: {
  size?: number;
  type?: string;
  name?: string;
}): boolean {
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0;
  return size > 0 && size < DIRECT_STORAGE_UPLOAD_MAX_BYTES;
}

export function shouldUseTusUpload(file: { size?: number; type?: string; name?: string }): boolean {
  // Known-size Work Board tapes under 96MB use Drop Tile's direct PUT.
  // iPhone Safari tus is what turned a 64.9MB file into "Couldn't upload that video."
  if (prefersDirectStorageUpload(file)) return false;
  if (uploadKindForFile(file) === "video") return true;
  const size = typeof file.size === "number" ? file.size : 0;
  if (size <= 0) return true;
  return size >= TUS_UPLOAD_THRESHOLD;
}

function storageErrorText(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || record.statusCode || record.status || "");
  }
  return String(error || "");
}

export function isStoragePayloadTooLargeError(error: unknown): boolean {
  const raw = storageErrorText(error);
  const lower = raw.toLowerCase();
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const status = record?.statusCode ?? record?.status;
  if (status === 413 || status === "413") return true;
  return (
    /payload too large|entity too large|exceeded the maximum allowed size|file_size_limit/.test(
      lower
    ) ||
    /response code:\s*413\b/.test(lower) ||
    /statuscode["']?\s*[:=]\s*["']?413\b/.test(lower)
  );
}

export function isUnauthorizedUploadError(error: unknown): boolean {
  const lower = storageErrorText(error).toLowerCase();
  return /row-level security|not allowed|unauthorized|jwt|42501|403|401|access denied|invalid compact jws|expired/.test(
    lower
  );
}

export function explainBoardMediaUploadError(
  error: unknown,
  file?: { size?: number; type?: string; name?: string }
): string {
  const raw = storageErrorText(error);
  const lower = raw.toLowerCase();
  const bytes =
    typeof file?.size === "number" && Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
  if (!raw.trim() || raw.trim() === "upload failed") {
    return "Couldn't upload that video. Try again.";
  }
  if (isStoragePayloadTooLargeError(error)) {
    if (bytes > UPLOAD_LIMITS.video) {
      return `That video is ${formatBytes(bytes)} — the limit is ${formatBytes(UPLOAD_LIMITS.video)}.`;
    }
    return "Couldn't save this video to Board storage. Stay on this screen and try again.";
  }
  if (isUnauthorizedUploadError(error)) {
    return "Sign in again to upload this video.";
  }
  if (/sign-in|sign in|session/.test(lower)) {
    return "Sign in to upload this video.";
  }
  if (/timed out|timeout|aborted|abort/.test(lower)) {
    return "Video upload timed out. Stay on this screen and try again on Wi-Fi.";
  }
  if (/could not read|notreadable|empty file/.test(lower)) {
    return "Safari couldn't read that video. Try Retake, or pick it again from Recents.";
  }
  if (/failed to fetch|networkerror|offline|load failed|network request failed/.test(lower)) {
    return "Couldn't reach Board storage. Check your connection and try again.";
  }
  return raw.trim();
}

let mediaLimitRaise: Promise<void> | null = null;

async function requestBoardMediaLimitRaise() {
  if (typeof fetch === "undefined") return;
  if (!mediaLimitRaise) {
    mediaLimitRaise = (async () => {
      try {
        const supabase = supabaseBrowser();
        await supabase.rpc("ensure_board_media_file_size_limit");
      } catch {
        // Function may not exist until the SQL script is applied.
      }
      try {
        await fetch("/api/board/media/limits", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Service-role raise is best-effort; the browser upload still runs.
      }
    })();
  }
  await Promise.race([
    mediaLimitRaise,
    new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
  ]);
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export async function copyFileForUpload(file: File): Promise<File> {
  const kind = uploadKindForFile(file);
  // iPhone camera-roll / MediaRecorder blobs OOM if we `new File([file])` a tape.
  if (kind === "video" || file.size > COPY_BYTES_LIMIT || file.size <= 0) {
    return fileWithResolvedContentType(file);
  }
  try {
    const buffer = await withTimeout(
      file.slice(0).arrayBuffer(),
      BOARD_MEDIA_READ_TIMEOUT_MS,
      "Could not read that file."
    );
    if (!buffer.byteLength) {
      throw new BoardMediaUploadError("Could not read that file.", "read");
    }
    const type = resolveUploadContentType(file) || file.type || "application/octet-stream";
    return new File([buffer], file.name || "board-media", {
      type,
      lastModified: Date.now(),
    });
  } catch (error) {
    if (error instanceof BoardMediaUploadError) throw error;
    return fileWithResolvedContentType(file);
  }
}

function storagePathFor(file: File, folder: string) {
  const ext =
    (file.name.split(".").pop() || (uploadKindForFile(file) === "video" ? "mp4" : "bin"))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || "bin";
  return `${folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
}

async function signedResult(
  bucket: string,
  storagePath: string
): Promise<BoardMediaUploadResult> {
  const supabase = supabaseBrowser();
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl || "";
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  const signedUrl = signed?.signedUrl || "";
  if (!publicUrl && !signedUrl) {
    throw new BoardMediaUploadError("Upload finished but Board could not create a playback URL.", "storage");
  }
  return {
    bucket,
    storagePath,
    publicUrl,
    signedUrl,
  };
}

async function requireUploadSession() {
  const supabase = supabaseBrowser();
  const { data } = await withTimeout(
    supabase.auth.getSession(),
    BOARD_MEDIA_SESSION_TIMEOUT_MS,
    "Sign-in check timed out."
  );
  const session = data.session;
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  if (
    session?.user?.id &&
    session.access_token &&
    (!expiresAtMs || expiresAtMs > Date.now() + 60_000)
  ) {
    return session;
  }

  const { data: refreshed } = await withTimeout(
    supabase.auth.refreshSession(),
    BOARD_MEDIA_SESSION_TIMEOUT_MS,
    "Sign-in check timed out."
  );
  if (refreshed.session?.user?.id && refreshed.session.access_token) {
    return refreshed.session;
  }
  throw new BoardMediaUploadError("Sign in to upload this video.", "auth");
}

function throwStorageFailure(error: unknown): never {
  const text = storageErrorText(error).trim() || "Media upload failed.";
  if (isStoragePayloadTooLargeError(error) && !/payload too large|413|file_size_limit/i.test(text)) {
    throw new BoardMediaUploadError("Payload too large", "storage");
  }
  throw new BoardMediaUploadError(text, "storage");
}

async function uploadThroughTus(
  file: File,
  opts: { bucket: string; folder: string; accessToken: string }
): Promise<BoardMediaUploadResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new BoardMediaUploadError("Board storage is not configured.", "config");
  }

  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${opts.accessToken}`,
          apikey: anonKey,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: !isIosSafari(),
        storeFingerprintForResuming: !isIosSafari(),
        removeFingerprintOnSuccess: true,
        chunkSize: TUS_CHUNK_SIZE,
        metadata: {
          bucketName: opts.bucket,
          objectName: storagePath,
          contentType,
          cacheControl: "3600",
        },
        onError: (error) => reject(error),
        onSuccess: () => resolve(),
      });
      if (isIosSafari()) {
        upload.start();
        return;
      }
      void upload.findPreviousUploads().then(
        (previous) => {
          if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        },
        () => upload.start()
      );
    }),
    timeoutMs,
    "Media upload timed out."
  );

  return signedResult(opts.bucket, storagePath);
}

async function uploadThroughSignedPut(
  file: File,
  opts: { bucket: string; folder: string }
): Promise<BoardMediaUploadResult> {
  const supabase = supabaseBrowser();
  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const signed = await withTimeout(
    supabase.storage.from(opts.bucket).createSignedUploadUrl(storagePath),
    BOARD_MEDIA_SESSION_TIMEOUT_MS,
    "Board storage did not grant an upload URL."
  );
  if (signed.error || !signed.data?.token) {
    throwStorageFailure(signed.error || new Error("Board storage did not grant an upload URL."));
  }
  const uploaded = await withTimeout(
    supabase.storage.from(opts.bucket).uploadToSignedUrl(storagePath, signed.data.token, file, {
      contentType,
      upsert: true,
    }),
    timeoutMs,
    "Media upload timed out."
  );
  if (uploaded.error) {
    throwStorageFailure(uploaded.error);
  }
  return signedResult(opts.bucket, storagePath);
}

async function uploadThroughBrowser(
  file: File,
  opts: { bucket: string; folder: string }
): Promise<BoardMediaUploadResult> {
  const supabase = supabaseBrowser();
  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const { error } = await withTimeout(
    supabase.storage.from(opts.bucket).upload(storagePath, file, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    }),
    timeoutMs,
    "Media upload timed out."
  );
  if (error) {
    throwStorageFailure(error);
  }
  return signedResult(opts.bucket, storagePath);
}

async function uploadThroughServerless(
  file: File,
  opts: { bucket: string; folder: string }
): Promise<BoardMediaUploadResult> {
  const body = new FormData();
  body.set("file", file, file.name);
  body.set("bucket", opts.bucket);
  body.set("folder", opts.folder);
  const controller = new AbortController();
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/board/media", {
      method: "POST",
      body,
      credentials: "include",
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null);
    const parsed = parseBoardMediaUploadResponse(json);
    if (parsed) return parsed;
    const apiMessage =
      json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
        ? String((json as { message: string }).message)
        : "";
    if (response.status === 401) {
      throw new BoardMediaUploadError("Sign in to upload this video.", "auth");
    }
    if (response.status === 413) {
      throw new BoardMediaUploadError("Payload too large", "storage");
    }
    throw new BoardMediaUploadError(
      explainBoardMediaUploadError(apiMessage || `Board media API ${response.status}`, file)
    );
  } finally {
    clearTimeout(timer);
  }
}

async function runUploadAttempts(
  file: File,
  attempts: Array<() => Promise<BoardMediaUploadResult>>
): Promise<BoardMediaUploadResult> {
  let lastError: unknown = new BoardMediaUploadError("Couldn't upload that video. Try again.");
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (isStoragePayloadTooLargeError(error) && (file.size <= 0 || file.size <= UPLOAD_LIMITS.video)) {
        mediaLimitRaise = null;
        await requestBoardMediaLimitRaise();
        try {
          return await attempt();
        } catch (retryError) {
          lastError = retryError;
        }
      } else if (isUnauthorizedUploadError(error)) {
        try {
          await requireUploadSession();
        } catch {
          // Next attempt still runs; a hard sign-out fails at the end.
        }
      }
    }
  }
  throw new BoardMediaUploadError(explainBoardMediaUploadError(lastError, file));
}

export async function uploadBoardMediaFile(
  file: File,
  opts?: { bucket?: string; folder?: string }
): Promise<BoardMediaUploadResult> {
  const bucket = opts?.bucket === BUCKET_DOCS ? BUCKET_DOCS : BUCKET_MEDIA;
  const requestedFolder = (opts?.folder || "uploads").replace(/^\/+|\/+$/g, "");
  const sizeError = checkUploadSize(file);
  if (sizeError) {
    throw new BoardMediaUploadError(sizeError, "size");
  }

  const copy = await copyFileForUpload(file);
  const session = await requireUploadSession();
  const folder = ownerScopedUploadFolder(requestedFolder, session.user.id);
  await requestBoardMediaLimitRaise();

  const direct = () => uploadThroughBrowser(copy, { bucket, folder });
  const signed = () => uploadThroughSignedPut(copy, { bucket, folder });
  const tus = async () => {
    const live = await requireUploadSession();
    return uploadThroughTus(copy, {
      bucket,
      folder,
      accessToken: live.access_token,
    });
  };

  const attempts: Array<() => Promise<BoardMediaUploadResult>> = prefersDirectStorageUpload(copy)
    ? [direct, signed, tus]
    : [tus, signed, direct];

  if (!shouldSkipServerlessMediaUpload(copy)) {
    attempts.push(() => uploadThroughServerless(copy, { bucket, folder }));
  }

  return runUploadAttempts(copy, attempts);
}
