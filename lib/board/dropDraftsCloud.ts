"use client";

// Drafts Deck — cross-device sync layer. Local drafts (lib/board/dropDrafts.ts)
// stay the fast, offline-first source of truth for the device that's actively
// editing; this module mirrors them to Supabase (board_drop_drafts) in the
// background so the same Draft Card can be reopened from another device.

import { BUCKET_MEDIA } from "@/lib/board/dropItem";
import { ownerScopedUploadFolder } from "@/lib/board/uploadLimits";
import { uploadBoardMediaFile } from "@/lib/board/boardMediaUpload";
import { getCurrentUserId } from "@/lib/board/boardDropEditStore";
import { getCachedSignedMediaUrl } from "@/lib/board/signedMediaUrl";
import {
  draftCustomizations,
  draftToFile,
  upsertDropDraft,
  type DropDraft,
  type DropDraftStatus,
  type DropDraftType,
} from "@/lib/board/dropDrafts";

export type CloudDropDraft = {
  id: string;
  title: string;
  dropType: DropDraftType;
  status: DropDraftStatus | "converted" | "archived";
  previewDataUrl?: string;
  mediaBucket?: string;
  mediaPath?: string;
  mediaMime?: string;
  editorState: unknown;
  meta: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const DRAFTS_ENDPOINT = "/api/board/drop-drafts";
// Throttle how often any single draft re-uploads its media/state to Supabase —
// autosave can fire often while actively editing, but the cloud copy only
// needs to catch up every few seconds.
const MIN_SYNC_INTERVAL_MS = 8_000;

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; lastRun: number }>();

async function postDraft(draft: DropDraft, dropType: DropDraftType) {
  const userId = await getCurrentUserId();
  if (!userId) return; // Drafts Deck only syncs for signed-in users.

  let mediaBucket: string | undefined;
  let mediaPath: string | undefined;
  let mediaMime: string | undefined;
  const file = draftToFile(draft);
  if (file) {
    try {
      const result = await uploadBoardMediaFile(file, {
        bucket: BUCKET_MEDIA,
        folder: ownerScopedUploadFolder("drop-drafts", userId),
      });
      mediaBucket = result.bucket;
      mediaPath = result.storagePath;
      mediaMime = file.type;
    } catch {
      // Best effort — keep the local draft either way, skip the media pointer.
    }
  }

  const previewDataUrl =
    draft.kind === "image" && draft.dataUrl.length <= 380_000 ? draft.dataUrl : undefined;

  try {
    await fetch(DRAFTS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        title: draft.title || "",
        dropType,
        status: draft.status || "editing",
        previewDataUrl,
        mediaBucket,
        mediaPath,
        mediaMime,
        editorState: draftCustomizations(draft) || {},
        meta: { revisions: draft.count || 1 },
      }),
    });
  } catch {
    // Offline or request failed — the local draft remains authoritative.
  }
}

/**
 * Schedule a background sync of a local draft to Drafts Deck's cloud copy.
 * Throttled per-draft so active editing doesn't hammer Storage/Postgres;
 * pass `immediate: true` on close/hide so the final state isn't dropped.
 */
export function queueDraftCloudSync(
  draft: DropDraft,
  dropType: DropDraftType,
  opts?: { immediate?: boolean }
) {
  if (typeof window === "undefined") return;
  const existing = pending.get(draft.id);
  if (existing) clearTimeout(existing.timer);

  const run = () => {
    pending.delete(draft.id);
    void postDraft(draft, dropType);
  };

  if (opts?.immediate) {
    run();
    return;
  }

  const sinceLast = existing ? Date.now() - existing.lastRun : Infinity;
  const delay = sinceLast >= MIN_SYNC_INTERVAL_MS ? 0 : MIN_SYNC_INTERVAL_MS - sinceLast;
  const timer = setTimeout(run, delay);
  pending.set(draft.id, { timer, lastRun: existing?.lastRun ?? 0 });
}

export async function listCloudDropDrafts(): Promise<CloudDropDraft[]> {
  try {
    const res = await fetch(DRAFTS_ENDPOINT, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!json?.ok || !Array.isArray(json.drafts)) return [];
    return json.drafts as CloudDropDraft[];
  } catch {
    return [];
  }
}

export async function renameCloudDropDraft(id: string, title: string) {
  try {
    await fetch(`${DRAFTS_ENDPOINT}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch {
    // Best effort.
  }
}

export async function setCloudDropDraftStatus(
  id: string,
  status: DropDraftStatus | "converted" | "archived"
) {
  try {
    await fetch(`${DRAFTS_ENDPOINT}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch {
    // Best effort.
  }
}

export async function deleteCloudDropDraft(id: string) {
  try {
    await fetch(`${DRAFTS_ENDPOINT}/${id}`, { method: "DELETE" });
  } catch {
    // Best effort — local delete still applies.
  }
}

export async function duplicateCloudDropDraft(id: string): Promise<CloudDropDraft | null> {
  try {
    const res = await fetch(`${DRAFTS_ENDPOINT}/${id}/duplicate`, { method: "POST" });
    const json = await res.json().catch(() => null);
    return json?.ok ? (json.draft as CloudDropDraft) : null;
  } catch {
    return null;
  }
}

function kindForDropType(type: DropDraftType): DropDraft["kind"] {
  if (type === "voice") return "audio";
  if (type === "video") return "video";
  return "image";
}

/**
 * Pull a cloud-only draft (created/edited on another device) down into this
 * device's local cache so it can be opened in Drop Studio like any other
 * draft. Downloads the media file from Supabase Storage when present.
 */
export async function hydrateCloudDropDraft(cloud: CloudDropDraft): Promise<DropDraft | null> {
  let dataUrl = "";
  const fileName = `${cloud.title || cloud.dropType || "draft"}`;
  let mimeType = cloud.mediaMime || "application/octet-stream";

  if (cloud.mediaBucket && cloud.mediaPath) {
    try {
      const signedUrl = await getCachedSignedMediaUrl(cloud.mediaBucket, cloud.mediaPath);
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      mimeType = blob.type || mimeType;
    } catch {
      return null;
    }
  } else if (cloud.previewDataUrl) {
    dataUrl = cloud.previewDataUrl;
  }

  if (!dataUrl) return null;

  const draft: DropDraft = {
    id: cloud.id,
    kind: kindForDropType(cloud.dropType),
    dataUrl,
    fileName,
    mimeType,
    createdAt: Date.parse(cloud.createdAt) || Date.now(),
    count: 1,
    customizationsJson: cloud.editorState ? JSON.stringify(cloud.editorState) : undefined,
    title: cloud.title || undefined,
    dropType: cloud.dropType,
    status: cloud.status === "converted" || cloud.status === "archived" ? "ready" : cloud.status,
    syncedAt: Date.now(),
  };
  upsertDropDraft(draft);
  return draft;
}
