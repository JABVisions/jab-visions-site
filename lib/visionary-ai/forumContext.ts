import { getRoomById, resolveRoomId, BOARD_ROOM_CATALOG } from "@/lib/board/rooms/catalog";
import { conversationsForRoom, seedConversations } from "@/lib/board/rooms/conversations";
import { looksLikeMediaFileName } from "@/lib/board/forumRoomFeedCopy";
import type { VisionaryKnowledgeDocument } from "./types";

export type ForumContextShare = {
  title?: string | null;
  body?: string | null;
  type?: string | null;
  visibility?: string | null;
  fromDescript?: boolean;
  fromDropbook?: boolean;
};

export type ForumContextConversation = {
  title?: string | null;
  body?: string | null;
  replies?: Array<{ body?: string | null }>;
};

export type ForumRoomContext = {
  roomId: string;
  roomName: string;
  description: string;
  chips: string[];
  conversations: ForumContextConversation[];
  shares: ForumContextShare[];
};

const PRIVATE_VIS = /^(private|invite-only|work)$/i;

export function mentionRoomIdFromQuery(query: string): string | null {
  const text = String(query || "");
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  for (const room of BOARD_ROOM_CATALOG) {
    const names = [room.id, room.slug, room.name, ...(room.aliases || [])]
      .map((value) => String(value || "").toLowerCase())
      .filter(Boolean);
    if (names.some((name) => name.length >= 3 && lower.includes(name))) {
      return room.id;
    }
  }
  if (/\bforums?\b/i.test(text) && /\bmusic\b/i.test(text)) return "music";
  return null;
}

export function forumRoomContextFromCatalog(
  roomId: string | null | undefined,
  extras?: {
    conversations?: ForumContextConversation[];
    shares?: ForumContextShare[];
  }
): ForumRoomContext | null {
  const resolved = resolveRoomId(roomId) || String(roomId || "").trim();
  const room = resolved ? getRoomById(resolved) : null;
  if (!room) return null;
  const seeded = extras?.conversations?.length
    ? extras.conversations
    : conversationsForRoom(seedConversations([]), room.id).map((item) => ({
        title: item.title,
        body: item.body,
        replies: (item.replies || []).slice(0, 3).map((reply) => ({ body: reply.body })),
      }));
  const shares = (extras?.shares || []).filter((share) => !PRIVATE_VIS.test(String(share.visibility || "")));
  return {
    roomId: room.id,
    roomName: room.name,
    description: room.description,
    chips: room.chips,
    conversations: seeded.slice(0, 8),
    shares: shares.slice(0, 12),
  };
}

function publicShareLine(share: ForumContextShare) {
  const title = String(share.title || "").trim();
  const named = title && !looksLikeMediaFileName(title) ? title : "";
  const body = String(share.body || "").trim();
  const kind = share.fromDescript ? "Descript" : share.fromDropbook ? "Dropbook" : String(share.type || "Drop");
  const head = named || `${kind} Drop`;
  return body ? `${head} — ${body}` : head;
}

export function formatForumRoomContext(context: ForumRoomContext): string {
  const conversations = context.conversations
    .map((item) => {
      const title = String(item.title || "Conversation").trim();
      const body = String(item.body || "").trim();
      const replies = (item.replies || [])
        .map((reply) => String(reply.body || "").trim())
        .filter(Boolean)
        .slice(0, 2);
      return [`- ${title}${body ? `: ${body}` : ""}`, ...replies.map((reply) => `  · ${reply}`)].join("\n");
    })
    .join("\n");
  const shares = context.shares.map((share) => `- ${publicShareLine(share)}`).join("\n");
  return [
    `FORUM ROOM: ${context.roomName} (${context.roomId})`,
    `DESCRIPTION: ${context.description}`,
    context.chips.length ? `CHIPS: ${context.chips.join(", ")}` : "",
    conversations ? `RECENT CONVERSATIONS:\n${conversations}` : "RECENT CONVERSATIONS: none indexed",
    shares ? `SHARED DROPS (public metadata only):\n${shares}` : "SHARED DROPS: none public",
  ]
    .filter(Boolean)
    .join("\n");
}

export function forumContextDocument(context: ForumRoomContext): VisionaryKnowledgeDocument {
  const facts = [
    `${context.roomName} is a Forum Room on Board. ${context.description}`,
    context.chips.length ? `Room chips: ${context.chips.join(", ")}.` : `${context.roomName} is an enterable Forum Room.`,
    ...context.conversations.slice(0, 4).map((item) => {
      const title = String(item.title || "Conversation").trim();
      const body = String(item.body || "").trim();
      return body ? `Conversation “${title}”: ${body}` : `Conversation “${title}” is open in ${context.roomName}.`;
    }),
    ...context.shares.slice(0, 4).map((share) => `Shared in ${context.roomName}: ${publicShareLine(share)}`),
  ].filter(Boolean);

  return {
    id: `forum-room-${context.roomId}`,
    title: `${context.roomName} Forum Room`,
    category: "forums",
    visibility: "public",
    summary: `${context.roomName} is a Board Forum Room. ${context.description}`,
    facts,
    keywords: [
      context.roomName,
      context.roomId,
      "forum",
      "forums",
      "room",
      ...context.chips,
      "conversation",
      "drop",
    ],
    sources: [{ title: `${context.roomName} Room`, path: `/board/forums/${context.roomId}` }],
  };
}

export function forumContextHasUsefulFacts(context: ForumRoomContext | null | undefined) {
  if (!context) return false;
  return Boolean(context.roomName && (context.description || context.conversations.length || context.shares.length));
}
