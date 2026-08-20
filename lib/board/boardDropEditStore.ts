// Shared store so a Board drop can be edited from ANYWHERE (feed, profile,
// console) without depending on <DropTile /> being mounted. DropTile owns the
// canonical drop list in `profiles.board_style.boardDrops` (mirrored to a
// localStorage key, optionally scoped per user). These helpers read/find/update
// that same source so an edit done from the feed lands in the exact same place.

import { supabaseBrowser } from "@/lib/supabase/browser";
import { syncActivitiesForDropEdit } from "@/lib/board/activity";
import { ensureImageFileMinResolution } from "@/lib/board/imageQuality";
import type { DropItem } from "@/lib/board/dropItem";
import { rememberDeletedDropId } from "@/lib/board/dropItem";

const STORAGE_KEY = "jab_board_drops_v2";
export const BOARD_MEDIA_BUCKET = "board-media";

function scopedKey(base: string, userId: string | null) {
  return userId ? `${base}:${userId}` : base;
}

function readArray(key: string): any[] {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Every local drop across scoped + bare keys, first-seen-wins, plus the key each id lives in. */
export function loadAllLocalDrops(): { items: DropItem[]; keyById: Record<string, string> } {
  const map = new Map<string, DropItem>();
  const keyById: Record<string, string> = {};
  if (typeof window === "undefined") return { items: [], keyById };

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}:`))) continue;
    for (const it of readArray(key)) {
      if (it && typeof it === "object" && it.id && !map.has(it.id)) {
        map.set(it.id, it as DropItem);
        keyById[it.id] = key;
      }
    }
  }
  return { items: Array.from(map.values()), keyById };
}

export function findLocalDropById(id: string): DropItem | null {
  if (!id) return null;
  const { items } = loadAllLocalDrops();
  return items.find((x) => x.id === id) ?? null;
}

/** Try several ids (feed row id, meta.dropId, etc.) — first canonical hit wins. */
export function findLocalDropByAnyId(...ids: Array<string | undefined | null>): DropItem | null {
  for (const id of ids) {
    if (!id) continue;
    const found = findLocalDropById(id);
    if (found) return found;
  }
  return null;
}

/** The owner's canonical drop list straight from Supabase (board_style.boardDrops). */
export async function getOwnerBoardDrops(): Promise<DropItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  try {
    const supabase = supabaseBrowser();
    const { data } = await supabase
      .from("profiles")
      .select("board_style")
      .eq("id", userId)
      .maybeSingle();
    const bs: any = data?.board_style;
    return bs && Array.isArray(bs.boardDrops) ? (bs.boardDrops as DropItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Find the drop to edit. Local cache first (fast), then the authoritative
 * Supabase list — so a drop that exists on the server but not in *this*
 * browser's localStorage (e.g. opened from the feed on another device) is still
 * editable.
 */
export async function loadDropForEdit(id: string): Promise<DropItem | null> {
  if (!id) return null;
  const local = findLocalDropById(id);
  if (local) return local;
  const remote = await getOwnerBoardDrops();
  return remote.find((x) => x && x.id === id) ?? null;
}

/** Load a drop's stored media from local cache, your profile, or the author's profile. */
export async function loadDropMediaForFeed(
  id: string,
  ownerUserId?: string | null
): Promise<DropItem | null> {
  if (!id) return null;

  const local = findLocalDropById(id);
  if (local) return local;

  const own = await loadDropForEdit(id);
  if (own) return own;

  const ownerId = ownerUserId?.trim();
  if (!ownerId) return null;

  try {
    const supabase = supabaseBrowser();
    const { data } = await supabase
      .from("profiles")
      .select("board_style")
      .eq("id", ownerId)
      .maybeSingle();
    const boardStyle =
      data?.board_style && typeof data.board_style === "object"
        ? (data.board_style as Record<string, unknown>)
        : null;
    const drops = Array.isArray(boardStyle?.boardDrops)
      ? (boardStyle.boardDrops as DropItem[])
      : [];
    return drops.find((x) => x && x.id === id) ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

const signedUrlInflight = new Map<string, Promise<string | null>>();
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGN_URL_TIMEOUT_MS = 12_000;

/** Signed URL for existing drop media (to reload it into Drop Studio). */
export async function getDropSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 60 * 30
): Promise<string | null> {
  const cleanBucket = bucket?.trim();
  const cleanPath = path?.trim();
  if (!cleanBucket || !cleanPath) return null;

  const key = `${cleanBucket}:${cleanPath}`;
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > now + 30_000) return cached.url;

  const inflight = signedUrlInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const supabase = supabaseBrowser();
      const signTask = supabase.storage
        .from(cleanBucket)
        .createSignedUrl(cleanPath, expiresIn)
        .then(({ data, error }) => (error || !data?.signedUrl ? null : data.signedUrl));

      const url = await Promise.race([
        signTask,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SIGN_URL_TIMEOUT_MS)),
      ]);

      if (url) {
        signedUrlCache.set(key, {
          url,
          expiresAt: now + expiresIn * 1000 - 60_000,
        });
      }
      return url;
    } catch {
      return null;
    } finally {
      signedUrlInflight.delete(key);
    }
  })();

  signedUrlInflight.set(key, request);
  return request;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "drop-media";
}

/** Upload replacement media for an existing drop. Returns the new storage path. */
export async function uploadDropMedia(
  file: File,
  dropId: string
): Promise<{ bucket: string; storagePath: string } | null> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return null;

  const uploadFile =
    file.type.startsWith("image/") &&
    file.type !== "image/gif" &&
    file.type !== "image/svg+xml"
      ? await ensureImageFileMinResolution(file)
      : file;

  const storagePath = `${userId}/${dropId}/${Date.now()}-${sanitizeFileName(uploadFile.name)}`;
  const { error } = await supabase.storage.from(BOARD_MEDIA_BUCKET).upload(storagePath, uploadFile, {
    upsert: true,
    contentType: uploadFile.type || "application/octet-stream",
    cacheControl: "3600",
  });
  if (error) {
    console.error("Drop media upload failed:", error);
    return null;
  }
  return { bucket: BOARD_MEDIA_BUCKET, storagePath };
}

/**
 * Save an edited drop in place: rewrite it in every local key that holds it,
 * keep the user's scoped list authoritative, and upsert the whole list to
 * Supabase (preserving the rest of board_style). Then ping listeners so any
 * mounted board surface re-renders with the new data.
 */
export async function persistDropEdit(updated: DropItem): Promise<void> {
  // Stamp the edit time so every surface can tell a fresh edit from a stale
  // cached copy (ActivityCard uses this to avoid overriding newer server data
  // with an out-of-date local snapshot).
  updated = { ...updated, updatedAt: Date.now() };
  const userId = await getCurrentUserId();

  // 1) Supabase is authoritative: read the existing boardDrops, merge THIS drop
  //    in by id (never replace the whole list from a possibly-empty cache), and
  //    write it back. This is also the ownership boundary — the row is RLS-scoped
  //    to the signed-in user, so you can only ever edit your own drops.
  let mergedList: DropItem[] | null = null;
  try {
    if (userId) {
      const supabase = supabaseBrowser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("board_style")
        .eq("id", userId)
        .maybeSingle();
      const currentStyle =
        profile?.board_style && typeof profile.board_style === "object"
          ? profile.board_style
          : {};
      const existing: DropItem[] = Array.isArray((currentStyle as any).boardDrops)
        ? (currentStyle as any).boardDrops
        : [];
      const has = existing.some((x) => x && x.id === updated.id);
      mergedList = has
        ? existing.map((x) => (x && x.id === updated.id ? updated : x))
        : [updated, ...existing];
      await supabase
        .from("profiles")
        .upsert(
          { id: userId, board_style: { ...currentStyle, boardDrops: mergedList } },
          { onConflict: "id" }
        );
    }
  } catch {
    // Local edit still stands (below) if the profile sync fails.
  }

  // 2) Mirror to local cache so mounted surfaces read fresh data. Update every
  //    key that already holds this drop, and keep the user's scoped key in sync
  //    with the authoritative merged list when we have it.
  if (typeof window !== "undefined") {
    const { keyById } = loadAllLocalDrops();
    const keys = new Set<string>();
    if (keyById[updated.id]) keys.add(keyById[updated.id]);
    const scoped = scopedKey(STORAGE_KEY, userId);
    keys.add(scoped);
    for (const key of keys) {
      let next: any[];
      if (mergedList && key === scoped) {
        next = mergedList;
      } else {
        const arr = readArray(key);
        const exists = arr.some((x: any) => x && x.id === updated.id);
        next = exists
          ? arr.map((x: any) => (x && x.id === updated.id ? updated : x))
          : [updated, ...arr];
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    }
  }

  // 3) Mirror title/description/media into feed activity rows (Activity Channel).
  try {
    let mediaPreviewUrl: string | null = null;
    if (updated.bucket && updated.storagePath) {
      mediaPreviewUrl = await getDropSignedUrl(updated.bucket, updated.storagePath, 60 * 45);
    } else if (updated.mediaUrl) {
      mediaPreviewUrl = updated.mediaUrl;
    }
    await syncActivitiesForDropEdit({ ...updated, mediaPreviewUrl });
  } catch {
    // boardDrops edit still stands.
  }

  // 4) Let mounted board surfaces refresh.
  try {
    window.dispatchEvent(
      new CustomEvent("board:drop:updated", { detail: { dropId: updated.id, drop: updated } })
    );
  } catch {}
}

/** Remove a drop from every local boardDrops mirror and the Supabase profile list. */
export async function removeDropFromBoardStore(
  dropId: string,
  alsoIds: string[] = [],
  knownUserId?: string | null
): Promise<void> {
  const purge = new Set([dropId, ...alsoIds].filter(Boolean));
  if (!purge.size) return;

  const userId =
    knownUserId ??
    (await Promise.race([
      getCurrentUserId(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
    ]));

  if (typeof window !== "undefined") {
    const keysToUpdate = new Set<string>();
    const { items, keyById } = loadAllLocalDrops();
    for (const d of items) {
      if (d?.id && purge.has(d.id) && keyById[d.id]) keysToUpdate.add(keyById[d.id]);
    }
    keysToUpdate.add(scopedKey(STORAGE_KEY, userId));

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}:`))) continue;
      keysToUpdate.add(key);
    }

    for (const key of keysToUpdate) {
      const arr = readArray(key);
      const next = arr.filter((x) => x && typeof x === "object" && !purge.has(String(x.id || "")));
      if (next.length !== arr.length) {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {}
      }
    }

    for (const id of purge) {
      rememberDeletedDropId(id, userId);
    }
  }

  try {
    if (!userId) return;
    await syncRemoveDropFromProfile(userId, purge);
  } catch {
    // Local removal still stands.
  }
}

async function syncRemoveDropFromProfile(userId: string, purge: Set<string>): Promise<void> {
  try {
    const supabase = supabaseBrowser();
    const profileResult = await Promise.race([
      supabase.from("profiles").select("board_style").eq("id", userId).maybeSingle(),
      new Promise<{ data: null }>((resolve) =>
        window.setTimeout(() => resolve({ data: null }), 5000)
      ),
    ]);
    const profile = profileResult?.data;
    const currentStyle =
      profile?.board_style && typeof profile.board_style === "object"
        ? profile.board_style
        : {};
    const existing: DropItem[] = Array.isArray((currentStyle as any).boardDrops)
      ? (currentStyle as any).boardDrops
      : [];
    const mergedList = existing.filter((x) => x && !purge.has(x.id));
    const deletedRaw = (currentStyle as any).boardDropsDeleted;
    const deleted = Array.isArray(deletedRaw) ? deletedRaw.map(String) : [];
    const nextDeleted = Array.from(new Set([...deleted, ...purge])).slice(0, 500);

    await Promise.race([
      supabase.from("profiles").upsert(
        {
          id: userId,
          board_style: {
            ...currentStyle,
            boardDrops: mergedList,
            boardDropsDeleted: nextDeleted,
          },
        },
        { onConflict: "id" }
      ),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Local removal still stands.
  }
}
