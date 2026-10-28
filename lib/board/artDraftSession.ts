"use client";

/** Persistent Art draft session — survives Drop Studio remounts, Safari
 *  suspend, and iPad tab reloads. IndexedDB is the source of truth. Cloud
 *  sync is best-effort and never blocks drawing. */

export const ART_DRAFT_DB = "jab_art_drafts_v1";
export const ART_DRAFT_STORE = "drafts";
export const ART_DRAFT_ID = "active-art";
export const ART_DRAFT_UPDATED_EVENT = "board:art-draft:updated";
export const ART_UNDO_LIMIT = 24;
export const ART_CANVAS_DPR_CAP = 2;

export type ArtDraftMeta = {
  draftId: string;
  dropType: "art";
  lastLocalSave: number;
  lastCloudSave: number;
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
  title?: string;
  paper: boolean;
  recovered: boolean;
  cloudId?: string;
  remoteUrl?: string;
};

type ArtDraftRecord = ArtDraftMeta & {
  overlay: Blob;
  thumbnail?: Blob;
};

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryMeta: ArtDraftMeta | null = null;
let persistTimer: number | null = null;
let cloudTimer: number | null = null;
let cloudBusy = false;

function canUseIdb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIdb()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(ART_DRAFT_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ART_DRAFT_STORE)) {
          db.createObjectStore(ART_DRAFT_STORE, { keyPath: "draftId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error("IndexedDB open failed"));
      };
    });
  }
  return dbPromise;
}

function emitUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ART_DRAFT_UPDATED_EVENT));
}

export function peekArtDraftMeta(): ArtDraftMeta | null {
  return memoryMeta;
}

export function hasArtDraft(): boolean {
  return Boolean(memoryMeta?.dirty || (memoryMeta && memoryMeta.updatedAt > 0));
}

function blankMeta(now = Date.now()): ArtDraftMeta {
  return {
    draftId: ART_DRAFT_ID,
    dropType: "art",
    lastLocalSave: 0,
    lastCloudSave: 0,
    dirty: false,
    createdAt: now,
    updatedAt: now,
    paper: false,
    recovered: false,
  };
}

export async function loadArtDraft(): Promise<ArtDraftRecord | null> {
  if (!canUseIdb()) return null;
  try {
    const db = await openDb();
    const record = await new Promise<ArtDraftRecord | null>((resolve, reject) => {
      const tx = db.transaction(ART_DRAFT_STORE, "readonly");
      const req = tx.objectStore(ART_DRAFT_STORE).get(ART_DRAFT_ID);
      req.onsuccess = () => resolve((req.result as ArtDraftRecord) || null);
      req.onerror = () => reject(req.error);
    });
    if (record?.overlay) {
      memoryMeta = {
        draftId: record.draftId,
        dropType: record.dropType,
        lastLocalSave: record.lastLocalSave,
        lastCloudSave: record.lastCloudSave,
        dirty: record.dirty,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        paper: record.paper,
        recovered: true,
        cloudId: record.cloudId,
        remoteUrl: record.remoteUrl,
      };
      return record;
    }
  } catch {
    // Safari private mode / quota — drawing still works without recovery.
  }
  return null;
}

export async function discardArtDraft(cloudId?: string) {
  const deleteId = cloudId || memoryMeta?.cloudId;
  memoryMeta = null;
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (cloudTimer) {
    window.clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  if (canUseIdb()) try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ART_DRAFT_STORE, "readwrite");
      tx.objectStore(ART_DRAFT_STORE).delete(ART_DRAFT_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
  if (deleteId) {
    void fetch(`/api/board/drop-drafts?id=${encodeURIComponent(deleteId)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => undefined);
  }
  emitUpdated();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function snapshotArtCanvas(
  canvas: HTMLCanvasElement,
  paper = false
): Promise<{ overlay: Blob; thumbnail: Blob | null } | null> {
  const overlay = await canvasToBlob(canvas, "image/webp", 0.82);
  if (!overlay) return null;
  const thumb = document.createElement("canvas");
  const max = 240;
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  thumb.width = Math.max(1, Math.round(canvas.width * scale));
  thumb.height = Math.max(1, Math.round(canvas.height * scale));
  thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  const thumbnail = await canvasToBlob(thumb, "image/jpeg", 0.7);
  return { overlay, thumbnail };
}

async function writeArtDraft(record: ArtDraftRecord) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ART_DRAFT_STORE, "readwrite");
    tx.objectStore(ART_DRAFT_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameArtDraft(title: string): Promise<boolean> {
  const nextTitle = title.trim().slice(0, 100);
  if (!nextTitle) return false;
  const record = await loadArtDraft();
  const now = Date.now();
  memoryMeta = {
    ...(memoryMeta || blankMeta(now)),
    title: nextTitle,
    updatedAt: now,
  };
  if (record?.overlay) {
    await writeArtDraft({ ...record, ...memoryMeta, title: nextTitle, updatedAt: now });
  }
  if (memoryMeta.cloudId) {
    void fetch("/api/board/drop-drafts", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: memoryMeta.cloudId, title: nextTitle }),
    }).catch(() => undefined);
  } else if (record?.overlay) {
    await syncArtDraftToCloud(record.overlay);
  }
  emitUpdated();
  return true;
}

export function markArtDraftDirty(paper = false) {
  const now = Date.now();
  memoryMeta = {
    ...(memoryMeta || blankMeta(now)),
    dirty: true,
    paper,
    updatedAt: now,
    recovered: memoryMeta?.recovered ?? false,
  };
  emitUpdated();
}

export function scheduleArtDraftPersist(canvas: HTMLCanvasElement, paper = false, delay = 700) {
  markArtDraftDirty(paper);
  if (typeof window === "undefined") return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistArtDraftNow(canvas, paper);
  }, delay);
}

export async function persistArtDraftNow(canvas: HTMLCanvasElement, paper = false) {
  if (!canUseIdb() || canvas.width < 2 || canvas.height < 2) return;
  try {
    const shot = await snapshotArtCanvas(canvas, paper);
    if (!shot) return;
    const now = Date.now();
    const meta: ArtDraftMeta = {
      ...(memoryMeta || blankMeta(now)),
      dirty: true,
      paper,
      lastLocalSave: now,
      updatedAt: now,
    };
    memoryMeta = meta;
    await writeArtDraft({
      ...meta,
      overlay: shot.overlay,
      thumbnail: shot.thumbnail || undefined,
    });
    emitUpdated();
    scheduleArtDraftCloud(shot.overlay);
  } catch {
    // Quota or private mode — keep drawing.
  }
}

function scheduleArtDraftCloud(overlay: Blob) {
  if (typeof window === "undefined") return;
  if (cloudTimer) window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(() => {
    cloudTimer = null;
    void syncArtDraftToCloud(overlay);
  }, 18_000);
}

async function syncArtDraftToCloud(overlay: Blob) {
  if (cloudBusy || overlay.size < 32) return;
  cloudBusy = true;
  try {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const sb = supabaseBrowser();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const path = `${user.id}/art-drafts/current.webp`;
    const { error: uploadError } = await sb.storage.from("board-media").upload(path, overlay, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "30",
    });
    if (uploadError) return;
    const cloudId = `art_${user.id}`;
    const savedAt = Date.now();
    await fetch("/api/board/drop-drafts", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: cloudId,
        dropType: "art",
        editorState: {
          type: "art-project",
          storagePath: path,
          bucket: "board-media",
          paper: memoryMeta?.paper || false,
          updatedAt: savedAt,
          title: memoryMeta?.title,
        },
      }),
    });
    if (memoryMeta) {
      memoryMeta = { ...memoryMeta, lastCloudSave: savedAt, cloudId };
    }
  } catch {
    // Local recovery still holds.
  } finally {
    cloudBusy = false;
  }
}

export async function syncCurrentArtDraftToCloud() {
  const record = await loadArtDraft();
  if (record?.overlay) await syncArtDraftToCloud(record.overlay);
}

export async function restoreArtDraftFromCloud(options: {
  signedUrl: string;
  cloudId: string;
  updatedAt: number;
  paper?: boolean;
}) {
  const response = await fetch(options.signedUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load saved Art Studio draft.");
  const overlay = await response.blob();
  const now = options.updatedAt || Date.now();
  const meta: ArtDraftMeta = {
    ...(memoryMeta || blankMeta(now)),
    draftId: ART_DRAFT_ID,
    dropType: "art",
    dirty: false,
    paper: Boolean(options.paper),
    createdAt: memoryMeta?.createdAt || now,
    updatedAt: now,
    lastCloudSave: now,
    recovered: true,
    cloudId: options.cloudId,
    remoteUrl: options.signedUrl,
  };
  memoryMeta = meta;
  await writeArtDraft({ ...meta, overlay, thumbnail: overlay });
  emitUpdated();
}

export function artDraftObjectUrl(blob: Blob | undefined | null) {
  if (!blob) return "";
  return URL.createObjectURL(blob);
}
