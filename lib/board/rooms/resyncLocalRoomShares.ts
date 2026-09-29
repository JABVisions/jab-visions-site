import type { SupabaseClient } from "@supabase/supabase-js";
import { readConversations, readShares } from "@/lib/board/rooms/storage";

const RESYNCED_SHARES_KEY = "jab_rooms_backfilled_shares_v1";
const RESYNCED_REPLIES_KEY = "jab_rooms_backfilled_replies_v1";

function readIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const rows = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(rows) ? rows.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-400)));
  } catch {
    // Safari private mode / quota
  }
}

/**
 * Drops shared into a Room (or replied with in a conversation) before the
 * Rooms tables existed in production only ever landed in this browser's
 * local storage — the server never learned about them, so the Feed never
 * got an "Open Room" link. Now that the schema is live, replay each local
 * share/reply once through the silent relink endpoint so those Drops' Feed
 * activity gets patched. Never re-posts into room_drop_shares/room_posts and
 * never triggers a notification — this only fixes the Feed link.
 */
export async function backfillLocalRoomLinks(
  _sb: SupabaseClient,
  userId: string,
  displayName: string
): Promise<void> {
  if (typeof window === "undefined" || !userId) return;

  const backfilledShares = readIdSet(RESYNCED_SHARES_KEY);
  const pendingShares = readShares().filter(
    (row) =>
      row.sharedBy === userId &&
      !backfilledShares.has(`${row.roomId}:${row.dropId}:${row.sharedBy}`)
  );

  const backfilledReplies = readIdSet(RESYNCED_REPLIES_KEY);
  const pendingReplies: Array<{
    roomId: string;
    threadId: string;
    conversationTitle: string;
    replyId: string;
    dropId: string;
  }> = [];
  for (const thread of readConversations()) {
    for (const reply of thread.replies) {
      if (!reply.dropId) continue;
      if (!displayName || reply.authorName !== displayName) continue;
      const key = `${thread.roomId}:${thread.id}:${reply.id}`;
      if (backfilledReplies.has(key)) continue;
      pendingReplies.push({
        roomId: thread.roomId,
        threadId: thread.id,
        conversationTitle: thread.title,
        replyId: reply.id,
        dropId: reply.dropId,
      });
    }
  }

  if (!pendingShares.length && !pendingReplies.length) return;

  for (const share of pendingShares) {
    try {
      const res = await fetch("/api/board/rooms/relink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: share.roomId,
          dropId: share.dropId,
          conversationId: share.conversationId || undefined,
        }),
      });
      if (res.ok) {
        backfilledShares.add(`${share.roomId}:${share.dropId}:${share.sharedBy}`);
      }
    } catch {
      // best-effort — try again next load
    }
  }
  writeIdSet(RESYNCED_SHARES_KEY, backfilledShares);

  for (const reply of pendingReplies) {
    try {
      const res = await fetch("/api/board/rooms/relink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: reply.roomId,
          dropId: reply.dropId,
          conversationId: reply.threadId,
          conversationTitle: reply.conversationTitle,
        }),
      });
      if (res.ok) {
        backfilledReplies.add(`${reply.roomId}:${reply.threadId}:${reply.replyId}`);
      }
    } catch {
      // best-effort — try again next load
    }
  }
  writeIdSet(RESYNCED_REPLIES_KEY, backfilledReplies);
}
