import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  readBrain,
  writeBrain,
  type BucketBrainState,
  type BucketEntry,
  type BucketFolder,
  type BucketMemoryDrop,
  type MutualEntry,
  type WaveEntry,
} from "@/lib/board/bucketBrain";

export type { BucketBrainState };

const FOLDERS: BucketFolder[] = ["pass", "pin", "push"];
const MAX_FOLDER = 80;
const MAX_WAVES = 200;
const MAX_MUTUALS = 200;
const META_KEYS = [
  "dropId",
  "originalDropId",
  "dropType",
  "visibility",
  "mediaKind",
  "bucket",
  "storagePath",
  "authorName",
  "authorUsername",
  "source",
  "reactionType",
];

function emptyBrain(updatedAt = 0): BucketBrainState {
  return {
    version: 3,
    pass: [],
    pin: [],
    push: [],
    waves: [],
    mutuals: [],
    updatedAt,
  };
}

function pairKey(a: string, b: string) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

function trimText(value: unknown, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.startsWith("data:")) return null;
  return text.slice(0, max);
}

function trimItem(item: BucketMemoryDrop | null | undefined): BucketMemoryDrop | null {
  if (!item || typeof item !== "object") return null;
  const metaIn = item.meta && typeof item.meta === "object" ? item.meta : null;
  const meta: Record<string, unknown> = {};
  if (metaIn) {
    for (const key of META_KEYS) {
      const value = metaIn[key];
      if (typeof value === "string" && value && !value.startsWith("data:")) meta[key] = value.slice(0, 300);
      else if (typeof value === "number" || typeof value === "boolean") meta[key] = value;
    }
  }
  return {
    id: String(item.id || ""),
    created_at: trimText(item.created_at, 40),
    user_id: trimText(item.user_id, 80),
    kind: trimText(item.kind, 40),
    title: trimText(item.title, 180),
    body: trimText(item.body, 400),
    href: trimText(item.href, 500),
    image_url: trimText(item.image_url, 500),
    meta: Object.keys(meta).length ? meta : null,
  };
}

function compactEntry(entry: BucketEntry): BucketEntry | null {
  const activityId = String(entry?.activityId || "");
  if (!activityId) return null;
  return {
    activityId,
    savedAt: Number(entry.savedAt) || 0,
    item: trimItem(entry.item),
    waveCount: Number(entry.waveCount) || 0,
    lastWavedAt: trimText(entry.lastWavedAt, 40) ?? undefined,
    wavedBy: Array.isArray(entry.wavedBy)
      ? entry.wavedBy.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 40)
      : [],
  };
}

export function compactBucketBrain(state: BucketBrainState): BucketBrainState {
  const next = emptyBrain(Number(state?.updatedAt) || 0);
  for (const folder of FOLDERS) {
    const seen = new Set<string>();
    const entries: BucketEntry[] = [];
    for (const raw of state?.[folder] ?? []) {
      const entry = compactEntry(raw);
      if (!entry || seen.has(entry.activityId)) continue;
      seen.add(entry.activityId);
      entries.push(entry);
      if (entries.length >= MAX_FOLDER) break;
    }
    next[folder] = entries;
  }
  const waves: WaveEntry[] = [];
  const waveIds = new Set<string>();
  for (const wave of state?.waves ?? []) {
    const id = String(wave?.id || "");
    if (!id || waveIds.has(id)) continue;
    waveIds.add(id);
    waves.push({
      id,
      from: String(wave.from || ""),
      to: String(wave.to || ""),
      createdAt: Number(wave.createdAt) || 0,
    });
    if (waves.length >= MAX_WAVES) break;
  }
  next.waves = waves;
  const mutuals: MutualEntry[] = [];
  const mutualKeys = new Set<string>();
  for (const mutual of state?.mutuals ?? []) {
    const key = pairKey(mutual?.a, mutual?.b);
    if (!mutual?.a || !mutual?.b || mutualKeys.has(key)) continue;
    mutualKeys.add(key);
    mutuals.push({
      id: String(mutual.id || key),
      a: String(mutual.a),
      b: String(mutual.b),
      createdAt: Number(mutual.createdAt) || 0,
      kind: "wave_wave",
    });
    if (mutuals.length >= MAX_MUTUALS) break;
  }
  next.mutuals = mutuals;
  return next;
}

function combineEntries(left: BucketEntry, right: BucketEntry): BucketEntry {
  const primary = (right.savedAt ?? 0) >= (left.savedAt ?? 0) ? right : left;
  const secondary = primary === right ? left : right;
  const lastWaved = [left.lastWavedAt, right.lastWavedAt].filter(Boolean).sort().at(-1);
  return {
    ...secondary,
    ...primary,
    savedAt: Math.max(left.savedAt ?? 0, right.savedAt ?? 0),
    waveCount: Math.max(left.waveCount ?? 0, right.waveCount ?? 0),
    lastWavedAt: lastWaved,
    wavedBy: Array.from(new Set([...(left.wavedBy ?? []), ...(right.wavedBy ?? [])])),
    item: primary.item ?? secondary.item ?? null,
  };
}

export function mergeBucketBrains(local: BucketBrainState, remote: BucketBrainState): BucketBrainState {
  const winner = new Map<string, { folder: BucketFolder; entry: BucketEntry }>();
  for (const brain of [local, remote]) {
    for (const folder of FOLDERS) {
      for (const entry of brain[folder] ?? []) {
        const id = String(entry?.activityId || "");
        if (!id) continue;
        const previous = winner.get(id);
        if (!previous) {
          winner.set(id, { folder, entry });
          continue;
        }
        const combined = combineEntries(previous.entry, entry);
        const folderForWinner = (entry.savedAt ?? 0) >= (previous.entry.savedAt ?? 0) ? folder : previous.folder;
        winner.set(id, { folder: folderForWinner, entry: combined });
      }
    }
  }

  const merged = emptyBrain(Math.max(Number(local?.updatedAt) || 0, Number(remote?.updatedAt) || 0));
  for (const { folder, entry } of winner.values()) {
    merged[folder].push(entry);
  }
  for (const folder of FOLDERS) {
    merged[folder].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  const waves = new Map<string, WaveEntry>();
  for (const wave of [...(local.waves ?? []), ...(remote.waves ?? [])]) {
    if (wave?.id) waves.set(wave.id, wave);
  }
  merged.waves = Array.from(waves.values())
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, MAX_WAVES);

  const mutuals = new Map<string, MutualEntry>();
  for (const mutual of [...(local.mutuals ?? []), ...(remote.mutuals ?? [])]) {
    if (!mutual?.a || !mutual?.b) continue;
    mutuals.set(pairKey(mutual.a, mutual.b), mutual);
  }
  merged.mutuals = Array.from(mutuals.values())
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, MAX_MUTUALS);

  return compactBucketBrain(merged);
}

export function parseBucketBrain(value: unknown): BucketBrainState {
  if (!value || typeof value !== "object") return emptyBrain(0);
  const raw = value as Partial<BucketBrainState>;
  return compactBucketBrain({
    version: 3,
    pass: Array.isArray(raw.pass) ? raw.pass : [],
    pin: Array.isArray(raw.pin) ? raw.pin : [],
    push: Array.isArray(raw.push) ? raw.push : [],
    waves: Array.isArray(raw.waves) ? raw.waves : [],
    mutuals: Array.isArray(raw.mutuals) ? raw.mutuals : [],
    updatedAt: Number(raw.updatedAt) || 0,
  });
}

function sameBrain(left: BucketBrainState, right: BucketBrainState) {
  return JSON.stringify(compactBucketBrain(left)) === JSON.stringify(compactBucketBrain(right));
}

function entryCount(state: BucketBrainState) {
  const compact = compactBucketBrain(state);
  return (
    compact.pass.length +
    compact.pin.length +
    compact.push.length +
    compact.waves.length +
    compact.mutuals.length
  );
}

export function shouldPushBucketBrain(
  local: BucketBrainState,
  remote: BucketBrainState,
  merged: BucketBrainState
) {
  if (sameBrain(remote, merged)) return false;
  const localCount = entryCount(local);
  const remoteCount = entryCount(remote);
  if (localCount === 0 && remoteCount === 0) return false;
  if (localCount === 0 && remoteCount > 0) return false;
  return true;
}

const LEGACY_BUCKET_KEY = "jab_board_bucket_v1";

export function adoptLegacyBucketIntoBrain() {
  if (typeof window === "undefined") return readBrain();
  try {
    const raw = window.localStorage.getItem(LEGACY_BUCKET_KEY);
    if (!raw) return readBrain();
    const parsed = JSON.parse(raw) as Partial<BucketBrainState>;
    const legacy = parseBucketBrain({
      pass: parsed.pass,
      pin: parsed.pin,
      push: parsed.push,
      updatedAt: parsed.updatedAt,
    });
    const local = readBrain();
    const merged = mergeBucketBrains(local, legacy);
    if (!sameBrain(local, merged)) writeBrain(merged, { sync: false });
    return merged;
  } catch {
    return readBrain();
  }
}

let syncing = false;
let pending = false;
let listenersReady = false;

function installBucketSyncListeners() {
  if (listenersReady || typeof window === "undefined") return;
  listenersReady = true;
  window.addEventListener("focus", () => {
    void syncBucketBrain();
  });
  window.setInterval(() => {
    void syncBucketBrain();
  }, 15000);
  try {
    const sb = supabaseBrowser();
    sb.auth.onAuthStateChange((event, session) => {
      if (!session?.user) return;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        void syncBucketBrain();
      }
    });
  } catch {
    // Focus and the interval retry once the session is readable.
  }
}

export async function syncBucketBrain(): Promise<BucketBrainState | null> {
  if (typeof window === "undefined") return null;
  installBucketSyncListeners();
  if (syncing) {
    pending = true;
    return null;
  }
  syncing = true;
  try {
    const adopted = adoptLegacyBucketIntoBrain();
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return adopted;

    const { data: profile, error } = await sb
      .from("profiles")
      .select("board_style")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (error || !profile) return adopted;

    const boardStyle =
      profile.board_style && typeof profile.board_style === "object" ? profile.board_style : {};
    const remote = parseBucketBrain((boardStyle as { bucketBrain?: unknown }).bucketBrain);
    const local = readBrain();
    const merged = mergeBucketBrains(local, remote);

    if (!sameBrain(local, merged)) writeBrain(merged, { sync: false });
    if (!shouldPushBucketBrain(local, remote, merged)) return merged;

    await sb
      .from("profiles")
      .update({
        board_style: {
          ...boardStyle,
          bucketBrain: merged,
          bucketStats: {
            pass: merged.pass.length,
            pin: merged.pin.length,
            push: merged.push.length,
            waves: merged.waves.length,
            mutuals: merged.mutuals.length,
            updatedAt: merged.updatedAt,
          },
        },
      })
      .eq("id", auth.user.id);
    return merged;
  } catch {
    // This device keeps its bucket if the account copy cannot be reached.
    return readBrain();
  } finally {
    syncing = false;
    if (pending) {
      pending = false;
      void syncBucketBrain();
    }
  }
}

let timer: number | null = null;

export function scheduleBucketBrainSync() {
  if (typeof window === "undefined") return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void syncBucketBrain();
  }, 600);
}
