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

export function removeLocalActivity(
  matcher: (item: BoardActivity) => boolean
) {
  const prev = getLocalActivity();
  const next = prev.filter((item) => !matcher(item));
  setLocalActivity(next);
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
