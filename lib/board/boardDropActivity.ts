import type { BoardActivity } from "@/lib/board/activity";
import { storageCoordsFromDrop } from "@/lib/board/dropDisplay";
import { isDropbookSlideFile } from "@/lib/board/dropbookSlides";

export type BoardDropActivitySource = {
  id: string;
  title?: string;
  type?: string;
  createdAt?: number | string;
  url?: string;
  embedUrl?: string | null;
  hostLabel?: string;
  headline?: string;
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;
  previewImages?: string[];
  mediaUrl?: string;
  bucket?: string;
  storagePath?: string;
  fileName?: string;
  mime?: string;
  mediaKind?: string | null;
  priceCents?: number;
  description?: string;
  thoughtText?: string;
  thoughtFormat?: string;
  linkUrl?: string;
  payProvider?: string;
  paymentRequestType?: string;
  paymentLink?: string;
  badgeLabel?: string;
  customizations?: unknown;
  visibility?: "public" | "private";
  fromDescript?: boolean;
  fromDropbook?: boolean;
};

export function boardDropToActivity(
  drop: BoardDropActivitySource,
  opts?: {
    userId?: string | null;
    activityId?: string;
    mediaUrl?: string | null;
    author?: {
      username?: string | null;
      displayName?: string | null;
      avatarSrc?: string | null;
      glowColor?: string | null;
      auraIntensity?: number | null;
    };
  }
): BoardActivity {
  const coords = storageCoordsFromDrop(drop);
  const mediaUrl =
    opts?.mediaUrl ||
    drop.mediaUrl ||
    (drop.mediaKind === "image" || drop.mediaKind === "video" || drop.mediaKind === "audio"
      ? drop.url
      : null) ||
    null;
  const href =
    drop.linkUrl || drop.url || drop.embedUrl || mediaUrl || null;
  const dropType = drop.type || "Media";
  const typeLabel = dropType === "Media" ? "Vision" : dropType;
  const fromDropbook =
    drop.fromDropbook === true ||
    isDropbookSlideFile({
      name: drop.fileName,
      type: drop.mime,
      url: drop.url,
    });
  const body =
    dropType === "Thought"
      ? String(drop.thoughtText || drop.description || "").trim() ||
        "A thought landed on Board."
      : String(drop.description || "").trim() ||
        `New ${typeLabel} Drop added to Board.`;
  const createdAt =
    typeof drop.createdAt === "number"
      ? new Date(drop.createdAt || Date.now()).toISOString()
      : drop.createdAt
        ? new Date(drop.createdAt).toISOString()
        : new Date().toISOString();

  return {
    id: opts?.activityId || `collection_${drop.id}`,
    created_at: createdAt,
    user_id: opts?.userId ?? null,
    kind: "board_drop",
    title: drop.title || `${typeLabel} Drop`,
    body,
    href,
    image_url:
      drop.mediaKind === "image"
        ? mediaUrl || drop.previewImage || null
        : drop.previewImage || null,
    meta: {
      source: "profiles.board_style.boardDrops",
      dropId: drop.id,
      dropType: fromDropbook ? "dropbook" : dropType,
      drop_flavor: fromDropbook ? "dropbook" : String(dropType).toLowerCase(),
      mediaKind: drop.mediaKind ?? null,
      mediaUrl: mediaUrl ?? null,
      bucket: coords?.bucket ?? drop.bucket ?? null,
      storagePath: coords?.storagePath ?? drop.storagePath ?? null,
      fileName: drop.fileName ?? null,
      mime: drop.mime ?? null,
      previewImage: drop.previewImage ?? null,
      previewImages: drop.previewImages ?? null,
      previewTitle: drop.previewTitle ?? drop.headline ?? null,
      previewDescription: drop.previewDescription ?? null,
      embedUrl: drop.embedUrl ?? null,
      hostLabel: drop.hostLabel ?? null,
      priceCents: drop.priceCents ?? null,
      payProvider: drop.payProvider ?? null,
      paymentRequestType: drop.paymentRequestType ?? null,
      paymentLink: drop.paymentLink ?? drop.linkUrl ?? null,
      badgeLabel: drop.badgeLabel ?? null,
      fromDescript: drop.fromDescript ?? null,
      fromDropbook,
      customizations: drop.customizations ?? null,
      visibility: drop.visibility === "private" ? "private" : "public",
      thoughtText: drop.thoughtText ?? null,
      thoughtFormat: drop.thoughtFormat ?? null,
      description: drop.description ?? null,
      authorUsername: opts?.author?.username ?? null,
      authorName: opts?.author?.displayName ?? opts?.author?.username ?? null,
      authorAvatar: opts?.author?.avatarSrc ?? null,
      authorGlow: opts?.author?.glowColor ?? null,
      authorAuraIntensity: opts?.author?.auraIntensity ?? null,
    },
  };
}
