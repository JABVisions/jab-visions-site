import type { BoardActivity } from "@/lib/board/activity";
import { getLocalActivity, setLocalActivity } from "@/lib/board/activity";
import type { DropItem } from "@/lib/board/dropItem";
import {
  loadAllLocalDrops,
  getCurrentUserId,
  persistDropEdit,
} from "@/lib/board/boardDropEditStore";
import {
  isAudioFileUrl,
  isMusicDropType,
  isStreamingMusicUrl,
} from "@/lib/board/musicPlayback";
import { supabaseBrowser } from "@/lib/supabase/browser";

const MIGRATION_FLAG = "jab_board_music_migrated_v2";

function metaDropType(meta: Record<string, unknown> | null | undefined) {
  return String(meta?.dropType ?? meta?.drop_flavor ?? meta?.dropFlavor ?? "");
}

function isMusicActivity(item: BoardActivity) {
  if (item.kind !== "board_drop") return false;
  const meta = item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : null;
  return isMusicDropType(metaDropType(meta));
}

function hasStoredAudio(meta: Record<string, unknown> | null | undefined) {
  return !!(meta?.bucket && meta?.storagePath);
}

/** Normalize one activity row so uploaded music plays in full on-platform. */
export function patchMusicActivity(
  item: BoardActivity,
  localDrop?: DropItem | null
): { item: BoardActivity; changed: boolean } {
  if (!isMusicActivity(item)) return { item, changed: false };

  const meta =
    item.meta && typeof item.meta === "object"
      ? ({ ...(item.meta as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const preview =
    meta.preview && typeof meta.preview === "object"
      ? (meta.preview as Record<string, unknown>)
      : null;
  const href = typeof item.href === "string" ? item.href : "";
  let changed = false;

  if (!meta.bucket && typeof preview?.bucket === "string") {
    meta.bucket = preview.bucket;
    changed = true;
  }
  if (!meta.storagePath && typeof preview?.storagePath === "string") {
    meta.storagePath = preview.storagePath;
    changed = true;
  }

  const sourceDrop =
    localDrop ||
    (typeof meta.dropId === "string"
      ? loadAllLocalDrops().items.find((d) => d.id === meta.dropId)
      : undefined);

  if (sourceDrop?.bucket && sourceDrop?.storagePath) {
    if (meta.bucket !== sourceDrop.bucket) {
      meta.bucket = sourceDrop.bucket;
      changed = true;
    }
    if (meta.storagePath !== sourceDrop.storagePath) {
      meta.storagePath = sourceDrop.storagePath;
      changed = true;
    }
    if (meta.fileName !== sourceDrop.fileName && sourceDrop.fileName) {
      meta.fileName = sourceDrop.fileName;
      changed = true;
    }
    if (meta.mediaKind !== "audio") {
      meta.mediaKind = "audio";
      changed = true;
    }
    const audioUrl = sourceDrop.mediaUrl || sourceDrop.url;
    if (audioUrl && isAudioFileUrl(audioUrl) && meta.mediaUrl !== audioUrl) {
      meta.mediaUrl = audioUrl;
      changed = true;
    }
  }

  if (hasStoredAudio(meta)) {
    if (meta.mediaKind !== "audio") {
      meta.mediaKind = "audio";
      changed = true;
    }
    if (href && isAudioFileUrl(href) && meta.mediaUrl !== href) {
      meta.mediaUrl = href;
      changed = true;
    }
    if (
      typeof meta.mediaUrl === "string" &&
      meta.mediaUrl &&
      !isAudioFileUrl(meta.mediaUrl)
    ) {
      delete meta.mediaUrl;
      changed = true;
    }
  } else if (href && isAudioFileUrl(href)) {
    if (meta.mediaKind !== "audio") {
      meta.mediaKind = "audio";
      changed = true;
    }
    if (meta.mediaUrl !== href) {
      meta.mediaUrl = href;
      changed = true;
    }
  } else if (meta.mediaKind === "audio" && href && isStreamingMusicUrl(href)) {
    // Link-only streaming drops should not masquerade as uploaded audio.
    meta.mediaKind = null;
    if (typeof meta.mediaUrl === "string" && !isAudioFileUrl(meta.mediaUrl)) {
      delete meta.mediaUrl;
    }
    changed = true;
  }

  if (!changed) return { item, changed: false };

  return {
    item: { ...item, meta },
    changed: true,
  };
}

export function patchMusicDropItem(drop: DropItem): { drop: DropItem; changed: boolean } {
  const type = String(drop.type || "");
  if (type !== "Music") return { drop, changed: false };

  let changed = false;
  const next: DropItem = { ...drop };

  if (next.bucket && next.storagePath && next.mediaKind !== "audio") {
    next.mediaKind = "audio";
    changed = true;
  }

  const audioUrl = next.url || next.mediaUrl;
  if (audioUrl && isAudioFileUrl(audioUrl)) {
    if (next.mediaKind !== "audio") {
      next.mediaKind = "audio";
      changed = true;
    }
    if (!next.mediaUrl) {
      next.mediaUrl = audioUrl;
      changed = true;
    }
  }

  if (
    next.mediaKind === "audio" &&
    next.url &&
    isStreamingMusicUrl(next.url) &&
    !next.bucket
  ) {
    next.mediaKind = undefined;
    changed = true;
  }

  return { drop: next, changed };
}

/**
 * One-time client migration: patch local drops + activity, then sync owned
 * Supabase rows so existing Music Drops use full in-Board playback.
 */
export async function migrateLegacyMusicDrops(force = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!force && window.localStorage.getItem(MIGRATION_FLAG) === "done") return 0;

  const { items: localDrops, keyById } = loadAllLocalDrops();
  const dropById = new Map(localDrops.map((d) => [d.id, d]));
  let patchCount = 0;

  for (const drop of localDrops) {
    const { drop: patched, changed } = patchMusicDropItem(drop);
    if (!changed) continue;
    patchCount += 1;
    dropById.set(patched.id, patched);
    await persistDropEdit(patched);
  }

  const localActivity = getLocalActivity();
  const nextLocalActivity = localActivity.map((item) => {
    const dropId =
      item.meta && typeof item.meta === "object" && typeof (item.meta as any).dropId === "string"
        ? (item.meta as any).dropId
        : "";
    const localDrop = dropId ? dropById.get(dropId) : undefined;
    const { item: patched, changed } = patchMusicActivity(item, localDrop ?? null);
    if (changed) patchCount += 1;
    return patched;
  });
  if (nextLocalActivity.some((item, i) => item !== localActivity[i])) {
    setLocalActivity(nextLocalActivity);
  }

  try {
    const userId = await getCurrentUserId();
    if (userId) {
      const sb = supabaseBrowser();
      const { data: rows } = await sb
        .from("board_activity")
        .select("*")
        .eq("user_id", userId)
        .eq("kind", "board_drop")
        .order("created_at", { ascending: false })
        .limit(120);

      for (const row of rows ?? []) {
        const item = row as BoardActivity;
        if (!isMusicActivity(item)) continue;
        const dropId =
          item.meta && typeof item.meta === "object" && typeof (item.meta as any).dropId === "string"
            ? (item.meta as any).dropId
            : "";
        const localDrop = dropId ? dropById.get(dropId) : undefined;
        const { item: patched, changed } = patchMusicActivity(item, localDrop ?? null);
        if (!changed) continue;
        patchCount += 1;

        const prev = getLocalActivity();
        const merged = [patched, ...prev.filter((x) => x.id !== patched.id)].slice(0, 200);
        setLocalActivity(merged);

        await sb
          .from("board_activity")
          .update({ meta: patched.meta })
          .eq("id", patched.id)
          .eq("user_id", userId);
      }

      const { data: profile } = await sb
        .from("profiles")
        .select("board_style")
        .eq("id", userId)
        .maybeSingle();
      const boardStyle =
        profile?.board_style && typeof profile.board_style === "object"
          ? (profile.board_style as Record<string, unknown>)
          : {};
      const remoteDrops = Array.isArray(boardStyle.boardDrops)
        ? (boardStyle.boardDrops as DropItem[])
        : [];
      let remoteChanged = false;
      const mergedRemote = remoteDrops.map((drop) => {
        const { drop: patched, changed } = patchMusicDropItem(drop);
        if (changed) {
          remoteChanged = true;
          patchCount += 1;
          dropById.set(patched.id, patched);
        }
        return patched;
      });
      if (remoteChanged) {
        await sb
          .from("profiles")
          .upsert(
            { id: userId, board_style: { ...boardStyle, boardDrops: mergedRemote } },
            { onConflict: "id" }
          );
        try {
          window.localStorage.setItem(`jab_board_drops_v2:${userId}`, JSON.stringify(mergedRemote));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // Local patches still help.
  }

  if (patchCount > 0) {
    window.dispatchEvent(new CustomEvent("board:activity:updated"));
    window.dispatchEvent(new StorageEvent("storage", { key: "jab_board_activity_v1" }));
    window.dispatchEvent(new CustomEvent("board:drop:updated"));
  }

  window.localStorage.setItem(MIGRATION_FLAG, "done");
  return patchCount;
}
