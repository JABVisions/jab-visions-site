/**
 * Durable blobs for extra V5 clips. The primary tape stays with Drop Studio's
 * existing file ref / Drafts card. Imported clips above the cap stay in memory
 * for the open session only.
 */

export const DROP_STUDIO_V5_MEDIA_DB = "jab_drop_studio_v5";
export const DROP_STUDIO_V5_MEDIA_STORE = "clips";
/** Keep IndexedDB off the multi-gigabyte audition path. */
export const DROP_STUDIO_V5_MEDIA_MAX_BYTES = 48 * 1024 * 1024;

export type DropStudioV5MediaRecord = {
  id: string;
  draftId: string;
  mediaKey: string;
  name: string;
  mimeType: string;
  blob: Blob;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function dropStudioV5MediaId(draftId: string, mediaKey: string) {
  return `${draftId}::${mediaKey}`;
}

export function canPersistDropStudioV5Media(byteLength: number) {
  return Number.isFinite(byteLength) && byteLength > 0 && byteLength <= DROP_STUDIO_V5_MEDIA_MAX_BYTES;
}

function canUseIdb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIdb()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DROP_STUDIO_V5_MEDIA_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DROP_STUDIO_V5_MEDIA_STORE)) {
          db.createObjectStore(DROP_STUDIO_V5_MEDIA_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error("IndexedDB open failed"));
      };
    });
  }
  return dbPromise;
}

export async function saveDropStudioV5Media(
  draftId: string,
  mediaKey: string,
  file: Blob & { name?: string; type?: string }
): Promise<boolean> {
  if (!draftId || !mediaKey || !canPersistDropStudioV5Media(file.size)) return false;
  try {
    const db = await openDb();
    const record: DropStudioV5MediaRecord = {
      id: dropStudioV5MediaId(draftId, mediaKey),
      draftId,
      mediaKey,
      name: file.name || "clip",
      mimeType: file.type || "application/octet-stream",
      blob: file,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DROP_STUDIO_V5_MEDIA_STORE, "readwrite");
      tx.objectStore(DROP_STUDIO_V5_MEDIA_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadDropStudioV5Media(draftId: string): Promise<DropStudioV5MediaRecord[]> {
  if (!draftId || !canUseIdb()) return [];
  try {
    const db = await openDb();
    const rows = await new Promise<DropStudioV5MediaRecord[]>((resolve, reject) => {
      const tx = db.transaction(DROP_STUDIO_V5_MEDIA_STORE, "readonly");
      const request = tx.objectStore(DROP_STUDIO_V5_MEDIA_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []) as DropStudioV5MediaRecord[]);
      request.onerror = () => reject(request.error);
    });
    return rows.filter((row) => row.draftId === draftId && row.blob);
  } catch {
    return [];
  }
}
