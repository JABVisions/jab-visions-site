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

function emptyBrain(): BucketBrainState {
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

export function isBucketCommentMemory(entry?: BucketEntry | null): boolean {
  if (!entry || typeof entry !== "object") return false;
  const id = String(entry.activityId || entry.item?.id || "");
  const kind = String(entry.item?.kind || "");
  const meta =
    entry.item?.meta && typeof entry.item.meta === "object" ? entry.item.meta : {};
  const source = String(meta.source || "");
  const reaction = String(meta.reactionType || "");
  return (
    id.startsWith("comment:") ||
    kind === "drop_comment" ||
    source === "drop_comments" ||
    reaction === "comment" ||
    Boolean(meta.commentId)
  );
}

function signalFolderEntries(entries: unknown): BucketEntry[] {
  if (!Array.isArray(entries)) return [];
  return (entries as BucketEntry[]).filter((entry) => !isBucketCommentMemory(entry));
}

function sanitizeBrainState(state: BucketBrainState): {
  next: BucketBrainState;
  changed: boolean;
} {
  const pass = signalFolderEntries(state.pass);
  const pin = signalFolderEntries(state.pin);
  const push = signalFolderEntries(state.push);
  const changed =
    pass.length !== (state.pass?.length ?? 0) ||
    pin.length !== (state.pin?.length ?? 0) ||
    push.length !== (state.push?.length ?? 0);
  return {
    next: { ...state, pass, pin, push },
    changed,
  };
}

export function readBrain(): BucketBrainState {
  if (typeof window === "undefined") return emptyBrain();

  try {
    const raw = window.localStorage.getItem(BUCKET_BRAIN_KEY);
    const parsed = safeParse<Partial<BucketBrainState>>(raw, {});
    const state: BucketBrainState = {
      version: 3,
      pass: Array.isArray(parsed.pass) ? (parsed.pass as BucketEntry[]) : [],
      pin: Array.isArray(parsed.pin) ? (parsed.pin as BucketEntry[]) : [],
      push: Array.isArray(parsed.push) ? (parsed.push as BucketEntry[]) : [],
      waves: Array.isArray(parsed.waves) ? (parsed.waves as WaveEntry[]) : [],
      mutuals: Array.isArray(parsed.mutuals) ? (parsed.mutuals as MutualEntry[]) : [],
      updatedAt: Number(parsed.updatedAt ?? now()),
    };
    return sanitizeBrainState(state).next;
  } catch {
    return emptyBrain();
  }
}

export function purgeCommentMemoryFromFolders() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(BUCKET_BRAIN_KEY);
    const parsed = safeParse<Partial<BucketBrainState>>(raw, {});
    const state: BucketBrainState = {
      version: 3,
      pass: Array.isArray(parsed.pass) ? (parsed.pass as BucketEntry[]) : [],
      pin: Array.isArray(parsed.pin) ? (parsed.pin as BucketEntry[]) : [],
      push: Array.isArray(parsed.push) ? (parsed.push as BucketEntry[]) : [],
      waves: Array.isArray(parsed.waves) ? (parsed.waves as WaveEntry[]) : [],
      mutuals: Array.isArray(parsed.mutuals) ? (parsed.mutuals as MutualEntry[]) : [],
      updatedAt: Number(parsed.updatedAt ?? now()),
    };
    const { next, changed } = sanitizeBrainState(state);
    if (changed) writeBrain(next);
  } catch {
    // keep Bucket usable if storage is locked
  }
}

function compactMemoryMeta(meta: Record<string, any> | null | undefined) {
  if (!meta || typeof meta !== "object") return null;
  return {
    dropId: meta.dropId ?? meta.originalDropId ?? null,
    originalDropId: meta.originalDropId ?? null,
    dropType: meta.dropType ?? meta.drop_flavor ?? null,
    drop_flavor: meta.drop_flavor ?? null,
    mediaKind: meta.mediaKind ?? null,
    mediaUrl: meta.mediaUrl ?? null,
    embedUrl: meta.embedUrl ?? null,
    bucket: meta.bucket ?? null,
    storagePath: meta.storagePath ?? null,
    fileName: meta.fileName ?? null,
    mime: meta.mime ?? null,
    previewImage: meta.previewImage ?? null,
    previewTitle: meta.previewTitle ?? null,
    previewDescription: meta.previewDescription ?? null,
    hostLabel: meta.hostLabel ?? null,
    fromDescript: meta.fromDescript ?? null,
    fromDropbook: meta.fromDropbook ?? null,
    priceCents: meta.priceCents ?? null,
    payProvider: meta.payProvider ?? null,
    visibility: meta.visibility ?? null,
    thoughtText: meta.thoughtText ?? null,
    thoughtFormat: meta.thoughtFormat ?? null,
    authorUsername: meta.authorUsername ?? null,
    authorName: meta.authorName ?? null,
  };
}

export function compactMemoryDrop(item?: BucketMemoryDrop | null): BucketMemoryDrop | null {
  if (!item || typeof item !== "object") return null;
  const meta = compactMemoryMeta(item.meta);
  const href =
    (typeof item.href === "string" && item.href) ||
    (typeof meta?.embedUrl === "string" && meta.embedUrl) ||
    (typeof meta?.mediaUrl === "string" && meta.mediaUrl) ||
    null;
  const body = typeof item.body === "string" ? item.body.slice(0, 4000) : item.body ?? null;
  return {
    id: String(item.id || meta?.dropId || ""),
    created_at: item.created_at ?? null,
    user_id: item.user_id ?? null,
    kind: item.kind ?? "board_drop",
    title: item.title ?? null,
    body,
    href,
    image_url: item.image_url ?? null,
    meta,
  };
}

export function writeBrain(next: BucketBrainState) {
  if (typeof window === "undefined") return;
  const { next: clean } = sanitizeBrainState(next);
  try {
    window.localStorage.setItem(BUCKET_BRAIN_KEY, JSON.stringify(clean));
    window.dispatchEvent(new Event(EVT_UPDATED));
  } catch {
    try {
      const slim: BucketBrainState = {
        ...clean,
        pass: clean.pass.map((entry) => ({ ...entry, item: compactMemoryDrop(entry.item) })),
        pin: clean.pin.map((entry) => ({ ...entry, item: compactMemoryDrop(entry.item) })),
        push: clean.push.map((entry) => ({ ...entry, item: compactMemoryDrop(entry.item) })),
      };
      window.localStorage.setItem(BUCKET_BRAIN_KEY, JSON.stringify(slim));
      window.dispatchEvent(new Event(EVT_UPDATED));
    } catch {
      // Safari private mode / quota — keep Bucket usable in-memory.
    }
  }
}

export function depositToBrain(
  folder: BucketFolder,
  activityId: string,
  item?: BucketMemoryDrop | null
) {
  const t = now();
  const prev = readBrain();
  const compactItem = compactMemoryDrop(item);
  const canonicalId = String(
    compactItem?.meta?.dropId || compactItem?.id || activityId || ""
  );
  if (!canonicalId) return;

  const previousEntry = (["pass", "pin", "push"] as BucketFolder[])
    .flatMap((key) => prev[key] ?? [])
    .find((entry) => {
      if (isBucketCommentMemory(entry)) return false;
      const entryId = String(entry.activityId);
      const entryDropId = String(entry.item?.meta?.dropId || entry.item?.id || "");
      return entryId === canonicalId || (entryDropId && entryDropId === canonicalId);
    });

  const entry: BucketEntry = {
    ...previousEntry,
    activityId: canonicalId,
    savedAt: t,
    item: compactItem ?? previousEntry?.item ?? null,
  };

  const matchesId = (saved: BucketEntry) => {
    const entryId = String(saved.activityId);
    const entryDropId = String(saved.item?.meta?.dropId || saved.item?.id || "");
    return (
      entryId === canonicalId ||
      entryId === String(activityId) ||
      (entryDropId && (entryDropId === canonicalId || entryDropId === String(activityId)))
    );
  };

  const next: BucketBrainState = {
    ...prev,
    pass: prev.pass.filter((saved) => !matchesId(saved)),
    pin: prev.pin.filter((saved) => !matchesId(saved)),
    push: prev.push.filter((saved) => !matchesId(saved)),
    [folder]: sortBucketEntries(
      uniqBucketByActivityId([
        entry,
        ...(prev[folder] ?? []).filter((saved) => !matchesId(saved)),
      ]),
      folder
    ),
    updatedAt: t,
  } as BucketBrainState;

  writeBrain(next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
  }
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

let depositBridgeCount = 0;

function onBucketDeposit(e: Event) {
  const detail = ((e as CustomEvent).detail ?? {}) as {
    folder?: BucketFolder;
    activityId?: string;
    item?: BucketMemoryDrop | null;
  };
  const folder = detail.folder;
  const activityId = String(detail.activityId ?? "");
  const item =
    detail.item && typeof detail.item === "object" ? detail.item : null;
  if (!folder || !activityId) return;
  depositToBrain(folder, activityId, item);
}

export function installBucketDepositBridge() {
  if (typeof window === "undefined") return () => { };
  if (depositBridgeCount === 0) {
    window.addEventListener(EVT_DEPOSIT, onBucketDeposit as EventListener);
    purgeCommentMemoryFromFolders();
  }
  depositBridgeCount += 1;

  return () => {
    depositBridgeCount = Math.max(0, depositBridgeCount - 1);
    if (depositBridgeCount === 0) {
      window.removeEventListener(EVT_DEPOSIT, onBucketDeposit as EventListener);
    }
  };
}

// ✅ Alias your feed expects
export function installBucketBrainBridge() {
  return installBucketDepositBridge();
}
