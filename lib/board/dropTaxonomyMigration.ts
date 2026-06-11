import type { BoardActivity } from "@/lib/board/activity";
import { getLocalActivity, setLocalActivity } from "@/lib/board/activity";
import type { DropItem } from "@/lib/board/dropItem";
import {
  loadAllLocalDrops,
  getCurrentUserId,
  persistDropEdit,
} from "@/lib/board/boardDropEditStore";
import {
  canonicalDropType,
  normalizeBoardDropType,
  resolveDropMediaKind,
  resolveDropMediaKindFromMeta,
} from "@/lib/board/dropDisplay";
import { supabaseBrowser } from "@/lib/supabase/browser";

const MIGRATION_FLAG = "jab_board_drop_taxonomy_v1";

function syncThoughtFormat(
  drop: DropItem,
  mediaKind: ReturnType<typeof resolveDropMediaKind>
): DropItem {
  if (drop.type !== "Thought") return drop;
  if (mediaKind === "audio" && drop.thoughtFormat !== "voice") {
    return { ...drop, thoughtFormat: "voice" };
  }
  if (mediaKind === "image" && drop.thoughtFormat !== "doodle") {
    return { ...drop, thoughtFormat: "doodle" };
  }
  return drop;
}

/** Reconcile a stored drop's type + mediaKind with file/mime ground truth. */
export function patchDropTaxonomy(drop: DropItem): { drop: DropItem; changed: boolean } {
  let changed = false;
  let next: DropItem = { ...drop };

  const canonical = canonicalDropType(drop.type, {
    priceCents: drop.priceCents,
    embedUrl: drop.embedUrl,
    thoughtText: drop.thoughtText,
    bucket: drop.bucket,
    storagePath: drop.storagePath,
    url: drop.url ?? drop.linkUrl,
  });
  if (canonical !== drop.type) {
    next.type = canonical;
    changed = true;
  }

  const resolved = resolveDropMediaKind(next);
  if (resolved && next.mediaKind !== resolved) {
    next.mediaKind = resolved;
    changed = true;
  } else if (!resolved && next.mediaKind) {
    next = { ...next, mediaKind: undefined };
    changed = true;
  }

  const withFormat = syncThoughtFormat(next, resolved);
  if (withFormat !== next) {
    next = withFormat;
    changed = true;
  }

  return { drop: next, changed };
}

function previewFromMeta(meta: Record<string, unknown>) {
  return meta.preview && typeof meta.preview === "object"
    ? ({ ...(meta.preview as Record<string, unknown>) } as Record<string, unknown>)
    : ({} as Record<string, unknown>);
}

/** Reconcile feed / Activity Channel meta with canonical drop records. */
export function patchActivityTaxonomy(
  item: BoardActivity,
  localDrop?: DropItem | null
): { item: BoardActivity; changed: boolean } {
  if (item.kind !== "board_drop") return { item, changed: false };

  const meta =
    item.meta && typeof item.meta === "object"
      ? ({ ...(item.meta as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  let changed = false;

  const sourceDrop =
    localDrop ||
    (typeof meta.dropId === "string"
      ? loadAllLocalDrops().items.find((d) => d.id === meta.dropId)
      : undefined);

  const typeRaw = String(
    sourceDrop?.type ??
      meta.dropType ??
      meta.drop_flavor ??
      meta.dropFlavor ??
      ""
  );
  const canonical = canonicalDropType(typeRaw, {
    priceCents:
      typeof meta.priceCents === "number"
        ? meta.priceCents
        : sourceDrop?.priceCents,
    embedUrl:
      (typeof meta.embedUrl === "string" ? meta.embedUrl : null) ??
      sourceDrop?.embedUrl,
    thoughtText: sourceDrop?.thoughtText ?? (typeof meta.thoughtText === "string" ? meta.thoughtText : undefined),
    bucket:
      (typeof meta.bucket === "string" ? meta.bucket : undefined) ??
      sourceDrop?.bucket,
    storagePath:
      (typeof meta.storagePath === "string" ? meta.storagePath : undefined) ??
      sourceDrop?.storagePath,
    url:
      (typeof item.href === "string" ? item.href : undefined) ??
      sourceDrop?.url,
  });

  if (String(meta.dropType ?? "") !== canonical) {
    meta.dropType = canonical;
    changed = true;
  }

  if (sourceDrop) {
    for (const [key, value] of Object.entries({
      bucket: sourceDrop.bucket,
      storagePath: sourceDrop.storagePath,
      fileName: sourceDrop.fileName,
      mime: sourceDrop.mime,
      mediaUrl: sourceDrop.mediaUrl,
      thoughtFormat: sourceDrop.thoughtFormat,
      hostLabel: sourceDrop.hostLabel,
    })) {
      if (value != null && value !== "" && meta[key] !== value) {
        meta[key] = value;
        changed = true;
      }
    }
  }

  const resolved = resolveDropMediaKindFromMeta(meta);
  if (resolved && meta.mediaKind !== resolved) {
    meta.mediaKind = resolved;
    changed = true;
  } else if (!resolved && meta.mediaKind) {
    delete meta.mediaKind;
    changed = true;
  }

  const preview = previewFromMeta(meta);
  let previewChanged = false;
  if (resolved && preview.mediaKind !== resolved) {
    preview.mediaKind = resolved;
    previewChanged = true;
  }
  if (canonical && preview.dropType !== canonical) {
    preview.dropType = canonical;
    previewChanged = true;
  }
  if (previewChanged) {
    meta.preview = preview;
    changed = true;
  }

  const normalized = normalizeBoardDropType(String(meta.dropType ?? ""));
  if (normalized && normalized !== meta.dropType) {
    meta.dropType = normalized;
    changed = true;
  }

  if (!changed) return { item, changed: false };
  return { item: { ...item, meta }, changed: true };
}

/**
 * One-time client migration: repair miscategorized drop types and stale mediaKind
 * values in local boardDrops + activity rows, then sync owned Supabase rows.
 */
export async function migrateLegacyDropTaxonomy(force = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!force && window.localStorage.getItem(MIGRATION_FLAG) === "done") return 0;

  const { items: localDrops } = loadAllLocalDrops();
  const dropById = new Map(localDrops.map((d) => [d.id, d]));
  let patchCount = 0;

  for (const drop of localDrops) {
    const { drop: patched, changed } = patchDropTaxonomy(drop);
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
    const { item: patched, changed } = patchActivityTaxonomy(item, localDrop ?? null);
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
        .limit(160);

      for (const row of rows ?? []) {
        const item = row as BoardActivity;
        const dropId =
          item.meta && typeof item.meta === "object" && typeof (item.meta as any).dropId === "string"
            ? (item.meta as any).dropId
            : "";
        const localDrop = dropId ? dropById.get(dropId) : undefined;
        const { item: patched, changed } = patchActivityTaxonomy(item, localDrop ?? null);
        if (!changed) continue;
        patchCount += 1;

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
        const { drop: patched, changed } = patchDropTaxonomy(drop);
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
