import type { RoomConversationReply, RoomDropShare } from "./types";

export type DropVisibility = "public" | "private";

export function normalizeDropVisibility(value: unknown): DropVisibility | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "private") return "private";
  if (raw === "public") return "public";
  return null;
}

/** Live Drop privacy wins over a share/reply snapshot baked at share time. */
export function resolveLiveDropVisibility(input: {
  snapshot?: Record<string, unknown> | null;
  live?: { visibility?: unknown } | null;
  activityMeta?: Record<string, unknown> | null;
}): DropVisibility {
  const live = normalizeDropVisibility(input.live?.visibility);
  if (live) return live;
  const activity = normalizeDropVisibility(input.activityMeta?.visibility);
  if (activity) return activity;
  return normalizeDropVisibility(input.snapshot?.visibility) || "public";
}

export function applyLiveVisibilityToSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  visibility: DropVisibility | null | undefined
): Record<string, unknown> {
  const next = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  if (visibility === "public" || visibility === "private") {
    next.visibility = visibility;
  }
  return next;
}

export function applyLiveVisibilityToShare(
  share: RoomDropShare,
  visibility: DropVisibility | null | undefined
): RoomDropShare {
  if (visibility !== "public" && visibility !== "private") return share;
  return {
    ...share,
    snapshot: applyLiveVisibilityToSnapshot(share.snapshot, visibility),
  };
}

export function applyLiveVisibilityToReply(
  reply: RoomConversationReply,
  visibility: DropVisibility | null | undefined
): RoomConversationReply {
  if (visibility !== "public" && visibility !== "private") return reply;
  if (!reply.dropSnapshot) return reply;
  return {
    ...reply,
    dropSnapshot: applyLiveVisibilityToSnapshot(reply.dropSnapshot, visibility),
  };
}

export function overlaySharesWithVisibilityMap(
  shares: RoomDropShare[],
  visibilityByDropId: Map<string, DropVisibility> | Record<string, DropVisibility | null | undefined>
): RoomDropShare[] {
  return shares.map((share) => {
    const live =
      visibilityByDropId instanceof Map
        ? visibilityByDropId.get(share.dropId)
        : visibilityByDropId[share.dropId];
    return applyLiveVisibilityToShare(share, live);
  });
}
