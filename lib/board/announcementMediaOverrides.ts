import type { BoardActivity } from "@/lib/board/activity";

/** Feed-safe JPEG replacements for legacy HEIC announcement attachments. */
export const ANNOUNCEMENT_JPEG_OVERRIDES: Record<string, string> = {
  "af6834ee-2e5f-47c3-b648-e59167f85b81":
    "/assets/board-feed/those-ryderz-clapper-2025.jpg",
};

function isHeicUrl(url: string) {
  return /\.heic|\.heif(\?|#|$)/i.test(url);
}

export function patchBrokenAnnouncementMedia(item: BoardActivity): BoardActivity {
  if (item.kind !== "announcement") return item;

  const override = ANNOUNCEMENT_JPEG_OVERRIDES[item.id];
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const currentUrl = String(
    meta.announcement_media_url || item.image_url || item.href || ""
  ).trim();

  const nextUrl = override || (isHeicUrl(currentUrl) ? null : null);
  if (!nextUrl) return item;

  return {
    ...item,
    href: nextUrl,
    image_url: nextUrl,
    meta: {
      ...meta,
      announcement_media_url: nextUrl,
      announcement_media_type: "image",
      mediaKind: "image",
      repairedFromHeic: true,
    },
  };
}

export function patchBrokenAnnouncementFeed(items: BoardActivity[]): BoardActivity[] {
  return items.map(patchBrokenAnnouncementMedia);
}
