"use client";

import { uploadBoardMediaFile } from "@/lib/board/boardMediaUpload";

// Drop Studio drafts — captured/edited media saved locally so a drop can be
// finished later. Stored as data URLs (base64) with a size guard so large videos
// never blow the localStorage quota.

export const DROP_DRAFTS_STORAGE_KEY = "jab_drop_drafts_v1";
export const DROP_DRAFTS_UPDATED_EVENT = "board:drop-drafts:updated";

// Skip persisting anything whose data URL is larger than this (~6MB) so a single
// big capture can't evict everything else / throw.
const MAX_DRAFT_DATAURL_BYTES = 6_000_000;
const MAX_DRAFTS = 40;

export type DropDraftKind = "image" | "video" | "audio";

export type DropDraft = {
  id: string;
  kind: DropDraftKind;
  dataUrl: string;
  fileName: string;
  title?: string;
  mimeType: string;
  createdAt: number;
  /** How many times this draft has been saved (revision count). */
  count?: number;
  storageBucket?: string;
  storagePath?: string;
  fileSize?: number;
  lastModified?: number;
  remoteUrl?: string;
  remoteProject?: boolean;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readDropDrafts(): DropDraft[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DROP_DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d) => d && typeof d.id === "string" && typeof d.dataUrl === "string"
    ) as DropDraft[];
  } catch {
    return [];
  }
}

function writeDropDrafts(drafts: DropDraft[]) {
  if (!canUseStorage()) return;
  const ordered = [...drafts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_DRAFTS);
  try {
    window.localStorage.setItem(DROP_DRAFTS_STORAGE_KEY, JSON.stringify(ordered));
  } catch {
    try {
      window.localStorage.setItem(DROP_DRAFTS_STORAGE_KEY, JSON.stringify(ordered.slice(0, 8)));
    } catch {
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(DROP_DRAFTS_UPDATED_EVENT));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function kindForMime(type: string): DropDraftKind {
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "image";
}

/**
 * Save (or replace, when `id` is provided) a Drop Studio draft. Returns the
 * saved draft, or null if it couldn't be stored (too large / no storage).
 */
export async function saveDropDraft(file: File, id?: string): Promise<DropDraft | null> {
  if (!canUseStorage()) return null;
  let dataUrl = "";
  // Keep small media locally for an immediate preview. Larger media goes straight
  // to Board Storage and is represented by its cloud draft card.
  if (file.size <= Math.floor(MAX_DRAFT_DATAURL_BYTES * 0.7)) {
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      return null;
    }
    if (!dataUrl || dataUrl.length > MAX_DRAFT_DATAURL_BYTES) return null;
  }

  const draftId = id || `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const prior = readDropDrafts().find((d) => d.id === draftId);
  const sameSource = Boolean(
    prior?.storagePath &&
    prior.fileSize === file.size &&
    prior.lastModified === file.lastModified
  );
  const draft: DropDraft = {
    id: draftId,
    kind: kindForMime(file.type),
    dataUrl,
    fileName: file.name || "drop-draft",
    title: prior?.title || file.name || "Untitled draft",
    mimeType: file.type || "application/octet-stream",
    createdAt: Date.now(),
    // Re-saving the same draft bumps its revision count.
    count: (prior?.count ?? 0) + 1,
    storageBucket: sameSource ? prior?.storageBucket : undefined,
    storagePath: sameSource ? prior?.storagePath : undefined,
    fileSize: file.size,
    lastModified: file.lastModified,
  };

  const next = [draft, ...readDropDrafts().filter((d) => d.id !== draft.id)];
  writeDropDrafts(next);
  void syncDropDraftMediaToCloud(draft, file);
  return draft;
}

const mediaDraftSyncing = new Set<string>();

async function syncDropDraftMediaToCloud(draft: DropDraft, file: File) {
  if (mediaDraftSyncing.has(draft.id)) return;
  mediaDraftSyncing.add(draft.id);
  try {
    let bucket = draft.storageBucket || "board-media";
    let storagePath = draft.storagePath;
    if (!storagePath) {
      const uploaded = await uploadBoardMediaFile(file, { folder: `drafts/media/${draft.id}` });
      bucket = uploaded.bucket;
      storagePath = uploaded.storagePath;
    }
    const cloudDraft = { ...draft, storageBucket: bucket, storagePath };
    writeDropDrafts([cloudDraft, ...readDropDrafts().filter((item) => item.id !== draft.id)]);
    const response = await fetch("/api/board/drop-drafts", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        dropType: draft.kind,
        editorState: {
          type: "media",
          kind: draft.kind,
          fileName: draft.fileName,
          title: draft.title || draft.fileName,
          mimeType: draft.mimeType,
          createdAt: draft.createdAt,
          bucket,
          storagePath,
        },
      }),
    });
    if (!response.ok) console.warn("[Drafts] cloud media sync failed", response.status);
  } catch (error) {
    console.warn("[Drafts] cloud media sync unavailable", error);
  } finally {
    mediaDraftSyncing.delete(draft.id);
  }
}

/** Upload drafts already present in this browser so they become available elsewhere. */
export async function syncLocalDropDraftsToCloud() {
  for (const draft of readDropDrafts()) {
    const file = draftToFile(draft);
    if (file) await syncDropDraftMediaToCloud(draft, file);
  }
}

export function removeDropDraft(id: string) {
  writeDropDrafts(readDropDrafts().filter((d) => d.id !== id));
}

export function renameDropDraft(id: string, title: string): DropDraft | null {
  const nextTitle = title.trim().slice(0, 100);
  if (!id || !nextTitle) return null;
  const drafts = readDropDrafts();
  const current = drafts.find((draft) => draft.id === id);
  if (!current) return null;
  const renamed = { ...current, title: nextTitle, createdAt: Date.now() };
  writeDropDrafts(drafts.map((draft) => draft.id === id ? renamed : draft));
  return renamed;
}

/** Tiny listing card so a Voice Booth song still appears in Drafts when the take is too large for localStorage. */
const VOICE_STUDIO_CARD_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export function ensureVoiceStudioDraftCard(id: string, projectFileName?: string): DropDraft | null {
  if (!canUseStorage() || !id) return null;
  const prior = readDropDrafts().find((d) => d.id === id);
  const keepPreview =
    prior?.kind === "audio" &&
    typeof prior.dataUrl === "string" &&
    prior.dataUrl.length > 80 &&
    prior.dataUrl.length <= MAX_DRAFT_DATAURL_BYTES;
  const draft: DropDraft = {
    id,
    kind: "audio",
    dataUrl: keepPreview ? prior.dataUrl : VOICE_STUDIO_CARD_WAV,
    fileName: projectFileName || prior?.fileName || "Voice Booth project",
    title: prior?.title || projectFileName || prior?.fileName || "Voice Booth project",
    mimeType: "audio/wav",
    createdAt: Date.now(),
    count: (prior?.count ?? 0) + 1,
  };
  writeDropDrafts([draft, ...readDropDrafts().filter((d) => d.id !== draft.id)]);
  return draft;
}

/** Rebuild missing voice cards from IndexedDB without replacing saved sessions. */
export function restoreVoiceStudioDraftCards(
  projects: Array<{ draftId: string; updatedAt: number; fileName?: string }>
): DropDraft[] {
  if (!projects.length || !canUseStorage()) return readDropDrafts();
  const current = readDropDrafts();
  const existingIds = new Set(current.map((draft) => draft.id));
  const recovered: DropDraft[] = [];
  for (const project of projects) {
    if (!project.draftId || existingIds.has(project.draftId)) continue;
    existingIds.add(project.draftId);
    recovered.push({
      id: project.draftId,
      kind: "audio",
      dataUrl: VOICE_STUDIO_CARD_WAV,
      fileName: project.fileName || "Voice Booth project",
      title: project.fileName || "Voice Booth project",
      mimeType: "audio/wav",
      createdAt: project.updatedAt || Date.now(),
      count: 1,
    });
  }
  if (!recovered.length) return current;
  writeDropDrafts([...recovered, ...current]);
  return readDropDrafts();
}

/** Revision count for a draft id (how many times it's been saved). */
export function getDropDraftCount(id: string): number {
  if (!id) return 0;
  return readDropDrafts().find((d) => d.id === id)?.count ?? 0;
}

/** Total number of saved drafts in Drop Studio. */
export function getDropDraftTotal(): number {
  return readDropDrafts().length;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] || "application/octet-stream";
  const binary = atob(b64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Rebuild a File from a stored draft so it can be reopened in Drop Studio. */
export function draftToFile(draft: DropDraft): File | null {
  try {
    const blob = dataUrlToBlob(draft.dataUrl);
    return new File([blob], draft.fileName || "drop-draft", {
      type: draft.mimeType || blob.type || "application/octet-stream",
    });
  } catch {
    return null;
  }
}

export async function draftToFileAsync(draft: DropDraft): Promise<File | null> {
  if (draft.remoteUrl) {
    try {
      const response = await fetch(draft.remoteUrl, { cache: "no-store" });
      if (!response.ok) return null;
      const blob = await response.blob();
      return new File([blob], draft.fileName || "drop-draft", {
        type: draft.mimeType || blob.type || "application/octet-stream",
      });
    } catch {
      return null;
    }
  }
  return draftToFile(draft);
}
