"use client";

// In-progress Dropbook shelf — cover + pages persisted locally and mirrored to
// Supabase (profiles.board_style.dropbookProgress) so a book follows the user.

import { supabaseBrowser } from "@/lib/supabase/browser";
import { BOARD_MEDIA_BUCKET, getCurrentUserId } from "@/lib/board/boardDropEditStore";
import { ensureImageFileMinResolution } from "@/lib/board/imageQuality";

export const DROPBOOK_PROGRESS_STORAGE_KEY = "jab_dropbook_progress_v1";
export const DROPBOOK_PROGRESS_UPDATED_EVENT = "board:dropbook-progress:updated";

const MAX_ASSET_DATAURL_BYTES = 6_000_000;

export type StoredDropbookCaptureMode = "photo" | "video" | "audio" | "art" | "descript";

export type StoredDropbookMedia = {
  dataUrl?: string;
  fileName: string;
  mimeType: string;
  bucket?: string;
  storagePath?: string;
  publicUrl?: string;
};

export type StoredDropbookPage = {
  id: string;
  dropId?: string;
  mode?: StoredDropbookCaptureMode;
  label?: string;
  captureSource?: "capture" | "upload";
  media?: StoredDropbookMedia;
};

export type StoredDropbookCover = {
  id: string;
  bookColor: string;
  bookColorSet: boolean;
  complete: boolean;
  coverSource?: "blank" | "drop";
  sourceChipId?: string;
  mode?: StoredDropbookCaptureMode;
  media?: StoredDropbookMedia;
};

export type DropbookProgress = {
  savedAt: number;
  coverBlankColor: string;
  cover: StoredDropbookCover;
  pages: StoredDropbookPage[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function blobUrlToDataUrl(url: string): Promise<string | null> {
  if (!url.startsWith("blob:")) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return fileToDataUrl(new File([blob], "dropbook-asset", { type: blob.type || "image/png" }));
  } catch {
    return null;
  }
}

async function fileOrPreviewToMedia(
  file?: File,
  previewUrl?: string,
  fallbackName = "dropbook-asset"
): Promise<StoredDropbookMedia | null> {
  let dataUrl = "";
  let fileName = fallbackName;
  let mimeType = "application/octet-stream";

  if (file) {
    try {
      dataUrl = await fileToDataUrl(file);
      fileName = file.name || fallbackName;
      mimeType = file.type || mimeType;
    } catch {
      return null;
    }
  } else if (previewUrl) {
    const fromBlob = await blobUrlToDataUrl(previewUrl);
    if (!fromBlob) return null;
    dataUrl = fromBlob;
    const mime = /data:([^;]+)/.exec(fromBlob)?.[1];
    if (mime) mimeType = mime;
    const ext = mime?.includes("video") ? "webm" : mime?.includes("audio") ? "webm" : "jpg";
    fileName = `${fallbackName}.${ext}`;
  } else {
    return null;
  }

  if (!dataUrl || dataUrl.length > MAX_ASSET_DATAURL_BYTES) return null;
  return { dataUrl, fileName, mimeType };
}

function dataUrlToFile(media: StoredDropbookMedia): File | null {
  if (!media.dataUrl) return null;
  try {
    const [head, b64] = media.dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head ?? "")?.[1] || media.mimeType || "application/octet-stream";
    const binary = atob(b64 ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], media.fileName || "dropbook-asset", { type: mime });
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "dropbook-asset";
}

async function uploadDropbookFile(userId: string, file: File, label: string): Promise<StoredDropbookMedia | null> {
  const uploadFile =
    file.type.startsWith("image/") && file.type !== "image/gif" && file.type !== "image/svg+xml"
      ? await ensureImageFileMinResolution(file)
      : file;

  try {
    const supabase = supabaseBrowser();
    const storagePath = `${userId}/dropbook/${Date.now()}-${sanitizeFileName(uploadFile.name || label)}`;
    const { error } = await supabase.storage.from(BOARD_MEDIA_BUCKET).upload(storagePath, uploadFile, {
      upsert: true,
      contentType: uploadFile.type || "application/octet-stream",
      cacheControl: "3600",
    });
    if (error) return null;
    const { data } = supabase.storage.from(BOARD_MEDIA_BUCKET).getPublicUrl(storagePath);
    if (!data?.publicUrl) return null;
    return {
      fileName: uploadFile.name || label,
      mimeType: uploadFile.type || "application/octet-stream",
      bucket: BOARD_MEDIA_BUCKET,
      storagePath,
      publicUrl: data.publicUrl,
    };
  } catch {
    return null;
  }
}

async function fileOrPreviewToCloudMedia(
  userId: string,
  file?: File,
  previewUrl?: string,
  fallbackName = "dropbook-asset"
): Promise<StoredDropbookMedia | null> {
  if (file) return uploadDropbookFile(userId, file, fallbackName);
  if (!previewUrl?.startsWith("blob:")) return null;
  try {
    const res = await fetch(previewUrl);
    const blob = await res.blob();
    const mime = blob.type || "application/octet-stream";
    const ext = mime.includes("video") ? "webm" : mime.includes("audio") ? "webm" : "jpg";
    const cloudFile = new File([blob], `${fallbackName}.${ext}`, { type: mime });
    return uploadDropbookFile(userId, cloudFile, fallbackName);
  } catch {
    return null;
  }
}

async function readDropbookProgressFromCloud(): Promise<DropbookProgress | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  try {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from("profiles").select("board_style").eq("id", userId).maybeSingle();
    const boardStyle =
      data?.board_style && typeof data.board_style === "object"
        ? (data.board_style as Record<string, unknown>)
        : null;
    const remote = boardStyle?.dropbookProgress;
    if (!remote || typeof remote !== "object") return null;
    const parsed = remote as DropbookProgress;
    if (!parsed.cover || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function syncDropbookProgressToCloud(progress: DropbookProgress): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const supabase = supabaseBrowser();
  const { data: profile } = await supabase.from("profiles").select("board_style").eq("id", userId).maybeSingle();
  const currentStyle =
    profile?.board_style && typeof profile.board_style === "object"
      ? (profile.board_style as Record<string, unknown>)
      : {};

  await supabase.from("profiles").upsert({
    id: userId,
    board_style: { ...currentStyle, dropbookProgress: progress },
  });
}

function progressToRestored(saved: DropbookProgress): RestoredDropbookProgress {
  let coverPreviewUrl: string | undefined;
  if (saved.cover.media?.publicUrl) {
    coverPreviewUrl = saved.cover.media.publicUrl;
  } else if (saved.cover.media) {
    const file = dataUrlToFile(saved.cover.media);
    if (file) coverPreviewUrl = mediaToPreview(file);
  }

  const pages: RestoredDropbookPage[] = saved.pages.map((page) => {
    if (!page.media) {
      return {
        id: page.id,
        dropId: page.dropId,
        mode: page.mode,
        label: page.label,
        captureSource: page.captureSource,
      };
    }
    if (page.media.publicUrl) {
      return {
        id: page.id,
        dropId: page.dropId,
        mode: page.mode,
        label: page.label,
        captureSource: page.captureSource,
        previewUrl: page.media.publicUrl,
      };
    }
    const file = dataUrlToFile(page.media);
    if (!file) {
      return {
        id: page.id,
        dropId: page.dropId,
        mode: page.mode,
        label: page.label,
        captureSource: page.captureSource,
      };
    }
    return {
      id: page.id,
      dropId: page.dropId,
      mode: page.mode,
      label: page.label,
      captureSource: page.captureSource,
      previewUrl: mediaToPreview(file),
      sourceFile: file,
    };
  });

  return {
    coverBlankColor: saved.coverBlankColor,
    cover: {
      id: saved.cover.id,
      bookColor: saved.cover.bookColor,
      bookColorSet: saved.cover.bookColorSet,
      complete: saved.cover.complete,
      coverSource: saved.cover.coverSource,
      sourceChipId: saved.cover.sourceChipId,
      mode: saved.cover.mode,
      previewUrl: coverPreviewUrl,
    },
    pages,
  };
}

export function readDropbookProgress(): DropbookProgress | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(DROPBOOK_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DropbookProgress;
    if (!parsed?.cover || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDropbookProgress(progress: DropbookProgress | null) {
  if (!canUseStorage()) return;
  try {
    if (!progress) {
      window.localStorage.removeItem(DROPBOOK_PROGRESS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(DROPBOOK_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    }
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(DROPBOOK_PROGRESS_UPDATED_EVENT));
}

export function clearDropbookProgress() {
  writeDropbookProgress(null);
}

export function hasDropbookProgress(): boolean {
  return readDropbookProgress() !== null;
}

export type SaveDropbookProgressInput = {
  coverBlankColor: string;
  cover: {
    id: string;
    bookColor: string;
    bookColorSet: boolean;
    complete: boolean;
    coverSource?: "blank" | "drop";
    sourceChipId?: string;
    mode?: StoredDropbookCaptureMode;
    previewUrl?: string;
    sourceFile?: File;
  };
  pages: Array<{
    id: string;
    dropId?: string;
    mode?: StoredDropbookCaptureMode;
    label?: string;
    captureSource?: "capture" | "upload";
    previewUrl?: string;
    sourceFile?: File;
  }>;
};

export type SaveDropbookProgressResult = {
  ok: boolean;
  skippedAssets: number;
};

/** Persist the current Dropbook shelf (cover + page slots). */
export async function saveDropbookProgress(
  input: SaveDropbookProgressInput
): Promise<SaveDropbookProgressResult> {
  if (!canUseStorage()) return { ok: false, skippedAssets: 0 };

  let skippedAssets = 0;

  const coverMedia = input.cover.complete
    ? await fileOrPreviewToMedia(
        input.cover.sourceFile,
        input.cover.previewUrl,
        "dropbook-cover"
      )
    : null;
  if (input.cover.complete && input.cover.previewUrl && !coverMedia) skippedAssets += 1;

  const pages: StoredDropbookPage[] = [];
  for (const page of input.pages) {
    const media = await fileOrPreviewToMedia(page.sourceFile, page.previewUrl, `dropbook-page-${page.id}`);
    if ((page.sourceFile || page.previewUrl) && !media) skippedAssets += 1;
    pages.push({
      id: page.id,
      dropId: page.dropId,
      mode: page.mode,
      label: page.label,
      captureSource: page.captureSource,
      media: media ?? undefined,
    });
  }

  const progress: DropbookProgress = {
    savedAt: Date.now(),
    coverBlankColor: input.coverBlankColor,
    cover: {
      id: input.cover.id,
      bookColor: input.cover.bookColor,
      bookColorSet: input.cover.bookColorSet,
      complete: input.cover.complete,
      coverSource: input.cover.coverSource,
      sourceChipId: input.cover.sourceChipId,
      mode: input.cover.mode,
      media: coverMedia ?? undefined,
    },
    pages,
  };

  writeDropbookProgress(progress);

  void (async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    let skippedCloud = 0;
    const coverCloud = input.cover.complete
      ? await fileOrPreviewToCloudMedia(
          userId,
          input.cover.sourceFile,
          input.cover.previewUrl,
          "dropbook-cover"
        )
      : null;
    if (input.cover.complete && (input.cover.sourceFile || input.cover.previewUrl) && !coverCloud) {
      skippedCloud += 1;
    }

    const cloudPages: StoredDropbookPage[] = [];
    for (const page of input.pages) {
      const cloudMedia = await fileOrPreviewToCloudMedia(
        userId,
        page.sourceFile,
        page.previewUrl,
        `dropbook-page-${page.id}`
      );
      if ((page.sourceFile || page.previewUrl) && !cloudMedia) skippedCloud += 1;
      const localPage = pages.find((p) => p.id === page.id);
      cloudPages.push({
        id: page.id,
        dropId: page.dropId,
        mode: page.mode,
        label: page.label,
        captureSource: page.captureSource,
        media: cloudMedia ?? localPage?.media,
      });
    }

    const cloudProgress: DropbookProgress = {
      savedAt: progress.savedAt,
      coverBlankColor: input.coverBlankColor,
      cover: {
        id: input.cover.id,
        bookColor: input.cover.bookColor,
        bookColorSet: input.cover.bookColorSet,
        complete: input.cover.complete,
        coverSource: input.cover.coverSource,
        sourceChipId: input.cover.sourceChipId,
        mode: input.cover.mode,
        media: coverCloud ?? progress.cover.media,
      },
      pages: cloudPages,
    };

    await syncDropbookProgressToCloud(cloudProgress);
    if (skippedCloud > 0) {
      console.warn(`[Dropbook] ${skippedCloud} asset(s) saved locally but not uploaded to Supabase`);
    }
  })();

  return { ok: true, skippedAssets };
}

export type RestoredDropbookPage = {
  id: string;
  dropId?: string;
  mode?: StoredDropbookCaptureMode;
  label?: string;
  captureSource?: "capture" | "upload";
  previewUrl?: string;
  sourceFile?: File;
};

export type RestoredDropbookProgress = {
  coverBlankColor: string;
  cover: {
    id: string;
    bookColor: string;
    bookColorSet: boolean;
    complete: boolean;
    coverSource?: "blank" | "drop";
    sourceChipId?: string;
    mode?: StoredDropbookCaptureMode;
    previewUrl?: string;
  };
  pages: RestoredDropbookPage[];
};

function mediaToPreview(file: File): string {
  return URL.createObjectURL(file);
}

/** Rehydrate saved Dropbook progress into live shelf state (local + cloud). */
export function restoreDropbookProgress(): RestoredDropbookProgress | null {
  const saved = readDropbookProgress();
  if (!saved) return null;
  return progressToRestored(saved);
}

/** Prefer the newest shelf snapshot from Supabase or localStorage. */
export async function hydrateDropbookProgress(): Promise<RestoredDropbookProgress | null> {
  const local = readDropbookProgress();
  const cloud = await readDropbookProgressFromCloud();

  if (!local && !cloud) return null;
  if (!local) return cloud ? progressToRestored(cloud) : null;
  if (!cloud) return progressToRestored(local);

  const saved = cloud.savedAt > local.savedAt ? cloud : local;
  if (saved === cloud && canUseStorage()) {
    writeDropbookProgress(cloud);
  }
  return progressToRestored(saved);
}
