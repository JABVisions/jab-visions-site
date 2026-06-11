"use client";

import type { BoardActivity } from "@/lib/board/activity";
import { dedupeActivity } from "@/lib/board/feedActivity";

/** Max drop cards shown in a profile Activity Channel. Whispers/signals render alongside. */
export const PROFILE_ACTIVITY_CHANNEL_LIMIT = 12;

/** Fetch buffer — global activity is filtered per profile before slicing. */
export const PROFILE_ACTIVITY_CHANNEL_FETCH_LIMIT = 48;

type ProfileActivityOwner = {
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
};

type ProfileBoardDrop = {
  id: string;
  title?: string;
  type?: string;
  createdAt?: number;
  description?: string;
  url?: string;
  linkUrl?: string;
  previewImage?: string;
  embedUrl?: string | null;
  previewTitle?: string;
  previewDescription?: string;
  visibility?: "public" | "private";
  mediaKind?: string;
  storagePath?: string;
  bucket?: string;
  fileName?: string;
  priceCents?: number;
  payProvider?: string;
  customizations?: unknown;
  draftCount?: number;
};

export function dropItemToProfileActivity(
  drop: ProfileBoardDrop,
  owner?: ProfileActivityOwner
): BoardActivity {
  const created = new Date(drop.createdAt || Date.now()).toISOString();
  const title = drop.title || "Board Drop";
  const description =
    drop.description?.trim() ||
    `New ${String(drop.type || "board").toLowerCase()} drop added to Board.`;
  const href = drop.linkUrl || drop.url || null;

  return {
    id: `profile_board_drop_${owner?.userId ?? owner?.username ?? "user"}_${drop.id}`,
    created_at: created,
    user_id: owner?.userId ?? null,
    kind: "board_drop",
    title,
    body: description,
    href,
    image_url: drop.previewImage || null,
    meta: {
      source: "profiles.board_style.boardDrops",
      dropId: drop.id,
      dropType: drop.type,
      visibility: drop.visibility ?? "public",
      embedUrl: drop.embedUrl ?? null,
      previewTitle: drop.previewTitle ?? null,
      previewDescription: drop.previewDescription ?? null,
      previewImage: drop.previewImage ?? null,
      ownerUsername: owner?.username ?? null,
      ownerLabel: owner?.displayName ?? null,
      mediaKind: drop.mediaKind ?? null,
      storagePath: drop.storagePath ?? null,
      bucket: drop.bucket ?? null,
      fileName: drop.fileName ?? null,
      priceCents: drop.priceCents ?? null,
      payProvider: drop.payProvider ?? null,
      customizations: drop.customizations ?? null,
      draftCount: drop.draftCount ?? null,
    },
  };
}

export function dropVisibleToViewer(
  visibility?: "public" | "private" | string | null,
  viewerIsOwner = false
) {
  return String(visibility ?? "public").toLowerCase() !== "private" || viewerIsOwner;
}

/** Merge feed activity with board collection drops, dedupe, cap at 12. */
export function resolveProfileActivityDrops(
  activityItems: BoardActivity[],
  boardDropItems: ProfileBoardDrop[] = [],
  owner?: ProfileActivityOwner,
  options?: { viewerIsOwner?: boolean }
): BoardActivity[] {
  const viewerIsOwner = options?.viewerIsOwner ?? false;

  const visibleActivity = activityItems.filter((item) =>
    dropVisibleToViewer(item.meta?.visibility, viewerIsOwner)
  );
  const fromBoard = boardDropItems
    .filter((drop) => dropVisibleToViewer(drop.visibility, viewerIsOwner))
    .map((drop) => dropItemToProfileActivity(drop, owner));

  return dedupeActivity([...visibleActivity, ...fromBoard]).slice(
    0,
    PROFILE_ACTIVITY_CHANNEL_LIMIT
  );
}
