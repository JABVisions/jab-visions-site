"use client";

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
  mimeType: string;
  createdAt: number;
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
  try {
    dataUrl = await fileToDataUrl(file);
  } catch {
    return null;
  }
  if (!dataUrl || dataUrl.length > MAX_DRAFT_DATAURL_BYTES) return null;

  const draft: DropDraft = {
    id: id || `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    kind: kindForMime(file.type),
    dataUrl,
    fileName: file.name || "drop-draft",
    mimeType: file.type || "application/octet-stream",
    createdAt: Date.now(),
  };

  const next = [draft, ...readDropDrafts().filter((d) => d.id !== draft.id)];
  writeDropDrafts(next);
  return draft;
}

export function removeDropDraft(id: string) {
  writeDropDrafts(readDropDrafts().filter((d) => d.id !== id));
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
