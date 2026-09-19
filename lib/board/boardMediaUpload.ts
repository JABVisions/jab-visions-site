import { BUCKET_DOCS, BUCKET_MEDIA } from "@/lib/board/dropItem";
import { checkUploadSize, resolveUploadContentType } from "@/lib/board/uploadLimits";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const BOARD_MEDIA_UPLOAD_TIMEOUT_MS = 12_000;
export const BOARD_MEDIA_READ_TIMEOUT_MS = 5_000;
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
      return file;
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

    const bytes = file.size > COPY_BYTES_LIMIT ? file : new Uint8Array(await file.arrayBuffer());
    const contentType = resolveUploadContentType(file);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const storagePath = `${opts.folder.replace(/\/+$/, "")}/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;
    const { error } = await withTimeout(
      supabase.storage.from(opts.bucket).upload(storagePath, bytes, {
        upsert: true,
        contentType,
        cacheControl: "3600",
      }),
      BOARD_MEDIA_UPLOAD_TIMEOUT_MS,
      "Media upload timed out."
    );
    if (error) {
      console.error("Board media upload failed:", error);
      return null;
    }
    const publicUrl = supabase.storage.from(opts.bucket).getPublicUrl(storagePath).data.publicUrl || "";
    const { data: signed } = await supabase.storage
      .from(opts.bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
    return {
      bucket: opts.bucket,
      storagePath,
      publicUrl,
      signedUrl: signed?.signedUrl || "",
    };
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

  const body = new FormData();
  body.set("file", copy, copy.name);
  body.set("bucket", bucket);
  body.set("folder", folder);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOARD_MEDIA_UPLOAD_TIMEOUT_MS);
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
