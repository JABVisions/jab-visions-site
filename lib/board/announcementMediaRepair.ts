"use client";

import {
  getLocalActivity,
  setLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";

import {
  ANNOUNCEMENT_JPEG_OVERRIDES,
  patchBrokenAnnouncementMedia,
} from "@/lib/board/announcementMediaOverrides";

const MIGRATION_FLAG = "jab_board_announcement_heic_repair_v1";

/** Known announcement rows that shipped HEIC media browsers cannot paint. */
const PRIORITY_ACTIVITY_IDS = new Set([
  "af6834ee-2e5f-47c3-b648-e59167f85b81",
]);

function announcementMediaUrl(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  return String(
    meta.announcement_media_url || item.image_url || item.href || ""
  ).trim();
}

function isHeicUrl(url: string) {
  return /\.heic|\.heif(\?|#|$)/i.test(url);
}

export function announcementNeedsHeicRepair(item: BoardActivity) {
  if (item.kind !== "announcement") return false;
  const url = announcementMediaUrl(item);
  if (!url || !isHeicUrl(url)) return false;
  return true;
}

/**
 * One-time repair: apply bundled JPEG overrides for legacy HEIC announcements.
 * Avoids heic2any / large uploads on page load (mobile crash risk).
 */
export async function migrateHeicAnnouncementMedia(force = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!force && window.localStorage.getItem(MIGRATION_FLAG) === "done") return 0;

  let repaired = 0;
  const prev = getLocalActivity();
  let merged = prev;

  for (const activityId of PRIORITY_ACTIVITY_IDS) {
    if (!ANNOUNCEMENT_JPEG_OVERRIDES[activityId]) continue;
    const target = merged.find((item) => item.id === activityId);
    if (!target || !announcementNeedsHeicRepair(target)) continue;
    const patched = patchBrokenAnnouncementMedia(target);
    merged = [patched, ...merged.filter((item) => item.id !== activityId)];
    repaired += 1;
  }

  if (repaired) {
    setLocalActivity(merged);
    const first = PRIORITY_ACTIVITY_IDS.values().next().value;
    const patched = merged.find((item) => item.id === first);
    if (patched) {
      window.dispatchEvent(
        new CustomEvent("board:activity:updated", { detail: patched })
      );
    }
  }

  window.localStorage.setItem(MIGRATION_FLAG, "done");
  return repaired;
}
