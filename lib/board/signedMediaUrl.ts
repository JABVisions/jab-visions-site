"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

const TTL_MS = 40 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();

export async function getCachedSignedMediaUrl(
  bucket: string,
  path: string
): Promise<string> {
  const key = `${bucket}:${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;

  const supabase = supabaseBrowser();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 45);
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const url = (!error && data?.signedUrl) || publicUrl || "";
  if (url) cache.set(key, { url, at: Date.now() });
  return url;
}

export function invalidateSignedMediaUrl(bucket: string, path: string) {
  cache.delete(`${bucket}:${path}`);
}
