// File: lib/board/bucket.ts
"use client";

export type BucketFolder = "pass" | "pin" | "push";

export type BucketEntry = {
  activityId: string;
  savedAt: number;
};

export type BucketRegistry = {
  version: 1;
  pass: BucketEntry[];
  pin: BucketEntry[];
  push: BucketEntry[];
  updatedAt: number;
};

export const BUCKET_KEY = "jab_board_bucket_v1";
export const BUCKET_UPDATED_EVENT = "board:bucket:updated";
export const BUCKET_SIGNAL_EVENT = "board:bucket:signal";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readBucket(): BucketRegistry {
  if (typeof window === "undefined") {
    return { version: 1, pass: [], pin: [], push: [], updatedAt: Date.now() };
  }

  const raw = localStorage.getItem(BUCKET_KEY);
  const parsed = safeParse<Partial<BucketRegistry>>(raw, {});

  return {
    version: 1,
    pass: Array.isArray(parsed.pass) ? parsed.pass : [],
    pin: Array.isArray(parsed.pin) ? parsed.pin : [],
    push: Array.isArray(parsed.push) ? parsed.push : [],
    updatedAt: Number(parsed.updatedAt ?? Date.now()),
  };
}

function writeBucket(next: BucketRegistry) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUCKET_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(BUCKET_UPDATED_EVENT));
}

/** Broadcast “brain signal” so UI can animate/react. */
function emitSignal(folder: BucketFolder, activityId: string, action: "add" | "remove") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BUCKET_SIGNAL_EVENT, {
      detail: { folder, activityId: String(activityId), action, at: Date.now() },
    })
  );
}

export function hasInFolder(folder: BucketFolder, activityId: string): boolean {
  const b = readBucket();
  const list = b[folder] ?? [];
  const id = String(activityId);
  return list.some((e) => String(e.activityId) === id);
}

function addIfMissing(folder: BucketFolder, activityId: string) {
  const b = readBucket();
  const id = String(activityId);
  const list = b[folder] ?? [];

  if (list.some((e) => String(e.activityId) === id)) {
    // Already saved; still emit a signal for micro-interactions if you want.
    emitSignal(folder, id, "add");
    return { changed: false, bucket: b };
  }

  const next: BucketRegistry = {
    ...b,
    [folder]: [{ activityId: id, savedAt: Date.now() }, ...list],
    updatedAt: Date.now(),
  };

  writeBucket(next);
  emitSignal(folder, id, "add");
  return { changed: true, bucket: next };
}

function removeIfPresent(folder: BucketFolder, activityId: string) {
  const b = readBucket();
  const id = String(activityId);
  const list = b[folder] ?? [];

  if (!list.some((e) => String(e.activityId) === id)) {
    return { changed: false, bucket: b };
  }

  const nextList = list.filter((e) => String(e.activityId) !== id);
  const next: BucketRegistry = {
    ...b,
    [folder]: nextList,
    updatedAt: Date.now(),
  };

  writeBucket(next);
  emitSignal(folder, id, "remove");
  return { changed: true, bucket: next };
}

/**
 * “Brain commands”
 * - PASS: always saved (one-way mark)
 * - PUSH: always saved (one-way mark)
 * - PIN: toggles (save/unsave)
 */
export function command(folder: BucketFolder, activityId: string) {
  if (folder === "pass") return addIfMissing("pass", activityId);
  if (folder === "push") return addIfMissing("push", activityId);

  // pin toggles
  const exists = hasInFolder("pin", activityId);
  return exists ? removeIfPresent("pin", activityId) : addIfMissing("pin", activityId);
}

export function clearFolder(folder: BucketFolder) {
  const b = readBucket();
  const next: BucketRegistry = { ...b, [folder]: [], updatedAt: Date.now() };
  writeBucket(next);
}

export function folderCounts(b?: BucketRegistry) {
  const bb = b ?? readBucket();
  return {
    pass: (bb.pass ?? []).length,
    pin: (bb.pin ?? []).length,
    push: (bb.push ?? []).length,
  };
}
