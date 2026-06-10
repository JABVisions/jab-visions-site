"use client";

// Cloud sync for Board data that historically lived only in localStorage
// (universal drops + Pay Drops). localStorage stays the source of truth for
// instant reads; this module mirrors it to Supabase so drops follow the user
// across devices.
//
// - Writes are debounced and fire-and-forget (UI never waits on the network).
// - On login / page load, hydrateCloudDrops() merges cloud rows into local
//   storage and pushes anything local-only back up.
// - If the tables haven't been created yet, sync disables itself for the
//   session and logs the SQL file to run (matches the app's setupRequired
//   pattern used by DMs and drop comments).

import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  DROPS_KEY,
  readDrops,
  writeDrops,
  type UniversalDrop,
} from "@/lib/board/drops/storage";
import {
  PAY_DROPS_UPDATED_EVENT,
  readPayDrops,
  writePayDrops,
  type PayDrop,
} from "@/lib/board/paydrops";

const UNIVERSAL_TABLE = "board_universal_drops";
const PAY_TABLE = "board_pay_drops";
const SYNC_DEBOUNCE_MS = 2500;
const SETUP_SQL_FILE = "supabase/sql/board_cloud_drops.sql";

let setupMissingWarned = false;
let cloudDisabled = false;

function isMissingTableError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("schema cache")
  );
}

function handleCloudError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (isMissingTableError(error)) {
    cloudDisabled = true;
    if (!setupMissingWarned) {
      setupMissingWarned = true;
      console.warn(
        `[Board cloud sync] Drops are saved locally only. To sync across devices, run ${SETUP_SQL_FILE} in the Supabase SQL editor.`
      );
    }
  }
}

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// push (local -> cloud), debounced per table
// ---------------------------------------------------------------------------

type PushPlan = {
  table: string;
  rows: Array<{ id: string; user_id: string; payload: unknown; updated_at: string }>;
  keepIds: Set<string>;
};

async function pushRows(plan: PushPlan, userId: string) {
  const supabase = supabaseBrowser();

  if (plan.rows.length) {
    const { error } = await supabase
      .from(plan.table)
      .upsert(plan.rows, { onConflict: "user_id,id" });
    if (error) {
      handleCloudError(error);
      return;
    }
  }

  // Remove cloud rows that no longer exist locally (drop deletions).
  const { data: existing, error: listError } = await supabase
    .from(plan.table)
    .select("id")
    .eq("user_id", userId);
  if (listError) {
    handleCloudError(listError);
    return;
  }

  const staleIds = (existing ?? [])
    .map((row) => String(row.id))
    .filter((id) => !plan.keepIds.has(id));

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from(plan.table)
      .delete()
      .eq("user_id", userId)
      .in("id", staleIds.slice(0, 500));
    if (deleteError) handleCloudError(deleteError);
  }
}

let universalTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleUniversalDropsSync() {
  if (cloudDisabled || typeof window === "undefined") return;
  if (universalTimer) clearTimeout(universalTimer);

  universalTimer = setTimeout(async () => {
    universalTimer = null;
    const userId = await currentUserId();
    if (!userId || cloudDisabled) return;

    const drops = readDrops();
    const now = new Date().toISOString();
    await pushRows(
      {
        table: UNIVERSAL_TABLE,
        rows: drops.map((drop) => ({
          id: drop.id,
          user_id: userId,
          payload: drop,
          updated_at: now,
        })),
        keepIds: new Set(drops.map((drop) => drop.id)),
      },
      userId
    );
  }, SYNC_DEBOUNCE_MS);
}

let payTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePayDropsSync(userId?: string | null) {
  if (cloudDisabled || typeof window === "undefined") return;
  if (payTimer) clearTimeout(payTimer);

  payTimer = setTimeout(async () => {
    payTimer = null;
    const uid = userId || (await currentUserId());
    if (!uid || cloudDisabled) return;

    const drops = readPayDrops(uid);
    const now = new Date().toISOString();
    await pushRows(
      {
        table: PAY_TABLE,
        rows: drops.map((drop) => ({
          id: drop.id,
          user_id: uid,
          payload: drop,
          updated_at: new Date(drop.updatedAt || Date.now()).toISOString(),
        })),
        keepIds: new Set(drops.map((drop) => drop.id)),
      },
      uid
    );
  }, SYNC_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// hydrate (cloud -> local), run on load / sign-in
// ---------------------------------------------------------------------------

async function hydrateUniversalDrops(userId: string) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from(UNIVERSAL_TABLE)
    .select("id, payload")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    handleCloudError(error);
    return;
  }

  const local = readDrops();
  const localIds = new Set(local.map((drop) => drop.id));
  const cloudOnly = (data ?? [])
    .map((row) => row.payload as UniversalDrop)
    .filter((drop) => drop && typeof drop === "object" && drop.id)
    .filter((drop) => !localIds.has(drop.id));

  if (cloudOnly.length) {
    const merged = [...local, ...cloudOnly]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 250);
    writeDrops(merged);
    window.dispatchEvent(new CustomEvent("board:drops:updated"));
    window.dispatchEvent(new StorageEvent("storage", { key: DROPS_KEY }));
  }

  // Push anything that only exists locally (first sync after install).
  const cloudIds = new Set((data ?? []).map((row) => String(row.id)));
  if (local.some((drop) => !cloudIds.has(drop.id))) {
    scheduleUniversalDropsSync();
  }
}

async function hydratePayDrops(userId: string) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from(PAY_TABLE)
    .select("id, payload")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    handleCloudError(error);
    return;
  }

  const local = readPayDrops(userId);
  const localById = new Map(local.map((drop) => [drop.id, drop]));
  let changed = false;

  for (const row of data ?? []) {
    const cloud = row.payload as PayDrop;
    if (!cloud || typeof cloud !== "object" || !cloud.id) continue;
    const mine = localById.get(cloud.id);
    if (!mine) {
      localById.set(cloud.id, cloud);
      changed = true;
    } else if ((cloud.updatedAt || 0) > (mine.updatedAt || 0)) {
      localById.set(cloud.id, cloud);
      changed = true;
    }
  }

  if (changed) {
    const merged = Array.from(localById.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    writePayDrops(merged, userId);
    window.dispatchEvent(new CustomEvent(PAY_DROPS_UPDATED_EVENT));
  }

  const cloudIds = new Set((data ?? []).map((row) => String(row.id)));
  if (local.some((drop) => !cloudIds.has(drop.id))) {
    schedulePayDropsSync(userId);
  }
}

let hydratedForUser: string | null = null;

export async function hydrateCloudDrops() {
  if (cloudDisabled || typeof window === "undefined") return;

  const userId = await currentUserId();
  if (!userId || hydratedForUser === userId) return;
  hydratedForUser = userId;

  await Promise.all([hydrateUniversalDrops(userId), hydratePayDrops(userId)]);
}
