import { BOARD_PROJECT_MEDIA_BUCKET } from "@/lib/board/projectCover";
import { checkUploadSize, resolveUploadContentType } from "@/lib/board/uploadLimits";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const PROJECT_COVER_UPLOAD_TIMEOUT_MS = 12_000;
export const PROJECT_COVER_READ_TIMEOUT_MS = 5_000;

export type ProjectCoverUploadResult = {
  bucket: string;
  storagePath: string;
  imageUrl: string;
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

export function parseCoverUploadResponse(value: unknown): ProjectCoverUploadResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true) return null;
  const storagePath = String(record.storagePath || record.image_path || "").trim();
  const bucket = String(record.bucket || BOARD_PROJECT_MEDIA_BUCKET).trim();
  const imageUrl = String(record.image_url || record.imageUrl || record.signedUrl || "").trim();
  if (!bucket || !storagePath) return null;
  return { bucket, storagePath, imageUrl };
}

export async function copyFileForUpload(file: File): Promise<File | null> {
  try {
    const buffer = await withTimeout(
      file.slice(0).arrayBuffer(),
      PROJECT_COVER_READ_TIMEOUT_MS,
      "Could not read that photo."
    );
    if (!buffer.byteLength) return null;
    const type = resolveUploadContentType(file) || "image/jpeg";
    const name = file.name.replace(/\.[^.]+$/, "") || "project-cover";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    return new File([buffer], `${name}.${ext}`, { type, lastModified: Date.now() });
  } catch {
    return null;
  }
}

async function uploadCoverThroughBrowser(file: File): Promise<ProjectCoverUploadResult | null> {
  try {
    const supabase = supabaseBrowser();
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      4_000,
      "Sign-in check timed out."
    );
    const userId = data.session?.user?.id;
    if (!userId) return null;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = resolveUploadContentType(file);
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const storagePath = `${userId}/project-cover/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const { error } = await withTimeout(
      supabase.storage.from(BOARD_PROJECT_MEDIA_BUCKET).upload(storagePath, bytes, {
        upsert: true,
        contentType,
        cacheControl: "3600",
      }),
      PROJECT_COVER_UPLOAD_TIMEOUT_MS,
      "Cover upload timed out."
    );
    if (error) {
      console.error("Project cover upload failed:", error);
      return null;
    }
    const { data: signed } = await supabase.storage
      .from(BOARD_PROJECT_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
    return {
      bucket: BOARD_PROJECT_MEDIA_BUCKET,
      storagePath,
      imageUrl: signed?.signedUrl || "",
    };
  } catch (error) {
    console.error("Project cover upload failed:", error);
    return null;
  }
}

/** Same-origin Board upload so iOS Safari is not left waiting on a detached File + auth lock. */
export async function uploadProjectCover(file: File): Promise<ProjectCoverUploadResult | null> {
  const sizeError = checkUploadSize(file, "image");
  if (sizeError) {
    console.error("Project cover rejected:", sizeError);
    return null;
  }

  const copy = await copyFileForUpload(file);
  if (!copy) return null;

  const body = new FormData();
  body.set("file", copy, copy.name);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROJECT_COVER_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch("/api/board/projects/cover", {
      method: "POST",
      body,
      credentials: "include",
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null);
    const parsed = parseCoverUploadResponse(json);
    if (parsed) return parsed;
  } catch (error) {
    console.error("Project cover upload failed:", error);
  } finally {
    clearTimeout(timer);
  }

  return uploadCoverThroughBrowser(copy);
}
