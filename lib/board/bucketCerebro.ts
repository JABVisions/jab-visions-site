// File: lib/board/bucketCerebro.ts
export type BucketFolder = "pass" | "pin" | "push";

type BucketEntry = {
  activityId: string;
  savedAt: number;
};

type BucketRegistry = {
  version: 1;
  pass: BucketEntry[];
  pin: BucketEntry[];
  push: BucketEntry[];
  updatedAt: number;
};

const BUCKET_KEY = "jab_board_bucket_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readBucket(): BucketRegistry {
  const raw =
    typeof window !== "undefined" ? localStorage.getItem(BUCKET_KEY) : null;
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
  localStorage.setItem(BUCKET_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("board:bucket:updated"));
}

export function bucketDeposit(folder: BucketFolder, activityId: string) {
  if (typeof window === "undefined") return;

  const b = readBucket();
  const list = b[folder];

  // de-dupe: if already exists, move to top with new savedAt
  const now = Date.now();
  const without = list.filter((x) => x.activityId !== activityId);
  const nextList = [{ activityId, savedAt: now }, ...without].slice(0, 250);

  const next: BucketRegistry = {
    ...b,
    [folder]: nextList,
    updatedAt: now,
  } as BucketRegistry;

  writeBucket(next);

  // route attention to Bucket Cerebro
  window.dispatchEvent(new CustomEvent("board:bucket:setActive", { detail: folder }));
  window.dispatchEvent(new CustomEvent("board:bucket:open", { detail: { folder } }));
  window.dispatchEvent(new CustomEvent("board:bucket:flash", { detail: { folder } }));
}
