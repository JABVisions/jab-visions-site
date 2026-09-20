"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  isPublicBoardStorageUrl,
  resolveStoredMediaCoords,
} from "@/lib/board/musicPlayback";

export { isPublicBoardStorageUrl, isSignedBoardStorageUrl } from "@/lib/board/musicPlayback";

const TTL_MS = 40 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();

export function isMissingStorageObjectError(error: unknown): boolean {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const status = Number(record?.statusCode ?? record?.status ?? record?.status_code ?? 0);
  const statusText = String(record?.statusCode ?? record?.status ?? record?.status_code ?? "");
  if (status === 404 || status === 400 || statusText === "404" || statusText === "400") {
    return true;
  }
  const text = String(
    record?.message || record?.error || (error instanceof Error ? error.message : error) || ""
  ).toLowerCase();
  return /object not found|not found|no such file|does not exist|resource was not found|not_found/.test(
    text
  );
}

export type SignedMediaLookupOptions = {
  /** Private `board-media` 403s on public URLs. Video playback must not fall back. */
  allowPublicFallback?: boolean;
};

export async function getCachedSignedMediaUrl(
  bucket: string,
  path: string,
  opts?: SignedMediaLookupOptions
): Promise<string> {
  const coords = resolveStoredMediaCoords({ bucket, storagePath: path }) || {
    bucket,
    storagePath: path,
  };
  const signBucket = coords.bucket;
  const signPath = coords.storagePath;
  const key = `${signBucket}:${signPath}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    if (opts?.allowPublicFallback !== true && isPublicBoardStorageUrl(hit.url)) {
      cache.delete(key);
    } else {
      return hit.url;
    }
  }

  const supabase = supabaseBrowser();
  const { data, error } = await supabase.storage
    .from(signBucket)
    .createSignedUrl(signPath, 60 * 45);
  if (!error && data?.signedUrl && !isPublicBoardStorageUrl(data.signedUrl)) {
    cache.set(key, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  }
  if (isMissingStorageObjectError(error)) {
    cache.delete(key);
    if (opts?.allowPublicFallback !== true) return "";
  }
  // Private `board-media` 403s on getPublicUrl. Only opt-in callers may fall back.
  if (opts?.allowPublicFallback !== true) return "";
  return supabase.storage.from(signBucket).getPublicUrl(signPath).data.publicUrl || "";
}

export function invalidateSignedMediaUrl(bucket: string, path: string) {
  cache.delete(`${bucket}:${path}`);
}
