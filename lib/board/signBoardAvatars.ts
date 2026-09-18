import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BOARD_AVATAR_BUCKET = "board-avatars";

export function isSignedBoardAvatarUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return (
    /\/storage\/v1\/(?:object|render\/image)\/(?:sign|authenticated)\//i.test(raw) &&
    (/[?&]token=/.test(raw) || /\/authenticated\//i.test(raw))
  );
}

export function boardAvatarStoragePath(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.startsWith("data:")) return null;
  const match = raw.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/board-avatars\/([^?]+)/i
  );
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return null;
  const path = raw.replace(/^board-avatars\//, "").replace(/^\/+/, "");
  return path || null;
}

export function supabaseAvatarSigner() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !(service || anon)) return null;
  return createClient(url, service || anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function applySignedBoardAvatars<T extends { avatarUrl?: string | null }>(
  client: Pick<SupabaseClient, "storage"> | null,
  items: T[],
  expiresIn = 60 * 60 * 24 * 7
): Promise<T[]> {
  if (!client || !items.length) return items;
  const pathByIndex = items.map((item) =>
    isSignedBoardAvatarUrl(item.avatarUrl) ? "" : boardAvatarStoragePath(item.avatarUrl) || ""
  );
  const unique = Array.from(new Set(pathByIndex.filter(Boolean)));
  if (!unique.length) return items;
  try {
    const { data } = await client.storage.from(BOARD_AVATAR_BUCKET).createSignedUrls(unique, expiresIn);
    const signedByPath = new Map<string, string>();
    for (const row of data || []) {
      if (row?.path && row.signedUrl && !row.error) signedByPath.set(row.path, row.signedUrl);
    }
    if (!signedByPath.size) return items;
    return items.map((item, index) => {
      const signed = pathByIndex[index] ? signedByPath.get(pathByIndex[index]) : "";
      return signed ? { ...item, avatarUrl: signed } : item;
    });
  } catch {
    return items;
  }
}
