import {
  applyLiveVisibilityToShare,
  overlaySharesWithVisibilityMap,
  resolveLiveDropVisibility,
} from "./livePrivacy";
import { activityFromRoomShare } from "./feed";
import type { RoomDropShare } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const stalePrivate: RoomDropShare = {
  id: "share_1",
  roomId: "music",
  dropId: "drop_night",
  sharedBy: "user-1",
  sharedByName: "John Andy",
  snapshot: { title: "Night Tape", type: "Media", visibility: "private" },
  createdAt: new Date().toISOString(),
  origin: "create",
};

assert(
  resolveLiveDropVisibility({ snapshot: stalePrivate.snapshot }) === "private",
  "snapshot private stays private when no live override exists"
);
assert(
  resolveLiveDropVisibility({
    snapshot: stalePrivate.snapshot,
    live: { visibility: "public" },
  }) === "public",
  "live public wins over a stale private snapshot"
);
assert(
  resolveLiveDropVisibility({
    snapshot: { visibility: "private" },
    activityMeta: { visibility: "public" },
  }) === "public",
  "live activity privacy wins over the share snapshot"
);

const updated = applyLiveVisibilityToShare(stalePrivate, "public");
assert(updated.snapshot.visibility === "public", "share snapshot is rewritten to the live flag");
assert(stalePrivate.snapshot.visibility === "private", "original share object is not mutated");

const overlaid = overlaySharesWithVisibilityMap([stalePrivate], { drop_night: "public" });
const activity = activityFromRoomShare(overlaid[0]);
assert(activity?.meta?.visibility === "public", "Forum ActivityCard meta follows the live Drop");
assert(activity?.meta?.visibility !== "private", "unprivated Drops are not still private in Forums");

console.log("livePrivacy.check.ts: ok");
