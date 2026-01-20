// File: lib/board/bucketBrain.ts
// Pure brain logic (NO JSX). UI belongs in app/components.
// This module is the single source of truth for: PASS / PIN / PUSH memory + WAVES + MUTUALS.

export type BucketFolder = "pass" | "pin" | "push";

export type BucketEntry = {
  activityId: string;
  savedAt: number;
  // room for future metadata:
  // fromUser?: string;
  // origin?: "feed" | "forum" | "work" | "profile";
};

export type WaveEntry = {
  id: string;
  from: string; // normalized username
  to: string;   // normalized username
  createdAt: number;
};

export type MutualEntry = {
  id: string;
  a: string; // normalized username
  b: string; // normalized username
  createdAt: number;
  kind: "wave_wave"; // future: "pass_pass" | "push_push" etc.
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

/** localStorage key */
export const BUCKET_BRAIN_KEY = "jab_board_bucket_brain_v3";

/** event names (used by UI + other components) */
export const EVT_UPDATED = "board:bucketBrain:updated";
export const EVT_OPEN = "board:bucketBrain:open";
export const EVT_DEPOSIT = "board:bucketBrain:deposit";

/** legacy aliases (in case older components import these names) */
export const EVT_BUCKET_UPDATED = EVT_UPDATED;
export const EVT_BUCKET_OPEN = EVT_OPEN;
export const EVT_BUCKET_DEPOSIT = EVT_DEPOSIT;

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

  const raw = localStorage.getItem(BUCKET_BRAIN_KEY);
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
  localStorage.setItem(BUCKET_BRAIN_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT_UPDATED));
}

/**
 * Deposit logic: PASS/PIN/PUSH always saves into bucket memory.
 * This is the “cyborg brain learns” action.
 */
export function depositToBrain(folder: BucketFolder, activityId: string) {
  const t = now();
  const prev = readBrain();

  const entry: BucketEntry = { activityId: String(activityId), savedAt: t };

  const next: BucketBrainState = {
    ...prev,
    [folder]: uniqBucketByActivityId([entry, ...(prev[folder] ?? [])]),
    updatedAt: t,
  } as BucketBrainState;

  writeBrain(next);

  // Optional: tell UI to open to the folder (feels like a command center responding)
  window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
}

/** Open bucket UI without depositing */
export function openBucket(folder?: BucketFolder) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
}

/**
 * Wave logic: stored separately as WaveEntry.
 * A “mutual” forms when A waves B and B waves A.
 */
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

  const waves = [wave, ...(prev.waves ?? [])].slice(0, 500); // cap

  // mutual detection (wave-wave)
  const hasReverse = waves.some((w) => w.from === tUser && w.to === f);
  let mutuals = prev.mutuals ?? [];

  if (hasReverse) {
    const key = pairKey(f, tUser);
    const exists = mutuals.some((m) => pairKey(m.a, m.b) === key && m.kind === "wave_wave");
    if (!exists) {
      mutuals = [
        {
          id: makeId("mutual"),
          a: f,
          b: tUser,
          createdAt: ts,
          kind: "wave_wave",
        },
        ...mutuals,
      ].slice(0, 500);
    }
  }

  writeBrain({
    ...prev,
    waves,
    mutuals,
    updatedAt: ts,
  });
}

/** Dev helper: simulate an incoming wave (someone -> me) */
export function simulateIncomingWave(me: string, someone: string) {
  // incoming means: from = someone, to = me
  sendWave(someone, me);
}

/**
 * Event bridge:
 * Any component can dispatch EVT_DEPOSIT instead of importing this module directly.
 * detail: { folder: "pass"|"pin"|"push", activityId: string }
 */
export function installBucketDepositBridge() {
  if (typeof window === "undefined") return;

  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    const detail = (ce?.detail ?? {}) as any;

    const folder = detail.folder as BucketFolder;
    const activityId = String(detail.activityId ?? "");

    if (!folder || !activityId) return;
    depositToBrain(folder, activityId);
  };

  window.addEventListener(EVT_DEPOSIT, handler as EventListener);

  return () => {
    window.removeEventListener(EVT_DEPOSIT, handler as EventListener);
  };
}
