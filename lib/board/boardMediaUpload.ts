import { Upload } from "tus-js-client";
import { BUCKET_DOCS, BUCKET_MEDIA } from "@/lib/board/dropItem";
import {
  SERVERLESS_UPLOAD_BODY_LIMIT,
  TUS_CHUNK_SIZE,
  TUS_UPLOAD_THRESHOLD,
  checkUploadSize,
  fileWithResolvedContentType,
  resolveUploadContentType,
  uploadTimeoutMsForBytes,
} from "@/lib/board/uploadLimits";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Floor used by callers that don't have a file size yet. Prefer `uploadTimeoutMsForBytes`. */
export const BOARD_MEDIA_UPLOAD_TIMEOUT_MS = 180_000;
export const BOARD_MEDIA_READ_TIMEOUT_MS = 12_000;
const COPY_BYTES_LIMIT = 8 * 1024 * 1024;

export type BoardMediaUploadResult = {
  bucket: string;
  storagePath: string;
  publicUrl: string;
  signedUrl: string;
};

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

export async function copyFileForUpload(file: File): Promise<File | null> {
  try {
    if (file.size > COPY_BYTES_LIMIT) {
      return fileWithResolvedContentType(file);
    }
    const buffer = await withTimeout(
      file.slice(0).arrayBuffer(),
      BOARD_MEDIA_READ_TIMEOUT_MS,
      "Could not read that file."
    );
    if (!buffer.byteLength) return null;
    const type = resolveUploadContentType(file) || file.type || "application/octet-stream";
    return new File([buffer], file.name || "board-media", {
      type,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function storagePathFor(file: File, folder: string) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "") || "bin";
  return `${folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
}

async function signedResult(
  bucket: string,
  storagePath: string
): Promise<BoardMediaUploadResult | null> {
  const supabase = supabaseBrowser();
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl || "";
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  return {
    bucket,
    storagePath,
    publicUrl,
    signedUrl: signed?.signedUrl || "",
  };
}

async function uploadThroughTus(
  file: File,
  opts: { bucket: string; folder: string }
): Promise<BoardMediaUploadResult | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const supabase = supabaseBrowser();
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      4_000,
      "Sign-in check timed out."
    );
    const session = data.session;
    if (!session?.user?.id || !session.access_token) return null;

    const contentType = resolveUploadContentType(file);
    const storagePath = storagePathFor(file, opts.folder);
    const timeoutMs = uploadTimeoutMsForBytes(file.size);

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint: `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
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
        void upload.findPreviousUploads().then((previous) => {
          if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        }, () => upload.start());
      }),
      timeoutMs,
      "Media upload timed out."
    );

    return signedResult(opts.bucket, storagePath);
  } catch (error) {
    console.error("Board media tus upload failed:", error);
    return null;
  }
}

async function uploadThroughBrowser(
  file: File,
  opts: { bucket: string; folder: string }
): Promise<BoardMediaUploadResult | null> {
  try {
    const supabase = supabaseBrowser();
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      4_000,
      "Sign-in check timed out."
    );
    const userId = data.session?.user?.id;
    if (!userId) return null;

    const contentType = resolveUploadContentType(file);
    const storagePath = storagePathFor(file, opts.folder);
    const timeoutMs = uploadTimeoutMsForBytes(file.size);
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
      console.error("Board media upload failed:", error);
      return null;
    }
    return signedResult(opts.bucket, storagePath);
  } catch (error) {
    console.error("Board media upload failed:", error);
    return null;
  }
}

export async function uploadBoardMediaFile(
  file: File,
  opts?: { bucket?: string; folder?: string }
): Promise<BoardMediaUploadResult | null> {
  const bucket = opts?.bucket === BUCKET_DOCS ? BUCKET_DOCS : BUCKET_MEDIA;
  const folder = (opts?.folder || "uploads").replace(/^\/+|\/+$/g, "");
  const sizeError = checkUploadSize(file);
  if (sizeError) {
    console.error("Board media rejected:", sizeError);
    return null;
  }

  const copy = await copyFileForUpload(file);
  if (!copy) return null;

  // Vercel serverless rejects FormData over ~4.5MB. Long audition tapes go
  // straight to Supabase (tus when large enough) so they are not silently capped.
  if (copy.size > SERVERLESS_UPLOAD_BODY_LIMIT) {
    if (copy.size >= TUS_UPLOAD_THRESHOLD) {
      const tusResult = await uploadThroughTus(copy, { bucket, folder });
      if (tusResult) return tusResult;
    }
    return uploadThroughBrowser(copy, { bucket, folder });
  }

  const body = new FormData();
  body.set("file", copy, copy.name);
  body.set("bucket", bucket);
  body.set("folder", folder);

  const controller = new AbortController();
  const timeoutMs = uploadTimeoutMsForBytes(copy.size);
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
  } catch (error) {
    console.error("Board media upload failed:", error);
  } finally {
    clearTimeout(timer);
  }

  return uploadThroughBrowser(copy, { bucket, folder });
}
