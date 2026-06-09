"use client";

// Shared Drop Pad Assets store. The Assets bin in DropPadOS reads this same
// localStorage key, so writing here (and dispatching the update event) makes a
// Work Drop appear in the bin no matter which surface created it.

export const DROP_PAD_ASSETS_STORAGE_KEY = "jab_drop_pad_assets_v4";
export const DROP_PAD_ASSETS_UPDATED_EVENT = "board:droppad:assets:updated";

export type DropPadAssetKind = "media" | "music" | "youtube" | "link" | "doc" | "note";

export type DropPadAsset = {
  id: string;
  kind: DropPadAssetKind;
  title: string;
  description?: string;
  createdAt: number;
  payload?: {
    mediaUrl?: string;
    mediaType?: "image";
    embedUrl?: string;
    url?: string;
    text?: string;
  };
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readDropPadAssets(): DropPadAsset[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DROP_PAD_ASSETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.id === "string" && typeof item.title === "string"
    ) as DropPadAsset[];
  } catch {
    return [];
  }
}

export function writeDropPadAssets(items: DropPadAsset[]) {
  if (!canUseStorage()) return;
  const trimmed = items.slice(0, 600);
  try {
    window.localStorage.setItem(DROP_PAD_ASSETS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota guard — keep the most recent entries and never throw to the caller.
    try {
      window.localStorage.setItem(
        DROP_PAD_ASSETS_STORAGE_KEY,
        JSON.stringify(trimmed.slice(0, 120))
      );
    } catch {
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(DROP_PAD_ASSETS_UPDATED_EVENT));
  window.dispatchEvent(new StorageEvent("storage", { key: DROP_PAD_ASSETS_STORAGE_KEY }));
}

export function addDropPadAsset(asset: DropPadAsset): DropPadAsset[] {
  const next = [asset, ...readDropPadAssets().filter((item) => item.id !== asset.id)];
  writeDropPadAssets(next);
  return next;
}

export async function upsertDropPadAssetRemote(sb: any, userId: string, asset: DropPadAsset) {
  try {
    const row = {
      id: asset.id,
      user_id: userId,
      kind: asset.kind,
      title: asset.title,
      description: asset.description ?? null,
      payload: asset.payload ?? null,
      created_at: new Date(asset.createdAt).toISOString(),
    };
    const { error } = await sb.from("board_assets").upsert(row, { onConflict: "id" });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
