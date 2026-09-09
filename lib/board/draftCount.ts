// Draft Count — how many times a Drop has been substantially redesigned and
// successfully republished. Board and Bucket Brain read this as a creative
// signal, so it must never be inflated by opening the editor, by a failed save,
// or by a cancelled session: it is only ever stamped onto a payload that is
// about to be written.

import type { DropItem } from "@/lib/board/dropItem";
import { compactDropCustomizations } from "@/lib/board/dropCustomizations";

function customizationFingerprint(drop: DropItem) {
  const compact = compactDropCustomizations(drop.customizations);
  return compact ? JSON.stringify(compact) : "";
}

function mediaFingerprint(drop: DropItem) {
  return [drop.bucket, drop.storagePath, drop.fileName, drop.mime, drop.fileSize].join("|");
}

function textFingerprint(drop: DropItem) {
  return [
    drop.title,
    drop.description,
    drop.thoughtText,
    drop.titleRich?.html,
    drop.descriptionRich?.html,
  ]
    .map((value) => (value ?? "").trim())
    .join("|");
}

/**
 * A redesign — new media, rewritten copy, changed customizations, or a changed
 * offer/link/visibility. Re-saving an untouched drop is not a new draft.
 */
export function isSubstantialDropEdit(before: DropItem, after: DropItem) {
  if (mediaFingerprint(before) !== mediaFingerprint(after)) return true;
  if (textFingerprint(before) !== textFingerprint(after)) return true;
  if (customizationFingerprint(before) !== customizationFingerprint(after)) return true;
  if (before.visibility !== after.visibility) return true;
  if (before.priceCents !== after.priceCents) return true;
  if ((before.url ?? "") !== (after.url ?? "")) return true;
  if ((before.linkUrl ?? "") !== (after.linkUrl ?? "")) return true;
  if ((before.paymentLink ?? "") !== (after.paymentLink ?? "")) return true;
  return false;
}

/**
 * Stamp the next Draft Count onto an edit that is about to be persisted. The
 * count is left untouched when nothing substantial changed.
 */
export function withDraftCount(before: DropItem, after: DropItem): DropItem {
  if (!isSubstantialDropEdit(before, after)) return after;
  return { ...after, draftCount: (before.draftCount ?? 0) + 1 };
}
