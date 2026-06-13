"use client";

import {
  getLocalActivity,
  persistActivityEdit,
  setLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";
import {
  BOARD_MEDIA_BUCKET,
  getCurrentUserId,
} from "@/lib/board/boardDropEditStore";
import { supabaseBrowser } from "@/lib/supabase/browser";

import {
  ANNOUNCEMENT_JPEG_OVERRIDES,
  patchBrokenAnnouncementMedia,
} from "@/lib/board/announcementMediaOverrides";

const MIGRATION_FLAG = "jab_board_announcement_heic_repair_v1";

/** Known announcement rows that shipped HEIC media browsers cannot paint. */
const PRIORITY_ACTIVITY_IDS = new Set([
  "af6834ee-2e5f-47c3-b648-e59167f85b81",
]);

function isHeicUrl(url: string) {
  return /\.heic|\.heif(\?|#|$)/i.test(url);
}

function announcementMediaUrl(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  return String(
    meta.announcement_media_url || item.image_url || item.href || ""
  ).trim();
}

export function announcementNeedsHeicRepair(item: BoardActivity) {
  if (item.kind !== "announcement") return false;
  const url = announcementMediaUrl(item);
  if (!url || !isHeicUrl(url)) return false;
  return true;
}

async function convertHeicUrlToJpegFile(url: string): Promise<File | null> {
  try {
    const { default: heic2any } = await import("heic2any");
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const converted = await heic2any({
      blob,
      toType: "image/jpeg",
      quality: 0.92,
    });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!(jpegBlob instanceof Blob)) return null;
    return new File([jpegBlob], "announcement-repair.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

async function uploadAnnouncementJpeg(file: File, userId: string, activityId: string) {
  const sb = supabaseBrowser();
  const storagePath = `uploads/${userId}/${Date.now()}_${activityId.slice(0, 8)}_repair.jpg`;
  const { error } = await sb.storage.from(BOARD_MEDIA_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
  });
  if (error) return null;
  const pub = sb.storage.from(BOARD_MEDIA_BUCKET).getPublicUrl(storagePath);
  return pub.data.publicUrl || null;
}

function patchAnnouncementMedia(item: BoardActivity, jpegUrl: string): BoardActivity {
  const prevMeta = item.meta && typeof item.meta === "object" ? item.meta : {};
  return {
    ...item,
    href: jpegUrl,
    image_url: jpegUrl,
    meta: {
      ...prevMeta,
      announcement_media_url: jpegUrl,
      announcement_media_type: "image",
      mediaKind: "image",
    },
  };
}

async function repairAnnouncementRow(
  item: BoardActivity,
  userId: string
): Promise<BoardActivity | null> {
  const sourceUrl = announcementMediaUrl(item);
  if (!sourceUrl || !isHeicUrl(sourceUrl)) return null;

  const jpegFile = await convertHeicUrlToJpegFile(sourceUrl);
  if (!jpegFile) return null;

  const jpegUrl = await uploadAnnouncementJpeg(jpegFile, userId, item.id);
  if (!jpegUrl) return null;

  const patched = patchAnnouncementMedia(item, jpegUrl);
  await persistActivityEdit(item.id, {
    title: patched.title,
    body: patched.body,
    href: patched.href,
    image_url: patched.image_url,
    meta: patched.meta,
  });
  return patched;
}

/**
 * One-time repair: convert legacy HEIC announcement attachments to JPEG so feed
 * cards render in Chrome/Firefox (and fix mis-typed announcement_media_type).
 */
export async function migrateHeicAnnouncementMedia(force = false): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!force && window.localStorage.getItem(MIGRATION_FLAG) === "done") return 0;

  // Try server-side repair first (works without owner session / heic2any).
  try {
    for (const activityId of PRIORITY_ACTIVITY_IDS) {
      const res = await fetch("/api/board/repair-announcement-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId }),
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const jpegUrl = typeof payload?.jpegUrl === "string" ? payload.jpegUrl : "";
        if (jpegUrl) {
          const prev = getLocalActivity();
          const merged = prev.map((item) =>
            item.id === activityId
              ? patchAnnouncementMedia(item, jpegUrl)
              : item
          );
          setLocalActivity(merged);
          window.dispatchEvent(
            new CustomEvent("board:activity:updated", {
              detail: merged.find((x) => x.id === activityId) ?? null,
            })
          );
          window.localStorage.setItem(MIGRATION_FLAG, "done");
          return 1;
        }
      }
    }
  } catch {
    // Fall through to client repair.
  }

  // Bundled JPEG fallback when server upload is unavailable.
  for (const activityId of PRIORITY_ACTIVITY_IDS) {
    const override = ANNOUNCEMENT_JPEG_OVERRIDES[activityId];
    if (!override) continue;
    const prev = getLocalActivity();
    const target = prev.find((item) => item.id === activityId);
    if (!target) continue;
    const patched = patchBrokenAnnouncementMedia(target);
    setLocalActivity([patched, ...prev.filter((item) => item.id !== activityId)]);
    window.dispatchEvent(
      new CustomEvent("board:activity:updated", { detail: patched })
    );
    window.localStorage.setItem(MIGRATION_FLAG, "done");
    return 1;
  }

  const userId = await getCurrentUserId();
  if (!userId) return 0;

  let repaired = 0;
  const seen = new Set<string>();
  const candidates: BoardActivity[] = [];

  for (const item of getLocalActivity()) {
    if (item.kind !== "announcement") continue;
    if (PRIORITY_ACTIVITY_IDS.has(item.id) || announcementNeedsHeicRepair(item)) {
      candidates.push(item);
      seen.add(item.id);
    }
  }

  try {
    const sb = supabaseBrowser();
    const { data: rows } = await sb
      .from("board_activity")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", "announcement")
      .order("created_at", { ascending: false })
      .limit(80);

    for (const row of rows ?? []) {
      const item = row as BoardActivity;
      if (seen.has(item.id)) continue;
      if (PRIORITY_ACTIVITY_IDS.has(item.id) || announcementNeedsHeicRepair(item)) {
        candidates.push(item);
        seen.add(item.id);
      }
    }
  } catch {
    // Local repair still runs.
  }

  for (const item of candidates) {
    try {
      const patched = await repairAnnouncementRow(item, userId);
      if (!patched) continue;
      repaired += 1;
      const prev = getLocalActivity();
      const merged = [patched, ...prev.filter((x) => x.id !== patched.id)].slice(0, 120);
      setLocalActivity(merged);
    } catch {
      // Try the next row.
    }
  }

  if (repaired === candidates.length) {
    window.localStorage.setItem(MIGRATION_FLAG, "done");
  } else if (candidates.length === 0) {
    window.localStorage.setItem(MIGRATION_FLAG, "done");
  }

  return repaired;
}
