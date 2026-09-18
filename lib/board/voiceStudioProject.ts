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
const ACTIVE_DRAFT_KEY = "jab_voice_studio_active_draft_v1";

export type VoiceStudioClipFile = {
  key: string;
  name: string;
  type: string;
  /** Legacy data-URL copies from early Voice Studio saves. */
  dataUrl?: string;
  /** Preferred: original clip bytes in IndexedDB. */
  blob?: Blob;
};

export type VoiceStudioProjectBlob = {
  draftId: string;
  updatedAt: number;
  snapshot: SessionEditSnapshot;
  files: VoiceStudioClipFile[];
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

function clipFileFromStored(media: VoiceStudioClipFile, updatedAt: number): File | null {
  if (media.blob) {
    return new File([media.blob], media.name, {
      type: media.type || media.blob.type || "audio/wav",
      lastModified: updatedAt,
    });
  }
  if (media.dataUrl) return dataUrlToFile(media.dataUrl, media.name, media.type);
  return null;
}

export function rememberActiveVoiceStudioDraft(draftId: string) {
  if (!draftId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_DRAFT_KEY, draftId);
  } catch {
    /* quota */
  }
}

export function readActiveVoiceStudioDraftId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_DRAFT_KEY);
  } catch {
    return null;
  }
}

/** Stable edit fingerprint so playhead ticks do not retrigger autosave. */
export function voiceStudioEditSignature(session: AudioSession | null): string {
  if (!session) return "";
  return JSON.stringify({
    loop: session.loop ?? null,
    tracks: session.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      label: track.label,
      latencyMs: track.latencyMs,
      mix: track.mix,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        offsetMs: clip.offsetMs,
        trimInMs: clip.trimInMs,
        trimOutMs: clip.trimOutMs,
        sourceDurationMs: clip.sourceDurationMs,
        volume: clip.volume,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
        file: `${clip.file.name}:${clip.file.size}:${clip.file.lastModified}`,
      })),
    })),
  });
}

export function sessionHasClips(session: AudioSession | null | undefined): boolean {
  return Boolean(session?.tracks.some((track) => track.clips.length > 0));
}

function projectToSession(blob: VoiceStudioProjectBlob): AudioSession | null {
  if (!blob?.snapshot || !blob.files?.length) return null;
  const shell: AudioSession = {
    id: `session-restore-${blob.draftId}`,
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
          const file = clipFileFromStored(media, blob.updatedAt);
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
  if (!sessionHasClips(shell)) return null;
  return applySessionSnapshot(shell, blob.snapshot);
}

/** Persist a multi-lane Voice Studio project alongside a Drop draft id. */
export async function saveVoiceStudioProject(
  draftId: string,
  session: AudioSession
): Promise<boolean> {
  if (!draftId || !sessionHasClips(session)) return false;
  try {
    const files: VoiceStudioClipFile[] = [];
    const seen = new Set<string>();
    for (const track of session.tracks) {
      for (const clip of track.clips) {
        const key = fileKey(clip.file);
        if (seen.has(key)) continue;
        seen.add(key);
        files.push({
          key,
          name: clip.file.name,
          type: clip.file.type || "audio/wav",
          blob: clip.file,
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
    rememberActiveVoiceStudioDraft(draftId);
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
    return blob ? projectToSession(blob) : null;
  } catch {
    return null;
  }
}

/** Resume the song that was last auto-saved in Voice Studio. */
export async function loadLatestVoiceStudioProject(): Promise<{
  draftId: string;
  session: AudioSession;
} | null> {
  const activeId = readActiveVoiceStudioDraftId();
  if (activeId) {
    const session = await loadVoiceStudioProject(activeId);
    if (session) return { draftId: activeId, session };
  }
  try {
    const db = await openDb();
    const rows = await new Promise<VoiceStudioProjectBlob[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as VoiceStudioProjectBlob[]);
      request.onerror = () => reject(request.error ?? new Error("project list failed"));
    });
    db.close();
    const newest = [...rows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (!newest) return null;
    const session = projectToSession(newest);
    if (!session) return null;
    return { draftId: newest.draftId, session };
  } catch {
    return null;
  }
}
