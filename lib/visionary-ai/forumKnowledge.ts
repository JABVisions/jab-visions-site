import type { SupabaseClient } from "@supabase/supabase-js";
import { BOARD_ROOM_CATALOG, roomHref } from "@/lib/board/rooms/catalog";
import type { VisionaryKnowledgeDocument } from "./types";

/**
 * Live Forums index for Visionary AI.
 *
 * Everything else Visionary AI knows comes from hand-curated JSON in
 * content/visionary-ai/*.json. But community lore — a character bio typed
 * into a JAB Comics thread, a Drop shared into a Room — lives in Supabase
 * and changes constantly, so it's read here at request time instead of
 * being baked into a static document. Only text that's already public in
 * the Forums (room_posts, room_drop_shares — both openly readable by design)
 * is used; nothing private ever enters this index.
 */

const MAX_ROOM_POSTS = 400;
const MAX_DROP_SHARES = 200;
const MAX_FACTS_PER_DOCUMENT = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

type RoomPostRow = {
  id: string;
  room_id: string;
  parent_id: string | null;
  kind: string;
  title: string | null;
  body: string;
  created_at: string;
};

type RoomDropShareRow = {
  id: string;
  room_id: string;
  drop_id: string;
  snapshot: Record<string, unknown> | null;
  created_at: string;
};

let cachedDocuments: VisionaryKnowledgeDocument[] | null = null;
let cacheExpiresAt = 0;

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roomLabel(roomId: string): { name: string; icon: string } {
  const room = BOARD_ROOM_CATALOG.find((item) => item.id === roomId);
  return { name: room?.name || roomId, icon: room?.icon || "" };
}

/** Proper-noun-ish words (capitalized, 3+ letters) make strong keywords for named lore like character names. */
function deriveKeywords(...texts: string[]): string[] {
  const words = new Set<string>();
  for (const text of texts) {
    for (const match of text.match(/[A-Z][a-zA-Z'’-]{2,}/g) ?? []) {
      words.add(match);
    }
  }
  return Array.from(words).slice(0, 12);
}

async function fetchThreadDocuments(
  supabase: SupabaseClient
): Promise<VisionaryKnowledgeDocument[]> {
  const { data, error } = await supabase
    .from("room_posts")
    .select("id, room_id, parent_id, kind, title, body, created_at")
    .in("kind", ["conversation", "text_post", "reply"])
    .order("created_at", { ascending: false })
    .limit(MAX_ROOM_POSTS);
  if (error || !data?.length) return [];

  const rows = data as RoomPostRow[];
  const threads = rows.filter((row) => row.kind !== "reply");
  const repliesByParent = new Map<string, RoomPostRow[]>();
  for (const row of rows) {
    if (row.kind === "reply" && row.parent_id) {
      const list = repliesByParent.get(row.parent_id) ?? [];
      list.push(row);
      repliesByParent.set(row.parent_id, list);
    }
  }

  const documents: VisionaryKnowledgeDocument[] = [];
  for (const thread of threads) {
    const label = roomLabel(thread.room_id);
    const threadBody = stripHtml(thread.body);
    const replies = (repliesByParent.get(thread.id) ?? [])
      .slice(0, MAX_FACTS_PER_DOCUMENT)
      .map((reply) => stripHtml(reply.body))
      .filter(Boolean);
    const facts = [threadBody, ...replies].filter(Boolean).slice(0, MAX_FACTS_PER_DOCUMENT);
    if (!facts.length) continue;

    const title = thread.title?.trim() || `A conversation in ${label.name}`;
    documents.push({
      id: `forum_thread_${thread.id}`,
      title: label.icon ? `${label.icon} ${label.name}: ${title}` : `${label.name}: ${title}`,
      category: "forums",
      visibility: "public",
      summary: facts[0].slice(0, 280),
      facts,
      keywords: [label.name, title, ...deriveKeywords(title, threadBody)],
      sources: [
        { title: `${label.name} Forum`, path: roomHref(thread.room_id, { conversation: thread.id }) },
      ],
    });
  }
  return documents;
}

async function fetchDropShareDocuments(
  supabase: SupabaseClient
): Promise<VisionaryKnowledgeDocument[]> {
  const { data, error } = await supabase
    .from("room_drop_shares")
    .select("id, room_id, drop_id, snapshot, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_DROP_SHARES);
  if (error || !data?.length) return [];

  const documents: VisionaryKnowledgeDocument[] = [];
  for (const share of data as RoomDropShareRow[]) {
    const snapshot = share.snapshot ?? {};
    const label = roomLabel(share.room_id);
    const title = String(
      (snapshot as Record<string, unknown>).title ||
        (snapshot as Record<string, unknown>).dropTitle ||
        ""
    ).trim();
    const description = stripHtml(
      (snapshot as Record<string, unknown>).description ??
        (snapshot as Record<string, unknown>).thoughtText ??
        (snapshot as Record<string, unknown>).body ??
        ""
    );
    if (!title && !description) continue;

    documents.push({
      id: `forum_drop_${share.id}`,
      title: label.icon
        ? `${label.icon} ${label.name}: ${title || "Shared Drop"}`
        : `${label.name}: ${title || "Shared Drop"}`,
      category: "forums",
      visibility: "public",
      summary: (description || title).slice(0, 280),
      facts: [description || title].filter(Boolean),
      keywords: [label.name, title, ...deriveKeywords(title, description)],
      sources: [{ title: `${label.name} Forum`, path: roomHref(share.room_id) }],
    });
  }
  return documents;
}

/** Fetch (and briefly cache) every public Forum thread/Drop as Visionary AI documents. */
export async function loadForumKnowledgeDocuments(
  supabase: SupabaseClient
): Promise<VisionaryKnowledgeDocument[]> {
  const now = Date.now();
  if (cachedDocuments && cacheExpiresAt > now) return cachedDocuments;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("forum knowledge fetch timed out")), FETCH_TIMEOUT_MS)
    );
    const [threads, drops] = await Promise.race([
      Promise.all([fetchThreadDocuments(supabase), fetchDropShareDocuments(supabase)]),
      timeout,
    ]);
    cachedDocuments = [...threads, ...drops];
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cachedDocuments;
  } catch {
    // Forums being unreachable (or slow) must never break Visionary AI's static knowledge.
    return cachedDocuments ?? [];
  }
}
