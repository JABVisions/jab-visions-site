import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { conversationsForRoom, seedConversations } from "./conversations";
import { mergeRoomFeed } from "./feed";
import { resolveRoomId } from "./catalog";
import type { RoomConversation, RoomDropShare, RoomFeedItem, RoomSession } from "./types";

function mergeReplies(
  current: RoomConversation["replies"] | undefined,
  incoming: RoomConversation["replies"] | undefined
) {
  const byId = new Map<string, RoomConversation["replies"][number]>();
  for (const reply of [...(current || []), ...(incoming || [])]) {
    if (!reply?.id) continue;
    const existing = byId.get(reply.id);
    byId.set(reply.id, existing ? { ...existing, ...reply } : reply);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Same conversation merge for desktop, mobile, and empty localStorage. */
export function mergeConversationSources(input: {
  roomId: string;
  local?: RoomConversation[] | null;
  remote?: RoomConversation[] | null;
}): RoomConversation[] {
  const seeded = seedConversations(Array.isArray(input.local) ? input.local : []);
  const byId = new Map(seeded.map((item) => [item.id, item]));
  for (const remote of input.remote || []) {
    if (!remote?.id) continue;
    const current = byId.get(remote.id);
    byId.set(
      remote.id,
      current
        ? {
            ...current,
            ...remote,
            replies: mergeReplies(current.replies, remote.replies),
          }
        : remote
    );
  }
  return conversationsForRoom([...byId.values()], input.roomId);
}

/** Same Room Drop merge for every viewport. Remote wins on the same drop+author. */
export function mergeShareSources(input: {
  roomId: string;
  local?: RoomDropShare[] | null;
  remote?: RoomDropShare[] | null;
}): RoomDropShare[] {
  const roomId = resolveRoomId(input.roomId) || input.roomId;
  const byKey = new Map<string, RoomDropShare>();
  for (const share of [...(input.local || []), ...(input.remote || [])]) {
    if (!share?.dropId) continue;
    if ((resolveRoomId(share.roomId) || share.roomId) !== roomId) continue;
    byKey.set(`${share.dropId}:${share.sharedBy || ""}`, share);
  }
  return [...byKey.values()];
}

export function conversationsFromPostRows(
  roomId: string,
  posts: Array<Record<string, unknown>> | null | undefined
): RoomConversation[] {
  if (!Array.isArray(posts) || !posts.length) return [];
  const remoteConversations = new Map<string, RoomConversation>();
  const replies: Array<{ parentId: string; reply: RoomConversation["replies"][number] }> = [];

  for (const row of posts) {
    const id = String(row.id || "");
    if (!id) continue;
    const kind = String(row.kind || "conversation");
    const parentId = typeof row.parent_id === "string" ? row.parent_id : "";
    const authorName =
      pickBoardDisplayName(row.author_name, row.display_name, row.username) || "Board";
    const authorAvatar = String(row.avatar_url || row.author_avatar || "");
    const createdAt = String(row.created_at || new Date().toISOString());

    if (kind === "reply" && parentId) {
      const snapshot =
        row.metadata && typeof row.metadata === "object"
          ? ((row.metadata as { dropSnapshot?: Record<string, unknown> }).dropSnapshot as
              | Record<string, unknown>
              | undefined)
          : undefined;
      replies.push({
        parentId,
        reply: {
          id,
          threadId: parentId,
          authorName,
          authorAvatar,
          body: String(row.body || ""),
          createdAt,
          dropId: typeof row.drop_id === "string" && row.drop_id ? row.drop_id : undefined,
          dropSnapshot: snapshot,
        },
      });
      continue;
    }

    if (kind === "conversation" || kind === "text_post" || kind === "announcement") {
      remoteConversations.set(id, {
        id,
        roomId,
        title: String(row.title || "Conversation"),
        body: String(row.body || ""),
        authorName,
        authorAvatar,
        createdAt,
        replies: [],
        isPinned: row.pinned === true,
      });
    }
  }

  for (const item of replies) {
    const thread = remoteConversations.get(item.parentId);
    if (thread) thread.replies = [item.reply, ...thread.replies];
  }

  return [...remoteConversations.values()];
}

export function sharesFromApiRows(
  roomId: string,
  rows: Array<Record<string, unknown>> | null | undefined
): RoomDropShare[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows
    .map((row): RoomDropShare | null => {
      const dropId = String(row.drop_id || row.dropId || "").trim();
      if (!dropId) return null;
      const snapshot =
        row.snapshot && typeof row.snapshot === "object" ? (row.snapshot as Record<string, unknown>) : {};
      return {
        id: String(row.id || `${dropId}_${row.shared_by || row.sharedBy || "board"}`),
        roomId,
        dropId,
        sharedBy: String(row.shared_by || row.sharedBy || ""),
        sharedByName: pickBoardDisplayName(row.shared_by_name, row.display_name, snapshot.authorName),
        snapshot: {
          ...snapshot,
          authorName: pickBoardDisplayName(row.shared_by_name, row.display_name, snapshot.authorName),
          authorAvatar: row.avatar_url || snapshot.authorAvatar,
          authorUsername: row.username || snapshot.authorUsername,
        },
        createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
        origin:
          row.origin === "create" || row.origin === "conversation" || row.origin === "share"
            ? row.origin
            : "share",
        conversationId:
          typeof row.conversation_id === "string"
            ? row.conversation_id
            : typeof row.conversationId === "string"
              ? row.conversationId
              : null,
      };
    })
    .filter((row): row is RoomDropShare => Boolean(row));
}

/** Desktop and mobile Room interiors read this same feed builder. */
export function roomFeedFromSources(input: {
  roomId: string;
  localConversations?: RoomConversation[] | null;
  remoteConversations?: RoomConversation[] | null;
  localShares?: RoomDropShare[] | null;
  remoteShares?: RoomDropShare[] | null;
  sessions?: RoomSession[] | null;
}): RoomFeedItem[] {
  return mergeRoomFeed({
    conversations: mergeConversationSources({
      roomId: input.roomId,
      local: input.localConversations,
      remote: input.remoteConversations,
    }),
    shares: mergeShareSources({
      roomId: input.roomId,
      local: input.localShares,
      remote: input.remoteShares,
    }),
    sessions: input.sessions || [],
  });
}
