"use client";

import {
  applySessionSnapshot,
  snapshotSession,
  type AudioSession,
  type SessionEditSnapshot,
} from "@/lib/board/audioSession";

const DB_NAME = "jab_voice_studio_projects_v1";
const STORE = "projects";
const DB_VERSION = 1;

export type VoiceStudioProjectBlob = {
  draftId: string;
  updatedAt: number;
  snapshot: SessionEditSnapshot;
  /** Original clip files keyed like history snapshots (`name:size:lastModified`). */
  files: Array<{ key: string; name: string; type: string; dataUrl: string }>;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "draftId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, name: string, type: string): File | null {
  try {
    const [head, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head ?? "")?.[1] || type || "application/octet-stream";
    const binary = atob(b64 ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime || type });
  } catch {
    return null;
  }
}

/** Persist a multi-lane Voice Studio project alongside a Drop draft id. */
export async function saveVoiceStudioProject(
  draftId: string,
  session: AudioSession
): Promise<boolean> {
  if (!draftId) return false;
  try {
    const files: VoiceStudioProjectBlob["files"] = [];
    const seen = new Set<string>();
    for (const track of session.tracks) {
      for (const clip of track.clips) {
        const key = fileKey(clip.file);
        if (seen.has(key)) continue;
        seen.add(key);
        const dataUrl = await fileToDataUrl(clip.file);
        // Soft cap per file (~8MB data URL) so one huge instrumental doesn't brick the store.
        if (dataUrl.length > 8_000_000) continue;
        files.push({
          key,
          name: clip.file.name,
          type: clip.file.type || "audio/wav",
          dataUrl,
        });
      }
    }
    if (!files.length) return false;

    const blob: VoiceStudioProjectBlob = {
      draftId,
      updatedAt: Date.now(),
      snapshot: snapshotSession(session),
      files,
    };
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("project save failed"));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Rebuild an AudioSession from a saved project (non-destructive edit graph). */
export async function loadVoiceStudioProject(draftId: string): Promise<AudioSession | null> {
  if (!draftId) return null;
  try {
    const db = await openDb();
    const blob = await new Promise<VoiceStudioProjectBlob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(draftId);
      request.onsuccess = () => resolve(request.result as VoiceStudioProjectBlob | undefined);
      request.onerror = () => reject(request.error ?? new Error("project load failed"));
    });
    db.close();
    if (!blob?.snapshot || !blob.files?.length) return null;

    const shell: AudioSession = {
      id: `session-restore-${draftId}`,
      sampleRate: 48_000,
      playheadMs: blob.snapshot.playheadMs ?? 0,
      loop: blob.snapshot.loop,
      tracks: blob.snapshot.tracks.map((track) => ({
        id: track.id,
        kind: track.kind,
        label: track.label,
        latencyMs: track.latencyMs,
        mix: track.mix,
        clips: track.clips
          .map((clip) => {
            const media = blob.files.find((file) => file.key === clip.fileKey);
            if (!media) return null;
            const file = dataUrlToFile(media.dataUrl, media.name, media.type);
            if (!file) return null;
            return {
              id: clip.id,
              name: clip.name,
              file,
              offsetMs: clip.offsetMs,
              trimInMs: clip.trimInMs,
              trimOutMs: clip.trimOutMs,
              sourceDurationMs: clip.sourceDurationMs,
              volume: clip.volume,
              fadeInMs: clip.fadeInMs,
              fadeOutMs: clip.fadeOutMs,
            };
          })
          .filter((clip): clip is NonNullable<typeof clip> => Boolean(clip)),
      })),
    };

    return applySessionSnapshot(shell, blob.snapshot);
  } catch {
    return null;
  }
}
