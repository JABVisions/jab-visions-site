// lib/board/activity.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/* types */
/* -------------------------------------------------------------------------- */

export type BoardActivityKind =
  | "board_drop"
  | "forum_post"
  | "announcement"
  | "status"
  | "system";

export type BoardActivity = {
  id: string;
  created_at: string; // ISO string
  user_id: string | null;

  kind: BoardActivityKind;

  title: string | null;
  body: string;

  href: string | null;
  image_url: string | null;

  meta: Record<string, any> | null;
};

export type CreateActivityInput = {
  user_id: string | null;
  kind: BoardActivityKind;
  title: string | null;
  body: string;
  href: string | null;
  image_url: string | null;
  meta: Record<string, any> | null;
};

/* -------------------------------------------------------------------------- */
/* local cache */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "jab_board_activity_v1";
const MAX_LOCAL = 120;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeActivity(x: any): BoardActivity | null {
  if (!x || typeof x !== "object") return null;

  const kind = String(x.kind || "") as BoardActivityKind;
  if (!kind) return null;

  const created =
    typeof x.created_at === "string" && x.created_at
      ? x.created_at
      : new Date().toISOString();

  const body = typeof x.body === "string" ? x.body : "";
  if (!body) return null;

  return {
    id: String(
      x.id ?? `local_${Date.now()}_${Math.random().toString(16).slice(2)}`
    ),
    created_at: created,
    user_id: x.user_id ?? null,
    kind,
    title: x.title ?? null,
    body,
    href: x.href ?? null,
    image_url: x.image_url ?? null,
    meta: x.meta && typeof x.meta === "object" ? x.meta : null,
  };
}

export function getLocalActivity(): BoardActivity[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeJsonParse<any[]>(raw, []);
  const cleaned = parsed
    .map(normalizeActivity)
    .filter(Boolean) as BoardActivity[];

  cleaned.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return cleaned.slice(0, MAX_LOCAL);
}

export function setLocalActivity(items: BoardActivity[]) {
  if (typeof window === "undefined") return;
  const next = items.slice(0, MAX_LOCAL);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function appendLocalActivity(item: BoardActivity) {
  const prev = getLocalActivity();
  const next = [item, ...prev].slice(0, MAX_LOCAL);
  setLocalActivity(next);
}

export function updateLocalActivity(
  id: string,
  updater: (item: BoardActivity) => BoardActivity
): BoardActivity | null {
  const prev = getLocalActivity();
  let updated: BoardActivity | null = null;
  const next = prev.map((item) => {
    if (item.id !== id) return item;
    updated = updater(item);
    return updated;
  });
  if (!updated) return null;
  setLocalActivity(next);
  return updated;
}

export type ActivityEditPatch = {
  title?: string | null;
  body?: string;
  href?: string | null;
  image_url?: string | null;
  meta?: Record<string, any> | null;
};

/** Update a feed activity row (announcements, etc.) in local cache + Supabase. */
export async function persistActivityEdit(
  activityId: string,
  patch: ActivityEditPatch
): Promise<BoardActivity | null> {
  const updated = updateLocalActivity(activityId, (item) => ({
    ...item,
    title: patch.title !== undefined ? patch.title : item.title,
    body: patch.body ?? item.body,
    href: patch.href !== undefined ? patch.href : item.href,
    image_url: patch.image_url !== undefined ? patch.image_url : item.image_url,
    meta: patch.meta ? { ...(item.meta ?? {}), ...patch.meta } : item.meta,
  }));
  if (!updated) return null;

  try {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (auth?.user) {
      await sb
        .from("board_activity")
        .update({
          title: updated.title,
          body: updated.body,
          href: updated.href,
          image_url: updated.image_url,
          meta: updated.meta,
        })
        .eq("id", activityId)
        .eq("user_id", auth.user.id);
    }
  } catch {
    // Local edit still stands.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("board:activity:updated", { detail: updated }));
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY })
    );
  }

  return updated;
}

export function removeLocalActivity(
  matcher: (item: BoardActivity) => boolean
) {
  const prev = getLocalActivity();
  const next = prev.filter((item) => !matcher(item));
  setLocalActivity(next);
}

/** Whether a feed row represents the given board drop id. */
export function activityMatchesDropId(item: BoardActivity, dropId: string): boolean {
  if (!dropId) return false;
  if (item.id === dropId) return true;
  const m = item.meta;
  if (!m || typeof m !== "object") return false;
  return m.dropId === dropId || m.originalDropId === dropId;
}

/**
 * Patch every local activity row tied to a board drop (by meta.dropId or id).
 * Returns the patched rows so callers can sync Supabase + dispatch events.
 */
export function patchLocalActivitiesMatchingDrop(
  dropId: string,
  patcher: (item: BoardActivity) => BoardActivity
): BoardActivity[] {
  const prev = getLocalActivity();
  const updatedItems: BoardActivity[] = [];
  let changed = false;
  const next = prev.map((item) => {
    if (!activityMatchesDropId(item, dropId)) return item;
    changed = true;
    const patched = patcher(item);
    updatedItems.push(patched);
    return patched;
  });
  if (changed) {
    setLocalActivity(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    }
  }
  return updatedItems;
}

/** Keep feed / Activity Channel rows in sync when a board drop is edited. */
export async function syncActivitiesForDropEdit(updated: {
  id: string;
  title: string;
  type?: string;
  description?: string;
  thoughtText?: string;
  titleRich?: unknown;
  descriptionRich?: unknown;
  customizations?: unknown;
  bucket?: string;
  storagePath?: string;
  mediaUrl?: string;
  mediaKind?: string;
  mime?: string;
  fileName?: string;
  mediaPreviewUrl?: string | null;
}): Promise<void> {
  const dropId = updated.id;
  const nextBody =
    updated.type === "Thought"
      ? String(updated.thoughtText ?? updated.description ?? "").trim()
      : String(updated.description ?? "").trim();

  const updatedActivities = patchLocalActivitiesMatchingDrop(dropId, (item) => {
    const prevPreview =
      item.meta?.preview && typeof item.meta.preview === "object" ? item.meta.preview : {};
    const mediaKind = updated.mediaKind ?? item.meta?.mediaKind ?? prevPreview?.mediaKind ?? null;
    const bucket = updated.bucket ?? item.meta?.bucket ?? prevPreview?.bucket ?? null;
    const storagePath =
      updated.storagePath ?? item.meta?.storagePath ?? prevPreview?.storagePath ?? null;
    const previewUrl =
      updated.mediaPreviewUrl ??
      updated.mediaUrl ??
      item.meta?.mediaUrl ??
      prevPreview?.image ??
      null;
    const nextMeta = {
      ...(item.meta ?? {}),
      titleRich: updated.titleRich ?? item.meta?.titleRich ?? null,
      descriptionRich: updated.descriptionRich ?? item.meta?.descriptionRich ?? null,
      description: updated.description ?? item.meta?.description ?? null,
      thoughtText: updated.thoughtText ?? item.meta?.thoughtText ?? null,
      customizations: updated.customizations ?? item.meta?.customizations ?? null,
      bucket,
      storagePath,
      mediaUrl: previewUrl,
      mediaKind,
      mime: updated.mime ?? item.meta?.mime ?? prevPreview?.mime ?? null,
      fileName: updated.fileName ?? item.meta?.fileName ?? prevPreview?.fileName ?? null,
      preview: {
        ...prevPreview,
        bucket,
        storagePath,
        mediaKind,
        mime: updated.mime ?? prevPreview?.mime ?? null,
        fileName: updated.fileName ?? prevPreview?.fileName ?? null,
        ...(mediaKind !== "audio" && previewUrl ? { image: previewUrl } : {}),
      },
    };

    let image_url = item.image_url;
    let href = item.href;
    if (previewUrl) {
      if (mediaKind === "audio") {
        href = previewUrl;
        image_url = null;
      } else if (mediaKind === "video") {
        href = previewUrl;
        image_url = null;
      } else {
        image_url = previewUrl;
      }
    }

    return {
      ...item,
      title: updated.title || item.title,
      body: nextBody || item.body,
      href,
      image_url,
      meta: nextMeta,
    };
  });

  if (!updatedActivities.length) return;

  try {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (auth?.user) {
      for (const activity of updatedActivities) {
        await sb
          .from("board_activity")
          .update({
            title: activity.title,
            body: activity.body,
            href: activity.href,
            image_url: activity.image_url,
            meta: activity.meta,
          })
          .eq("id", activity.id)
          .eq("user_id", auth.user.id);
      }
    }
  } catch {
    // Local cache already reflects the edit.
  }

  if (typeof window !== "undefined") {
    for (const activity of updatedActivities) {
      window.dispatchEvent(
        new CustomEvent("board:activity:updated", { detail: activity })
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* remote helpers */
/* -------------------------------------------------------------------------- */

export async function fetchActivity(
  sb: SupabaseClient,
  opts?: {
    limit?: number;
    offset?: number;
    kinds?: BoardActivityKind[];
  }
): Promise<BoardActivity[]> {
  const limit = opts?.limit ?? 30;
  const offset = opts?.offset ?? 0;

  const table = "board_activity";

  try {
    let q = sb
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (opts?.kinds?.length) {
      q = q.in("kind", opts.kinds);
    }

    const { data, error } = await q;
    if (error) throw error;

    const normalized = (data ?? [])
      .map(normalizeActivity)
      .filter(Boolean) as BoardActivity[];

    // warm local cache with the newest page only
    if (offset === 0 && normalized.length) setLocalActivity(normalized);

    return normalized;
  } catch {
    // fallback to local cache
    return getLocalActivity().slice(offset, offset + limit);
  }
}

export async function createActivity(
  sb: SupabaseClient,
  input: CreateActivityInput
): Promise<{ activity: BoardActivity; source: "db" | "local" }> {
  const now = new Date().toISOString();

  const localActivity: BoardActivity = {
    id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: now,
    user_id: input.user_id ?? null,
    kind: input.kind,
    title: input.title ?? null,
    body: input.body,
    href: input.href ?? null,
    image_url: input.image_url ?? null,
    meta: input.meta ?? null,
  };

  const table = "board_activity";

  try {
    // NOTE: if your table requires `scope`, add it here too
    const { data, error } = await sb
      .from(table)
      .insert({
        scope: "global", // ✅ required in your screenshot
        user_id: input.user_id,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        image_url: input.image_url,
        meta: input.meta,
      })
      .select("*")
      .single();

    if (error) throw error;

    const dbActivity = normalizeActivity(data) ?? localActivity;

    appendLocalActivity(dbActivity);
    return { activity: dbActivity, source: "db" };
  } catch {
    appendLocalActivity(localActivity);
    return { activity: localActivity, source: "local" };
  }
}
