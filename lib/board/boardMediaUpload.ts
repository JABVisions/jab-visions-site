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
  storageExtensionForFile,
  uploadKindForFile,
  uploadTimeoutMsForBytes,
} from "@/lib/board/uploadLimits";
import {
  createUploadProgressTracker,
  type BoardUploadProgressHandler,
} from "@/lib/board/uploadProgress";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isMissingStorageObjectError } from "@/lib/board/signedMediaUrl";

/** Floor used by callers that don't have a file size yet. Prefer `uploadTimeoutMsForBytes`. */
export const BOARD_MEDIA_UPLOAD_TIMEOUT_MS = 180_000;
export const BOARD_MEDIA_READ_TIMEOUT_MS = 12_000;
export const BOARD_MEDIA_SESSION_TIMEOUT_MS = 12_000;
export const SIGNED_PLAYBACK_TIMEOUT_MS = 4_000;
export const BYTES_COMPLETE_SETTLE_MS = 400;
export const BYTES_DONE_FINALIZE_MS = 8_000;
/** Session / signed-URL / XHR must produce a first byte (or a real error) this fast. */
export const START_UPLOAD_STALL_MS = 25_000;
const COPY_BYTES_LIMIT = 8 * 1024 * 1024;
const UNKNOWN_VIDEO_BYTES = 1024 * 1024 * 1024;
const FIRST_BYTE_STALL_MS = 25_000;
const PROGRESS_STALL_MS = 20_000;

export type BoardMediaUploadResult = {
  bucket: string;
  storagePath: string;
  publicUrl: string;
  signedUrl: string;
};

export type BoardMediaUploadOptions = {
  bucket?: string;
  folder?: string;
  onProgress?: BoardUploadProgressHandler;
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
  if (/couldn.?t start this video upload|did not start/.test(lower)) {
    return "Couldn't start this video upload. Stay on this screen and try again.";
  }
  if (/sign-in|sign in|session/.test(lower)) {
    return "Sign in to upload this video.";
  }
  if (isMissingObjectUploadError(error) || /didn.?t finish saving/.test(lower)) {
    return "This video didn't finish saving to Board storage. Stay on this screen and try again.";
  }
  if (/timed out|timeout|aborted|abort|stalled/.test(lower)) {
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
        await withTimeout(
          Promise.resolve(supabase.rpc("ensure_board_media_file_size_limit")),
          3_000,
          "limit-raise"
        );
      } catch {
        // Function may not exist until the SQL script is applied.
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3_000);
        await fetch("/api/board/media/limits", {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
      } catch {
        // Service-role raise is best-effort; the browser upload still runs.
      }
    })();
  }
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function storageConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new BoardMediaUploadError("Board storage is not configured.", "config");
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function absoluteUrl(root: string, pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${root}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

type ByteReporter = (loaded: number, total?: number) => void;

export function bytesUploadFinished(loaded: number, total: number): boolean {
  return total > 0 && loaded >= total;
}

/**
 * iPhone Safari often reports 100% uploaded, then fires `onerror` / `onload`
 * with status 0. Treating that as failure restarts the 62MB PUT (progress
 * bar reset loop). Status 0 at 100% is **unverified** — do not commit a Drop
 * until `createSignedUrl` proves the object exists.
 */
export function acceptXhrOutcome(opts: {
  kind: "load" | "error" | "timeout" | "abort";
  status: number;
  loaded: number;
  total: number;
}): "success" | "unverified" | "failure" {
  if (opts.status === 401 || opts.status === 403 || opts.status === 413) {
    return "failure";
  }
  if (opts.kind === "load" && opts.status >= 200 && opts.status < 300) return "success";
  if (bytesUploadFinished(opts.loaded, opts.total)) {
    if (opts.status >= 400) return "failure";
    return "unverified";
  }
  return "failure";
}

/** Keep the bar under 100% until createSignedUrl proves the object exists. */
export function progressBytesUntilVerified(
  loaded: number,
  total: number,
  objectVerified: boolean
): { loaded: number; total: number; percent: number } {
  const safeLoaded = Number.isFinite(loaded) ? Math.max(0, loaded) : 0;
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  if (objectVerified) {
    if (safeTotal <= 0) return { loaded: safeLoaded, total: safeTotal, percent: 100 };
    if (safeLoaded >= safeTotal) return { loaded: safeLoaded, total: safeTotal, percent: 100 };
    return {
      loaded: safeLoaded,
      total: safeTotal,
      percent: Math.min(99, Math.floor((safeLoaded / safeTotal) * 100)),
    };
  }
  if (safeTotal <= 0) return { loaded: safeLoaded, total: 0, percent: 0 };
  if (safeLoaded >= safeTotal) {
    const held = Math.max(0, safeTotal - Math.max(1, Math.floor(safeTotal / 100)));
    return { loaded: held, total: safeTotal, percent: 99 };
  }
  // Math.round(99.5%) is 100 — that started the "Board did not close" overlay
  // while createSignedUrl was still running.
  return {
    loaded: safeLoaded,
    total: safeTotal,
    percent: Math.min(99, Math.floor((safeLoaded / safeTotal) * 100)),
  };
}

export function playbackResultAfterUpload(opts: {
  bucket: string;
  storagePath: string;
  publicUrl?: string | null;
  signedUrl?: string | null;
}): BoardMediaUploadResult {
  const publicUrl = String(opts.publicUrl || "").trim();
  const signedUrl = String(opts.signedUrl || "").trim();
  if (!signedUrl) {
    throw new BoardMediaUploadError(
      "This video didn't finish saving to Board storage. Try uploading it again.",
      "missing"
    );
  }
  return {
    bucket: opts.bucket,
    storagePath: opts.storagePath,
    publicUrl,
    signedUrl,
  };
}

/** Room Drops may only persist a signed private-bucket URL. */
export function preferredCommitPlaybackUrl(result: {
  signedUrl?: string | null;
  publicUrl?: string | null;
}): string {
  return String(result.signedUrl || "").trim();
}

export function canCommitBoardMediaPlayback(result: {
  signedUrl?: string | null;
}): boolean {
  return Boolean(String(result.signedUrl || "").trim());
}

export function isMissingObjectUploadError(error: unknown): boolean {
  if (error instanceof BoardMediaUploadError && error.code === "missing") return true;
  const raw = storageErrorText(error).toLowerCase();
  return /didn.?t finish saving|object not found|no such file/.test(raw);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/**
 * Mint a signed playback URL after a finished PUT. Never throws — a timeout or
 * 404 must not restart the 62MB upload. Retries briefly so iPhone status-0
 * success can catch up to object visibility.
 */
export async function requestSignedPlaybackUrl(
  createSignedUrl: () => Promise<{ signedUrl?: string | null; error?: unknown }>,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<{ signedUrl: string; missing: boolean }> {
  const timeoutMs = opts?.timeoutMs ?? SIGNED_PLAYBACK_TIMEOUT_MS;
  const retries = Math.max(0, opts?.retries ?? 2);
  const deadline = Date.now() + timeoutMs;
  let missing = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const result = await withTimeout(
        createSignedUrl(),
        remaining,
        "Board could not create a playback URL."
      );
      const signedUrl = String(result?.signedUrl || "").trim();
      if (signedUrl) return { signedUrl, missing: false };
      if (isMissingStorageObjectError(result?.error)) {
        missing = true;
        if (attempt < retries && Date.now() + 250 < deadline) {
          await sleep(Math.min(400, deadline - Date.now()));
          continue;
        }
        break;
      }
    } catch {
      break;
    }
  }
  return { signedUrl: "", missing };
}

function publicObjectUrl(bucket: string, storagePath: string): string {
  try {
    const { url } = storageConfig();
    return `${url}/storage/v1/object/public/${bucket}/${encodeStoragePath(storagePath)}`;
  } catch {
    return "";
  }
}

function xhrSend(opts: {
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  body: XMLHttpRequestBodyInit;
  timeoutMs: number;
  withCredentials?: boolean;
  knownTotal?: number;
  onBytes?: ByteReporter;
}): Promise<{ status: number; text: string; verified: boolean }> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new BoardMediaUploadError("This browser cannot upload Board media.", "storage"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    if (opts.withCredentials) xhr.withCredentials = true;
    Object.entries(opts.headers).forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, value);
    });
    xhr.timeout = Math.max(1, opts.timeoutMs);
    xhr.responseType = "text";
    let settled = false;
    let lastLoaded = 0;
    let lastMove = Date.now();
    let bytesCompleteTimer: ReturnType<typeof setTimeout> | undefined;
    const knownTotal = opts.knownTotal && opts.knownTotal > 0 ? opts.knownTotal : 0;
    const finishTimers = () => {
      clearInterval(stall);
      if (bytesCompleteTimer) clearTimeout(bytesCompleteTimer);
    };
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      finishTimers();
      run();
    };
    const stall = setInterval(() => {
      if (bytesUploadFinished(lastLoaded, knownTotal)) return;
      const wait = lastLoaded > 0 ? PROGRESS_STALL_MS : FIRST_BYTE_STALL_MS;
      if (Date.now() - lastMove > wait) {
        xhr.abort();
      }
    }, 1_000);
    const noteBytes = (loaded: number, total?: number) => {
      const resolvedTotal = total && total > 0 ? total : knownTotal;
      if (loaded > lastLoaded) {
        lastLoaded = loaded;
        lastMove = Date.now();
      }
      opts.onBytes?.(loaded, resolvedTotal);
      const done =
        bytesUploadFinished(Math.max(loaded, lastLoaded), knownTotal) ||
        bytesUploadFinished(Math.max(loaded, lastLoaded), resolvedTotal);
      if (done && !bytesCompleteTimer && !settled) {
        // iPhone Safari can sit at 100% and never fire onload.
        bytesCompleteTimer = setTimeout(() => {
          settle(() =>
            resolve({
              status: xhr.status || 0,
              text: String(xhr.responseText || ""),
              verified: xhr.status >= 200 && xhr.status < 300,
            })
          );
        }, BYTES_COMPLETE_SETTLE_MS);
      }
    };
    const terminal = (kind: "load" | "error" | "timeout" | "abort") => {
      const outcome = acceptXhrOutcome({
        kind,
        status: xhr.status || 0,
        loaded: lastLoaded,
        total: knownTotal || lastLoaded,
      });
      if (outcome === "success") {
        settle(() =>
          resolve({
            status: xhr.status >= 200 && xhr.status < 300 ? xhr.status : 200,
            text: String(xhr.responseText || ""),
            verified: true,
          })
        );
        return;
      }
      if (outcome === "unverified") {
        settle(() =>
          resolve({
            status: xhr.status || 0,
            text: String(xhr.responseText || ""),
            verified: false,
          })
        );
        return;
      }
      if (kind === "load") {
        settle(() =>
          resolve({ status: xhr.status, text: String(xhr.responseText || ""), verified: false })
        );
        return;
      }
      if (kind === "error") {
        settle(() =>
          reject(
            new BoardMediaUploadError(
              "Couldn't reach Board storage. Check your connection and try again."
            )
          )
        );
        return;
      }
      if (kind === "timeout") {
        settle(() => reject(new BoardMediaUploadError("Media upload timed out.", "timeout")));
        return;
      }
      settle(() =>
        reject(
          new BoardMediaUploadError(
            "Upload stalled. Stay on this screen and try again on Wi-Fi.",
            "timeout"
          )
        )
      );
    };
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : knownTotal;
      noteBytes(event.loaded || lastLoaded, total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        noteBytes(Math.max(lastLoaded, knownTotal || lastLoaded), knownTotal || lastLoaded);
      }
      terminal("load");
    };
    xhr.onerror = () => terminal("error");
    xhr.ontimeout = () => terminal("timeout");
    xhr.onabort = () => terminal("abort");
    xhr.send(opts.body);
  });
}

function throwIfFailedStatus(status: number, text: string): void {
  if (status >= 200 && status < 300) return;
  let message = text.trim() || `Board storage ${status}`;
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown; statusCode?: unknown };
    message = String(parsed.message || parsed.error || message);
    if (parsed.statusCode === 413 || parsed.statusCode === "413" || status === 413) {
      throw new BoardMediaUploadError("Payload too large", "storage");
    }
  } catch (error) {
    if (error instanceof BoardMediaUploadError) throw error;
  }
  if (status === 413) throw new BoardMediaUploadError("Payload too large", "storage");
  if (status === 401 || status === 403) {
    throw new BoardMediaUploadError(message || `Upload failed (${status})`, "auth");
  }
  throw new BoardMediaUploadError(message || "Media upload failed.", "storage");
}

async function playbackAfterXhrWrite(
  uploaded: { status: number; text: string; verified: boolean },
  bucket: string,
  storagePath: string
): Promise<BoardMediaUploadResult> {
  if (uploaded.verified || uploaded.status >= 400) {
    throwIfFailedStatus(uploaded.status, uploaded.text);
  }
  return signedResult(bucket, storagePath);
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
  const ext = storageExtensionForFile(file);
  return `${folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
}

async function signedResult(
  bucket: string,
  storagePath: string
): Promise<BoardMediaUploadResult> {
  let publicUrl = "";
  try {
    const supabase = supabaseBrowser();
    publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl || "";
  } catch {
    publicUrl = "";
  }
  if (!publicUrl) publicUrl = publicObjectUrl(bucket, storagePath);

  let signedUrl = "";
  let missing = false;
  try {
    const supabase = supabaseBrowser();
    const signed = await requestSignedPlaybackUrl(
      async () => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
        return { signedUrl: data?.signedUrl || "", error };
      },
      { timeoutMs: SIGNED_PLAYBACK_TIMEOUT_MS, retries: 2 }
    );
    signedUrl = signed.signedUrl;
    missing = signed.missing;
  } catch {
    signedUrl = "";
  }

  if (!signedUrl) {
    throw new BoardMediaUploadError(
      "This video didn't finish saving to Board storage. Try uploading it again.",
      missing ? "missing" : "missing"
    );
  }

  return playbackResultAfterUpload({
    bucket,
    storagePath,
    publicUrl,
    signedUrl,
  });
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
  opts: { bucket: string; folder: string; accessToken: string; onBytes?: ByteReporter }
): Promise<BoardMediaUploadResult> {
  const { url: supabaseUrl, anonKey } = storageConfig();
  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let lastMove = Date.now();
    let lastLoaded = 0;
    let bytesCompleteTimer: ReturnType<typeof setTimeout> | undefined;
    const finishTimers = () => {
      clearInterval(stall);
      clearTimeout(hardTimeout);
      if (bytesCompleteTimer) clearTimeout(bytesCompleteTimer);
    };
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000],
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
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesUploaded > lastLoaded) {
          lastLoaded = bytesUploaded;
          lastMove = Date.now();
        }
        opts.onBytes?.(bytesUploaded, bytesTotal);
        if (
          bytesUploadFinished(bytesUploaded, bytesTotal || file.size) &&
          !bytesCompleteTimer &&
          !settled
        ) {
          bytesCompleteTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            finishTimers();
            resolve();
          }, BYTES_COMPLETE_SETTLE_MS);
        }
      },
      onError: (error) => {
        if (settled) return;
        if (bytesUploadFinished(lastLoaded, file.size)) {
          settled = true;
          finishTimers();
          resolve();
          return;
        }
        settled = true;
        finishTimers();
        reject(error);
      },
      onSuccess: () => {
        if (settled) return;
        settled = true;
        finishTimers();
        resolve();
      },
    });
    const stall = setInterval(() => {
      if (bytesUploadFinished(lastLoaded, file.size)) return;
      const wait = lastLoaded > 0 ? PROGRESS_STALL_MS : FIRST_BYTE_STALL_MS;
      if (Date.now() - lastMove <= wait) return;
      finishTimers();
      try {
        upload.abort(true);
      } catch {
        // ignore
      }
      if (settled) return;
      settled = true;
      reject(new BoardMediaUploadError("Upload stalled. Stay on this screen and try again on Wi-Fi.", "timeout"));
    }, 1_000);
    const hardTimeout = setTimeout(() => {
      finishTimers();
      try {
        upload.abort(true);
      } catch {
        // ignore
      }
      if (settled) return;
      settled = true;
      reject(new BoardMediaUploadError("Media upload timed out.", "timeout"));
    }, timeoutMs);
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
  });

  return signedResult(opts.bucket, storagePath);
}

async function uploadThroughSignedPut(
  file: File,
  opts: { bucket: string; folder: string; accessToken: string; onBytes?: ByteReporter }
): Promise<BoardMediaUploadResult> {
  const supabase = supabaseBrowser();
  const { url, anonKey } = storageConfig();
  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const signed = await withTimeout(
    supabase.storage.from(opts.bucket).createSignedUploadUrl(storagePath, { upsert: true }),
    BOARD_MEDIA_SESSION_TIMEOUT_MS,
    "Board storage did not grant an upload URL."
  );
  if (signed.error || !signed.data?.token) {
    throwStorageFailure(signed.error || new Error("Board storage did not grant an upload URL."));
  }
  const signedUrl = absoluteUrl(
    `${url}/storage/v1`,
    signed.data.signedUrl ||
      `/object/upload/sign/${opts.bucket}/${encodeStoragePath(storagePath)}?token=${signed.data.token}`
  );
  const uploaded = await xhrSend({
    url: signedUrl,
    method: "PUT",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      apikey: anonKey,
      "content-type": contentType,
      "x-upsert": "true",
      "cache-control": "max-age=3600",
    },
    body: file,
    timeoutMs,
    knownTotal: file.size,
    onBytes: opts.onBytes,
  });
  return playbackAfterXhrWrite(uploaded, opts.bucket, storagePath);
}

async function uploadThroughBrowser(
  file: File,
  opts: { bucket: string; folder: string; accessToken: string; onBytes?: ByteReporter }
): Promise<BoardMediaUploadResult> {
  const { url, anonKey } = storageConfig();
  const contentType = resolveUploadContentType(file);
  const storagePath = storagePathFor(file, opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const uploaded = await xhrSend({
    url: `${url}/storage/v1/object/${opts.bucket}/${encodeStoragePath(storagePath)}`,
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      apikey: anonKey,
      "content-type": contentType,
      "x-upsert": "true",
      "cache-control": "max-age=3600",
    },
    body: file,
    timeoutMs,
    knownTotal: file.size,
    onBytes: opts.onBytes,
  });
  return playbackAfterXhrWrite(uploaded, opts.bucket, storagePath);
}

async function uploadThroughServerless(
  file: File,
  opts: { bucket: string; folder: string; onBytes?: ByteReporter }
): Promise<BoardMediaUploadResult> {
  const body = new FormData();
  body.set("file", file, file.name);
  body.set("bucket", opts.bucket);
  body.set("folder", opts.folder);
  const timeoutMs = uploadTimeoutMsForBytes(guessUploadBytes(file));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const uploaded = await xhrSend({
    url: `${origin}/api/board/media`,
    method: "POST",
    headers: {},
    body,
    timeoutMs,
    withCredentials: true,
    knownTotal: file.size,
    onBytes: opts.onBytes,
  });
  if (uploaded.status === 401) {
    throw new BoardMediaUploadError("Sign in to upload this video.", "auth");
  }
  if (uploaded.status === 413) {
    throw new BoardMediaUploadError("Payload too large", "storage");
  }
  try {
    const parsed = parseBoardMediaUploadResponse(JSON.parse(uploaded.text));
    if (parsed) {
      if (!parsed.signedUrl) {
        throw new BoardMediaUploadError(
          "This video didn't finish saving to Board storage. Try uploading it again.",
          "missing"
        );
      }
      return parsed;
    }
  } catch (error) {
    if (error instanceof BoardMediaUploadError) throw error;
  }
  throwIfFailedStatus(uploaded.status, uploaded.text);
  throw new BoardMediaUploadError("Media upload failed.", "storage");
}

async function runUploadAttempts(
  file: File,
  attempts: Array<() => Promise<BoardMediaUploadResult>>
): Promise<BoardMediaUploadResult> {
  let lastError: unknown = new BoardMediaUploadError("Couldn't upload that video. Try again.");
  let missingRetries = 0;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (isMissingObjectUploadError(error)) {
        missingRetries += 1;
        if (missingRetries > 1) break;
        continue;
      }
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
  opts?: BoardMediaUploadOptions
): Promise<BoardMediaUploadResult> {
  const bucket = opts?.bucket === BUCKET_DOCS ? BUCKET_DOCS : BUCKET_MEDIA;
  const requestedFolder = (opts?.folder || "uploads").replace(/^\/+|\/+$/g, "");
  const sizeError = checkUploadSize(file);
  if (sizeError) {
    throw new BoardMediaUploadError(sizeError, "size");
  }

  const tracker = createUploadProgressTracker(guessUploadBytes(file), opts?.onProgress);
  tracker.preparing();

  let progressed = false;
  let holdAtComplete = false;
  let objectVerified = false;
  let lastLoaded = 0;
  let lastTotal = guessUploadBytes(file);
  const uploadStartedAt = Date.now();
  const onBytes: ByteReporter = (loaded, total) => {
    if (holdAtComplete) return;
    if (loaded > 0) progressed = true;
    lastLoaded = loaded;
    if (total && total > 0) lastTotal = total;
    const held = progressBytesUntilVerified(loaded, lastTotal, objectVerified);
    tracker.bytes(held.loaded, held.total);
  };

  const work = (async () => {
    const copy = await copyFileForUpload(file);
    lastTotal = guessUploadBytes(copy);
    const session = await requireUploadSession();
    const folder = ownerScopedUploadFolder(requestedFolder, session.user.id);
    void requestBoardMediaLimitRaise();

    const withToken = async (run: (accessToken: string) => Promise<BoardMediaUploadResult>) => {
      if (!progressed) tracker.reset();
      else if (bytesUploadFinished(lastLoaded, lastTotal)) holdAtComplete = true;
      const live = await requireUploadSession();
      return run(live.access_token);
    };

    const direct = () =>
      withToken((accessToken) =>
        uploadThroughBrowser(copy, { bucket, folder, accessToken, onBytes })
      );
    const signed = () =>
      withToken((accessToken) =>
        uploadThroughSignedPut(copy, { bucket, folder, accessToken, onBytes })
      );
    const tus = () =>
      withToken((accessToken) =>
        uploadThroughTus(copy, { bucket, folder, accessToken, onBytes })
      );

    const attempts: Array<() => Promise<BoardMediaUploadResult>> = prefersDirectStorageUpload(copy)
      ? [direct, signed, tus]
      : [tus, signed, direct];

    if (!shouldSkipServerlessMediaUpload(copy)) {
      attempts.push(() => {
        if (!progressed) tracker.reset();
        return uploadThroughServerless(copy, { bucket, folder, onBytes });
      });
    }

    return runUploadAttempts(copy, attempts);
  })();

  const result = await new Promise<BoardMediaUploadResult>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      run();
    };
    const watch = setInterval(() => {
      if (settled) return;
      if (lastLoaded <= 0 && !objectVerified && Date.now() - uploadStartedAt >= START_UPLOAD_STALL_MS) {
        finish(() =>
          reject(
            new BoardMediaUploadError(
              "Couldn't start this video upload. Stay on this screen and try again.",
              "timeout"
            )
          )
        );
      }
    }, 200);
    work.then(
      (value) => {
        objectVerified = true;
        finish(() => resolve(value));
      },
      (error) => finish(() => reject(error))
    );
  });
  tracker.finishing();
  opts?.onProgress?.(null);
  return result;
}
