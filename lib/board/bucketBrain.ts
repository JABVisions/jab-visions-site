// File: lib/board/bucketBrain.ts
// Pure brain logic (NO JSX). UI belongs in app/components.
// Single source of truth for: PASS / PIN / PUSH memory + WAVES + MUTUALS.

export type BucketFolder = "pass" | "pin" | "push";

export type BucketMemoryDrop = {
  id: string;
  created_at?: string | null;
  user_id?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  href?: string | null;
  image_url?: string | null;
  meta?: Record<string, any> | null;
};

export type BucketEntry = {
  activityId: string;
  savedAt: number;
  item?: BucketMemoryDrop | null;
  waveCount?: number;
  lastWavedAt?: string;
  wavedBy?: string[];
  resonanceScore?: number;
};

export type WaveEntry = {
  id: string;
  from: string;
  to: string;
  createdAt: number;
};

export type MutualEntry = {
  id: string;
  a: string;
  b: string;
  createdAt: number;
  kind: "wave_wave";
};

export type BucketBrainState = {
  version: 3;

  pass: BucketEntry[];
  pin: BucketEntry[];
  push: BucketEntry[];

  waves: WaveEntry[];
  mutuals: MutualEntry[];

  updatedAt: number;
};

export const BUCKET_BRAIN_KEY = "jab_board_bucket_brain_v3";

export const EVT_UPDATED = "board:bucketBrain:updated";
export const EVT_OPEN = "board:bucketBrain:open";
export const EVT_DEPOSIT = "board:bucketBrain:deposit";

export const EVT_BUCKET_UPDATED = EVT_UPDATED;
export const EVT_BUCKET_OPEN = EVT_OPEN;
export const EVT_BUCKET_DEPOSIT = EVT_DEPOSIT;

export const WAVE_COOLDOWN_HOURS = 24;

function now() {
  return Date.now();
}

function normUser(x: string) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function uniqBucketByActivityId(arr: BucketEntry[]) {
  const seen = new Set<string>();
  const out: BucketEntry[] = [];
  for (const e of arr) {
    const k = String(e.activityId);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function hoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const time = new Date(dateString).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / 36e5;
}

export function getResonanceScore(
  item: BucketEntry,
  reactionType?: BucketFolder
) {
  const waveScore = (item.waveCount ?? 0) * 5;
  const folder =
    reactionType ||
    (item.item?.meta?.reactionType as BucketFolder | undefined) ||
    undefined;
  const reactionScore =
    folder === "push" ? 12 : folder === "pin" ? 8 : folder === "pass" ? 3 : 0;
  const lastWavedScore = item.lastWavedAt
    ? Math.max(0, 20 - hoursSince(item.lastWavedAt))
    : 0;

  return waveScore + reactionScore + lastWavedScore;
}

function sortBucketEntries(items: BucketEntry[], folder: BucketFolder) {
  return [...items].sort((a, b) => {
    const aScore = getResonanceScore(a, folder);
    const bScore = getResonanceScore(b, folder);
    if (bScore !== aScore) return bScore - aScore;

    const aWave = a.lastWavedAt ? new Date(a.lastWavedAt).getTime() : 0;
    const bWave = b.lastWavedAt ? new Date(b.lastWavedAt).getTime() : 0;
    if (bWave !== aWave) return bWave - aWave;

    return (b.savedAt ?? 0) - (a.savedAt ?? 0);
  });
}

function pairKey(a: string, b: string) {
  const A = normUser(a);
  const B = normUser(b);
  return A < B ? `${A}::${B}` : `${B}::${A}`;
}

export function readBrain(): BucketBrainState {
  if (typeof window === "undefined") {
    return {
      version: 3,
      pass: [],
      pin: [],
      push: [],
      waves: [],
      mutuals: [],
      updatedAt: now(),
    };
  }

  const raw = window.localStorage.getItem(BUCKET_BRAIN_KEY);
  const parsed = safeParse<Partial<BucketBrainState>>(raw, {});

  return {
    version: 3,
    pass: Array.isArray(parsed.pass) ? (parsed.pass as BucketEntry[]) : [],
    pin: Array.isArray(parsed.pin) ? (parsed.pin as BucketEntry[]) : [],
    push: Array.isArray(parsed.push) ? (parsed.push as BucketEntry[]) : [],
    waves: Array.isArray(parsed.waves) ? (parsed.waves as WaveEntry[]) : [],
    mutuals: Array.isArray(parsed.mutuals) ? (parsed.mutuals as MutualEntry[]) : [],
    updatedAt: Number(parsed.updatedAt ?? now()),
  };
}

export function writeBrain(next: BucketBrainState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUCKET_BRAIN_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw (quota exceeded, private mode, etc.). The bucket
    // brain is a best-effort memory cache, so a failed write must never break
    // the caller (e.g. posting a drop comment). Retry once with a trimmed
    // payload, then give up quietly instead of bubbling the error up.
    try {
      const trimmed: BucketBrainState = {
        ...next,
        pass: (next.pass ?? []).slice(0, 60),
        pin: (next.pin ?? []).slice(0, 60),
        push: (next.push ?? []).slice(0, 60),
      };
      window.localStorage.setItem(BUCKET_BRAIN_KEY, JSON.stringify(trimmed));
    } catch {
      return;
    }
  }
  window.dispatchEvent(new Event(EVT_UPDATED));
}

export function isInBrain(folder: BucketFolder, activityId: string) {
  const id = String(activityId || "");
  if (!id) return false;
  const brain = readBrain();
  return (brain[folder] ?? []).some((entry) => String(entry.activityId) === id);
}

export function withdrawFromBrain(folder: BucketFolder, activityId: string) {
  const id = String(activityId || "");
  if (!id) return false;

  const prev = readBrain();
  const list = prev[folder] ?? [];
  const nextList = list.filter((entry) => String(entry.activityId) !== id);
  if (nextList.length === list.length) return false;

  writeBrain({
    ...prev,
    [folder]: nextList,
    updatedAt: now(),
  } as BucketBrainState);

  return true;
}

export function depositToBrain(
  folder: BucketFolder,
  activityId: string,
  item?: BucketMemoryDrop | null
) {
  const t = now();
  const prev = readBrain();

  const entry: BucketEntry = {
    activityId: String(activityId),
    savedAt: t,
    ...(item ? { item } : {}),
  };

  const next: BucketBrainState = {
    ...prev,
    [folder]: sortBucketEntries(
      uniqBucketByActivityId([entry, ...(prev[folder] ?? [])]),
      folder
    ),
    updatedAt: t,
  } as BucketBrainState;

  writeBrain(next);
}

export function waveBucketDrop(
  folder: BucketFolder,
  activityId: string,
  userId: string
): { status: "waved" | "cooldown" | "missing"; entry?: BucketEntry } {
  const id = String(activityId || "");
  const user = normUser(userId || "me") || "me";
  if (!id) return { status: "missing" };

  const prev = readBrain();
  const list = prev[folder] ?? [];
  const index = list.findIndex((entry) => String(entry.activityId) === id);
  if (index < 0) return { status: "missing" };

  const current = list[index];
  const alreadyWaved = (current.wavedBy ?? []).some((w) => normUser(w) === user);
  const withinCooldown =
    alreadyWaved &&
    current.lastWavedAt &&
    hoursSince(current.lastWavedAt) < WAVE_COOLDOWN_HOURS;

  if (withinCooldown) return { status: "cooldown", entry: current };

  const nowIso = new Date().toISOString();
  const nextEntry: BucketEntry = {
    ...current,
    waveCount: (current.waveCount ?? 0) + 1,
    lastWavedAt: nowIso,
    wavedBy: Array.from(new Set([...(current.wavedBy ?? []), user])),
  };
  nextEntry.resonanceScore = getResonanceScore(nextEntry, folder);

  const nextList = [...list];
  nextList[index] = nextEntry;

  writeBrain({
    ...prev,
    [folder]: sortBucketEntries(nextList, folder),
    updatedAt: now(),
  } as BucketBrainState);

  return { status: "waved", entry: nextEntry };
}

export function openBucket(folder?: BucketFolder) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
}

export function sendWave(from: string, to: string) {
  const f = normUser(from);
  const tUser = normUser(to);
  if (!f || !tUser || f === tUser) return;

  const ts = now();
  const prev = readBrain();

  const wave: WaveEntry = {
    id: makeId("wave"),
    from: f,
    to: tUser,
    createdAt: ts,
  };

  const waves = [wave, ...(prev.waves ?? [])].slice(0, 500);

  const hasReverse = waves.some((w) => w.from === tUser && w.to === f);
  let mutuals = prev.mutuals ?? [];

  if (hasReverse) {
    const key = pairKey(f, tUser);
    const exists = mutuals.some(
      (m) => pairKey(m.a, m.b) === key && m.kind === "wave_wave"
    );

    if (!exists) {
      const newMutual: MutualEntry = {
        id: makeId("mutual"),
        a: f,
        b: tUser,
        createdAt: ts,
        kind: "wave_wave",
      };

      mutuals = [newMutual, ...mutuals].slice(0, 500);
    }
  }

  writeBrain({ ...prev, waves, mutuals, updatedAt: ts });
}

export function simulateIncomingWave(me: string, someone: string) {
  sendWave(someone, me);
}

export function installBucketDepositBridge() {
  if (typeof window === "undefined") return () => { };

  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    const detail = (ce?.detail ?? {}) as any;

    const folder = detail.folder as BucketFolder;
    const activityId = String(detail.activityId ?? "");
    const item =
      detail.item && typeof detail.item === "object"
        ? (detail.item as BucketMemoryDrop)
        : null;
    if (!folder || !activityId) return;

    depositToBrain(folder, activityId, item);
  };

  window.addEventListener(EVT_DEPOSIT, handler as EventListener);

  return () => {
    window.removeEventListener(EVT_DEPOSIT, handler as EventListener);
  };
}

// ✅ Alias your feed expects
export function installBucketBrainBridge() {
  return installBucketDepositBridge();
}
