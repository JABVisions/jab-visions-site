// lib/boardStore.ts
export type BoardUser = {
  id: string; // demo for now
  displayName: string;
  avatarDataUrl?: string | null;
};

export type FeedDrop = {
  id: string;
  type: "forum_thread" | "forum_reply" | "status";
  title: string;
  text: string;
  createdAt: number;
  authorName: string;
  authorId: string;
  href?: string; // link to the thing
  meta?: Record<string, any>;
};

export type ForumFolder = {
  id: string;
  title: string;
  description?: string;
  order: number;
};

export type Forum = {
  id: string;
  folderId: string;
  title: string;
  description?: string;
  order: number;
};

export type Thread = {
  id: string;
  forumId: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  lastActivityAt: number;
};

export type Reply = {
  id: string;
  threadId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
};

export type ForumsDB = {
  version: number;
  folders: ForumFolder[];
  forums: Forum[];
  threads: Thread[];
  replies: Reply[];
};

const FORUMS_KEY = "jab_board_forums_v1";
const FEED_KEY = "jab_board_feed_v1";

export const EVENTS = {
  forumsUpdated: "jab:forums_updated",
  feedUpdated: "jab:feed_updated",
} as const;

export function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function emit(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name));
}

export function readFeed(): FeedDrop[] {
  const drops = readJSON<FeedDrop[]>(FEED_KEY) ?? [];
  if (!Array.isArray(drops)) return [];
  return drops
    .map((d: any) => ({
      id: String(d.id ?? ""),
      type: d.type === "forum_reply" || d.type === "forum_thread" || d.type === "status" ? d.type : "status",
      title: String(d.title ?? ""),
      text: String(d.text ?? ""),
      createdAt: Number(d.createdAt ?? Date.now()),
      authorName: String(d.authorName ?? "Unknown"),
      authorId: String(d.authorId ?? "demo"),
      href: typeof d.href === "string" ? d.href : undefined,
      meta: typeof d.meta === "object" && d.meta ? d.meta : undefined,
    }))
    .filter((d) => d.id && d.title)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function addDrop(drop: Omit<FeedDrop, "id" | "createdAt"> & { id?: string; createdAt?: number }) {
  const next: FeedDrop = {
    id: drop.id ?? safeId(),
    createdAt: drop.createdAt ?? Date.now(),
    type: drop.type,
    title: drop.title,
    text: drop.text,
    authorId: drop.authorId,
    authorName: drop.authorName,
    href: drop.href,
    meta: drop.meta,
  };

  const current = readFeed();
  const merged = [next, ...current].slice(0, 120); // keep it snappy
  writeJSON(FEED_KEY, merged);
  emit(EVENTS.feedUpdated);
  return next;
}

export function removeDrops(
  matcher: (drop: FeedDrop) => boolean
) {
  const current = readFeed();
  const next = current.filter((drop) => !matcher(drop));
  writeJSON(FEED_KEY, next);
  emit(EVENTS.feedUpdated);
  return next;
}

export function clearFeed() {
  writeJSON(FEED_KEY, []);
  emit(EVENTS.feedUpdated);
}

export function seedForumsIfEmpty() {
  const existing = readJSON<ForumsDB>(FORUMS_KEY);
  if (existing?.folders?.length) return;

  const folders: ForumFolder[] = [
    { id: "f1", title: "JAB Originals", description: "IP, lore, announcements, official drops.", order: 1 },
    { id: "f2", title: "Production & Craft", description: "Film ops, gear, VFX, editing, locations.", order: 2 },
    { id: "f3", title: "Creator Lounge", description: "Music, modeling, collabs, personal brands.", order: 3 },
    { id: "f4", title: "Community Boards", description: "Find your people. Start a micro-community.", order: 4 },
    { id: "f5", title: "Help Desk", description: "Board how-tos, bugs, feature requests.", order: 5 },
  ];

  const forums: Forum[] = [
    // JAB Originals
    { id: "jab-news", folderId: "f1", title: "JAB Announcements", description: "News from the studio ecosystem.", order: 1 },
    { id: "ryderz-lore", folderId: "f1", title: "Those Ryderz Lore Vault", description: "Mythology, characters, theories.", order: 2 },
    { id: "auditions", folderId: "f1", title: "Casting & Auditions", description: "Open calls, self-tapes, notices.", order: 3 },

    // Production & Craft
    { id: "vfx-lab", folderId: "f2", title: "VFX Lab", description: "Auras, glows, roto, compositing tricks.", order: 1 },
    { id: "editing-room", folderId: "f2", title: "Editing Room", description: "Premiere/AE workflows, templates, pacing.", order: 2 },
    { id: "gear-talk", folderId: "f2", title: "Gear Talk", description: "Cameras, lenses, lighting, sound.", order: 3 },
    { id: "nyc-locations", folderId: "f2", title: "NYC Locations", description: "Permits, parks, rooftops, hidden gems.", order: 4 },

    // Creator Lounge
    { id: "music-drops", folderId: "f3", title: "Music Drops", description: "Post a song link. Build your soundtrack identity.", order: 1 },
    { id: "modeling", folderId: "f3", title: "Modeling & Photography", description: "Poses, edits, reels, confidence craft.", order: 2 },
    { id: "collabs", folderId: "f3", title: "Collabs", description: "Find creators to build with.", order: 3 },

    // Community Boards
    { id: "micro-boards", folderId: "f4", title: "Micro-Communities", description: "Start a small board inside the board.", order: 1 },
    { id: "showcase", folderId: "f4", title: "Showcase", description: "Share wins, progress, glow-ups.", order: 2 },

    // Help Desk
    { id: "board-bugs", folderId: "f5", title: "Bugs & Fixes", description: "Report issues. Track improvements.", order: 1 },
    { id: "feature-requests", folderId: "f5", title: "Feature Requests", description: "Vote on what we build next.", order: 2 },
  ];

  const now = Date.now();
  const threads: Thread[] = [
    {
      id: "t1",
      forumId: "music-drops",
      title: "Drop your theme song (Spotify/YouTube)",
      body: "If someone watched your life like a 2000s movie, what track plays in the trailer? Link it. 🎬",
      authorId: "demo",
      authorName: "JAB Creator",
      createdAt: now - 1000 * 60 * 60 * 14,
      lastActivityAt: now - 1000 * 60 * 60 * 10,
    },
    {
      id: "t2",
      forumId: "vfx-lab",
      title: "Best way to add aura glow without nuking skin tones?",
      body: "Looking for a clean glow stack that stays cinematic and doesn’t wash the footage.",
      authorId: "demo",
      authorName: "JAB Creator",
      createdAt: now - 1000 * 60 * 60 * 22,
      lastActivityAt: now - 1000 * 60 * 60 * 20,
    },
    {
      id: "t3",
      forumId: "feature-requests",
      title: "Friend Zone + DM inside BoardDock",
      body: "I want messages to feel like a secret hallway under the Board nav. 👀",
      authorId: "demo",
      authorName: "JAB Creator",
      createdAt: now - 1000 * 60 * 60 * 30,
      lastActivityAt: now - 1000 * 60 * 60 * 26,
    },
  ];

  const replies: Reply[] = [
    {
      id: "r1",
      threadId: "t1",
      body: "I’m claiming the ‘opening credits’ track slot. Old-school soundtrack energy only.",
      authorId: "demo",
      authorName: "JAB Creator",
      createdAt: now - 1000 * 60 * 60 * 9,
    },
    {
      id: "r2",
      threadId: "t2",
      body: "Try a soft glow plus a subtle edge matte. Keep the glow in a separate color layer for control.",
      authorId: "demo",
      authorName: "JAB Creator",
      createdAt: now - 1000 * 60 * 60 * 18,
    },
  ];

  const db: ForumsDB = { version: 1, folders, forums, threads, replies };
  writeJSON(FORUMS_KEY, db);
  emit(EVENTS.forumsUpdated);

  // Also seed a couple feed drops so profile feels connected immediately
  addDrop({
    type: "forum_thread",
    title: "Forums seeded: Music Drops is live",
    text: "Drop your theme song. Make your profile feel like a trailer.",
    authorId: "demo",
    authorName: "JAB Creator",
    href: "/board/forums?forum=music-drops",
  });
}

export function readForums(): ForumsDB {
  const db = readJSON<ForumsDB>(FORUMS_KEY);
  if (db?.folders?.length) return db;

  // if empty, seed it
  seedForumsIfEmpty();
  return (
    readJSON<ForumsDB>(FORUMS_KEY) ?? {
      version: 1,
      folders: [],
      forums: [],
      threads: [],
      replies: [],
    }
  );
}

export function writeForums(next: ForumsDB) {
  writeJSON(FORUMS_KEY, next);
  emit(EVENTS.forumsUpdated);
}

export function createThread(args: {
  forumId: string;
  title: string;
  body: string;
  author: BoardUser;
}) {
  const db = readForums();
  const t: Thread = {
    id: safeId(),
    forumId: args.forumId,
    title: args.title.trim() || "Untitled Thread",
    body: args.body.trim(),
    authorId: args.author.id,
    authorName: args.author.displayName,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const next: ForumsDB = { ...db, threads: [t, ...db.threads] };
  writeForums(next);

  addDrop({
    type: "forum_thread",
    title: t.title,
    text: t.body.slice(0, 180),
    authorId: t.authorId,
    authorName: t.authorName,
    href: `/board/forums?thread=${encodeURIComponent(t.id)}`,
    meta: { forumId: t.forumId },
  });

  return t;
}

export function createReply(args: {
  threadId: string;
  body: string;
  author: BoardUser;
}) {
  const db = readForums();
  const r: Reply = {
    id: safeId(),
    threadId: args.threadId,
    body: args.body.trim(),
    authorId: args.author.id,
    authorName: args.author.displayName,
    createdAt: Date.now(),
  };

  const threads = db.threads.map((t) =>
    t.id === args.threadId ? { ...t, lastActivityAt: Date.now() } : t
  );

  const next: ForumsDB = { ...db, threads, replies: [...db.replies, r] };
  writeForums(next);

  const thread = threads.find((t) => t.id === args.threadId);

  addDrop({
    type: "forum_reply",
    title: thread ? `Reply: ${thread.title}` : "Forum Reply",
    text: r.body.slice(0, 180),
    authorId: r.authorId,
    authorName: r.authorName,
    href: `/board/forums?thread=${encodeURIComponent(args.threadId)}`,
    meta: { threadId: args.threadId },
  });

  return r;
}
