// app/board/forums/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import RoomsPanel from "@/app/components/board/forums/RoomsPanel";
import ThreadDropPanel from "@/app/components/board/forums/ThreadDropPanel";

/* -------------------------------------------------------------------------- */
/* NOTE: "Rooms" is our UI word for what most apps call "Channels".
   These Rooms will later evolve into "Room Drops", but for now they are the
   organizing layer for Thread Drops.
-------------------------------------------------------------------------- */

type RoomActivityTag = "new" | "hot" | "quiet";
type ThreadDropPrivacy = "public" | "private" | "work" | "invite-only";
type ThreadDropMood = "quiet" | "active" | "urgent" | "dreaming" | "locked";

export type ForumRoom = {
  id: string;
  name: string;
  subtitle?: string;
  color?: string;
  icon?: string;
  isPinned?: boolean;
  sortOrder?: number;
  threadCount?: number;
  unreadCount?: number;
  activityTag?: RoomActivityTag;
  lastActivityAt?: number;
};

export type ThreadDropParticipant = {
  id: string;
  name: string;
  avatar?: string;
  aura: string;
};

export type ThreadDropReply = {
  id: string;
  threadId: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
};

export type ThreadDrop = {
  id: string;
  roomId: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  privacy: ThreadDropPrivacy;
  mood?: ThreadDropMood;
  participants: ThreadDropParticipant[];
  replies: ThreadDropReply[];
  isPinned?: boolean;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const SELECTED_ROOM_STORAGE_KEY = "jab_forums_selected_room_v1";
const THREADS_STORAGE_KEY = "jab_forums_threads_v1";

function uid(prefix = "t") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function isoFromOffset(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function parseTime(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatDateTime(value: string) {
  const time = parseTime(value);
  return new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function privacyLabel(value: ThreadDropPrivacy) {
  switch (value) {
    case "private":
      return "Private Room";
    case "work":
      return "Work Room";
    case "invite-only":
      return "Invite Only";
    case "public":
    default:
      return "Public Room";
  }
}

const now = Date.now();

const SEED_ROOMS: ForumRoom[] = [
  {
    id: "lobby",
    name: "Lobby",
    subtitle: "Start here - intros - links",
    icon: "🏁",
    color: "#A78BFA",
    isPinned: true,
    threadCount: 12,
    unreadCount: 2,
    activityTag: "new",
    lastActivityAt: now - 1000 * 60 * 9,
  },
  {
    id: "announcements",
    name: "Announcements",
    subtitle: "Updates - releases - notices",
    icon: "📌",
    color: "#F472B6",
    isPinned: true,
    threadCount: 6,
    unreadCount: 0,
    activityTag: "quiet",
    lastActivityAt: now - 1000 * 60 * 60 * 12,
  },
  {
    id: "casting",
    name: "Casting Corner",
    subtitle: "Auditions - recasts - submissions",
    icon: "🎭",
    color: "#60A5FA",
    threadCount: 28,
    unreadCount: 5,
    activityTag: "hot",
    lastActivityAt: now - 1000 * 60 * 2,
  },
  {
    id: "crew",
    name: "Crew Calls",
    subtitle: "Gigs - collaborators - rates",
    icon: "🎬",
    color: "#34D399",
    threadCount: 14,
    unreadCount: 1,
    activityTag: "new",
    lastActivityAt: now - 1000 * 60 * 35,
  },
  {
    id: "projects",
    name: "Projects",
    subtitle: "Build logs - dev threads - goals",
    icon: "🧩",
    color: "#FBBF24",
    threadCount: 19,
    unreadCount: 0,
    activityTag: "quiet",
    lastActivityAt: now - 1000 * 60 * 60 * 4,
  },
  {
    id: "offtopic",
    name: "Off Topic",
    subtitle: "Memes - life - random drops",
    icon: "🍿",
    color: "#FB7185",
    threadCount: 9,
    unreadCount: 0,
    activityTag: "quiet",
    lastActivityAt: now - 1000 * 60 * 60 * 24 * 2,
  },
];

const DEFAULT_PARTICIPANTS: ThreadDropParticipant[] = [
  { id: "p_ja", name: "John Andy", aura: "#60A5FA" },
  { id: "p_board", name: "Board", aura: "#34D399" },
  { id: "p_signal", name: "Signal", aura: "#F472B6" },
];

const SEED_DROPS: ThreadDrop[] = [
  {
    id: "d1",
    roomId: "lobby",
    title: "Introduce yourself: what's your Board vibe?",
    body: "Drop a sentence, your favorite link, and what kind of signal you want to leave in the room.",
    authorName: "System",
    createdAt: isoFromOffset(1000 * 60 * 60 * 22),
    privacy: "public",
    mood: "active",
    participants: DEFAULT_PARTICIPANTS,
    replies: [
      {
        id: "r_d1_1",
        threadId: "d1",
        authorName: "John Andy",
        body: "Keep it short, honest, and useful. A good room starts with a clear signal.",
        createdAt: isoFromOffset(1000 * 60 * 11),
      },
    ],
  },
  {
    id: "d2",
    roomId: "lobby",
    title: "Rooms vs Channels: naming discussion",
    body: "We're using Rooms now to prep for Room Drops later. The structure should feel more like entering a space than scrolling a message board.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 5),
    privacy: "public",
    mood: "dreaming",
    participants: DEFAULT_PARTICIPANTS.slice(0, 2),
    replies: [
      {
        id: "r_d2_1",
        threadId: "d2",
        authorName: "Board",
        body: "Room language keeps the door open for private chambers, project rooms, and invite-only drops later.",
        createdAt: isoFromOffset(1000 * 60 * 9),
      },
    ],
  },
  {
    id: "a1",
    roomId: "announcements",
    title: "Update: Forums navigation is now Room-based",
    body: "Rooms are channels for now. Room Drops come later. Thread Drops are the conversation artifacts inside each room.",
    authorName: "Admin",
    createdAt: isoFromOffset(1000 * 60 * 60 * 26),
    privacy: "public",
    mood: "quiet",
    participants: DEFAULT_PARTICIPANTS.slice(1),
    replies: [],
  },
  {
    id: "c1",
    roomId: "casting",
    title: "Open call: extras for NYC street scene",
    body: "Looking for featured extras for a stylized NYC street sequence. Wardrobe notes, availability, and headshots can be dropped into this room.",
    authorName: "Casting",
    createdAt: isoFromOffset(1000 * 60 * 80),
    privacy: "work",
    mood: "urgent",
    participants: DEFAULT_PARTICIPANTS,
    replies: [
      {
        id: "r_c1_1",
        threadId: "c1",
        authorName: "Prod Team",
        body: "Signals needed: availability, preferred contact, and one current photo.",
        createdAt: isoFromOffset(1000 * 60 * 7),
      },
    ],
  },
  {
    id: "c2",
    roomId: "casting",
    title: "Self-tape format: slate + takes + file naming",
    body: "Keeping submissions consistent. Use the same slate order, label your files cleanly, and drop your upload link once.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 3),
    privacy: "public",
    mood: "active",
    participants: DEFAULT_PARTICIPANTS.slice(0, 2),
    replies: [],
  },
  {
    id: "cr1",
    roomId: "crew",
    title: "Looking for a PA for a one-day interior shoot",
    body: "Paid, food provided, Manhattan. Drop a signal with your availability and whether you can help with lockups.",
    authorName: "Prod Team",
    createdAt: isoFromOffset(1000 * 60 * 60 * 9),
    privacy: "work",
    mood: "active",
    participants: DEFAULT_PARTICIPANTS,
    replies: [],
  },
  {
    id: "p1",
    roomId: "projects",
    title: "Work Desk -> Projects page: UI layout brainstorm",
    body: "Tile-based table, project rooms, drop creator column, and a clean way to move project signals into the feed.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 30),
    privacy: "private",
    mood: "dreaming",
    participants: DEFAULT_PARTICIPANTS,
    replies: [],
  },
  {
    id: "o1",
    roomId: "offtopic",
    title: "What's everyone building this week?",
    body: "Anything counts. Even half-finished ideas. Drop the thing you keep circling back to.",
    authorName: "Community",
    createdAt: isoFromOffset(1000 * 60 * 60 * 50),
    privacy: "public",
    mood: "quiet",
    participants: DEFAULT_PARTICIPANTS.slice(1),
    replies: [],
  },
];

function normalizeStoredDrops(value: unknown): ThreadDrop[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any): ThreadDrop | null => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title ?? "").trim();
      if (!title) return null;
      const id = String(item.id ?? uid("th"));
      const createdAt =
        typeof item.createdAt === "string"
          ? item.createdAt
          : new Date(Number(item.createdAt) || Date.now()).toISOString();
      const legacySubtitle = String(item.subtitle ?? "").trim();
      const body = String(item.body ?? item.description ?? legacySubtitle ?? "").trim();
      const privacy: ThreadDropPrivacy =
        item.privacy === "private" ||
        item.privacy === "work" ||
        item.privacy === "invite-only" ||
        item.privacy === "public"
          ? item.privacy
          : "public";

      return {
        id,
        roomId: String(item.roomId ?? "lobby"),
        title,
        body: body || "Thread Drop room opened.",
        authorName: String(item.authorName ?? item.author?.name ?? item.author ?? "You"),
        authorAvatar: typeof item.authorAvatar === "string" ? item.authorAvatar : undefined,
        createdAt,
        privacy,
        mood:
          item.mood === "quiet" ||
          item.mood === "active" ||
          item.mood === "urgent" ||
          item.mood === "dreaming" ||
          item.mood === "locked"
            ? item.mood
            : "active",
        participants: Array.isArray(item.participants) && item.participants.length
          ? item.participants
          : DEFAULT_PARTICIPANTS.slice(0, 2),
        replies: Array.isArray(item.replies)
          ? item.replies.map((reply: any) => ({
              id: String(reply.id ?? uid("r")),
              threadId: String(reply.threadId ?? id),
              authorName: String(reply.authorName ?? reply.author?.name ?? reply.author ?? "You"),
              authorAvatar: typeof reply.authorAvatar === "string" ? reply.authorAvatar : undefined,
              body: String(reply.body ?? reply.text ?? ""),
              createdAt:
                typeof reply.createdAt === "string"
                  ? reply.createdAt
                  : new Date(Number(reply.createdAt) || Date.now()).toISOString(),
            }))
          : [],
        isPinned: Boolean(item.isPinned),
      };
    })
    .filter((item): item is ThreadDrop => Boolean(item));
}

export default function ForumsPage() {
  const [rooms, setRooms] = useState<ForumRoom[]>(SEED_ROOMS);
  const [drops, setDrops] = useState<ThreadDrop[]>(SEED_DROPS);

  const [roomQuery, setRoomQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [openDropId, setOpenDropId] = useState<string | null>(null);

  const [draftRoomId, setDraftRoomId] = useState("lobby");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftPrivacy, setDraftPrivacy] = useState<ThreadDropPrivacy>("public");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(THREADS_STORAGE_KEY);
      if (raw) {
        const stored = normalizeStoredDrops(JSON.parse(raw));
        if (stored.length) setDrops(stored);
      }
    } catch {
      // Seed data stays available if local storage cannot be read.
    }

    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem(SELECTED_ROOM_STORAGE_KEY)
        : null;
    const exists = !!saved && SEED_ROOMS.some((r) => r.id === saved);
    setSelectedRoomId(exists ? saved : "lobby");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(drops));
    } catch {
      // Ignore storage failures; page state still works for the session.
    }
  }, [drops]);

  useEffect(() => {
    if (!selectedRoomId) return;
    try {
      localStorage.setItem(SELECTED_ROOM_STORAGE_KEY, selectedRoomId);
    } catch {
      // ignore storage failures
    }
  }, [selectedRoomId]);

  const filteredRooms = useMemo<ForumRoom[]>(() => {
    const q = roomQuery.trim().toLowerCase();

    const matches = (r: ForumRoom) => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.subtitle ?? "").toLowerCase().includes(q)
      );
    };

    const pinned = rooms.filter((r) => r.isPinned).filter(matches);
    const rest = rooms.filter((r) => !r.isPinned).filter(matches);

    const sortBy = (a: ForumRoom, b: ForumRoom) => {
      const ao = a.sortOrder ?? 9999;
      const bo = b.sortOrder ?? 9999;
      if (ao !== bo) return ao - bo;
      const at = a.lastActivityAt ?? 0;
      const bt = b.lastActivityAt ?? 0;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    };

    return [...pinned.sort(sortBy), ...rest.sort(sortBy)];
  }, [rooms, roomQuery]);

  const selectedRoom = useMemo<ForumRoom | null>(() => {
    if (!selectedRoomId) return null;
    return rooms.find((r) => r.id === selectedRoomId) ?? null;
  }, [rooms, selectedRoomId]);

  const roomDrops = useMemo<ThreadDrop[]>(() => {
    if (!selectedRoomId) return [];
    const q = dropQuery.trim().toLowerCase();
    const base = drops.filter((d) => d.roomId === selectedRoomId);

    const filtered = !q
      ? base
      : base.filter((d) => {
          const hay = `${d.title} ${d.body} ${d.authorName}`.toLowerCase();
          return hay.includes(q);
        });

    return filtered.sort((a, b) => {
      const at = a.replies[0]?.createdAt ?? a.createdAt;
      const bt = b.replies[0]?.createdAt ?? b.createdAt;
      return parseTime(bt) - parseTime(at);
    });
  }, [drops, selectedRoomId, dropQuery]);

  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => {
        const roomThreadDrops = drops.filter((d) => d.roomId === r.id);
        const latest = roomThreadDrops.reduce(
          (max, d) => Math.max(max, parseTime(d.replies[0]?.createdAt ?? d.createdAt)),
          r.lastActivityAt ?? 0
        );
        return {
          ...r,
          threadCount: roomThreadDrops.length,
          lastActivityAt: latest,
        };
      })
    );
  }, [drops]);

  function openCreate(roomId?: string) {
    const nextRoomId = roomId || selectedRoomId || "lobby";
    setSelectedRoomId(nextRoomId);
    setDraftRoomId(nextRoomId);
    setDraftTitle("");
    setDraftBody("");
    setDraftPrivacy("public");
    setCreateOpen(true);
  }

  function submitCreate() {
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title || !body) return;

    const newDrop: ThreadDrop = {
      id: uid("th"),
      roomId: draftRoomId,
      title,
      body,
      authorName: "You",
      createdAt: new Date().toISOString(),
      privacy: draftPrivacy,
      mood: draftPrivacy === "work" ? "active" : draftPrivacy === "private" ? "locked" : "quiet",
      participants: [
        { id: "you", name: "You", aura: "#34D399" },
        { id: "board", name: "Board", aura: "#A78BFA" },
      ],
      replies: [],
    };

    setDrops((prev) => [newDrop, ...prev]);
    setSelectedRoomId(draftRoomId);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === draftRoomId
          ? {
              ...r,
              lastActivityAt: Date.now(),
              activityTag: "new",
              unreadCount: (r.unreadCount ?? 0) + 1,
            }
          : r
      )
    );
    setCreateOpen(false);
    setOpenDropId(newDrop.id);
  }

  function sendSignal(threadId: string, body: string) {
    const text = body.trim();
    if (!text) return;
    setDrops((prev) =>
      prev.map((drop) => {
        if (drop.id !== threadId) return drop;
        const hasYou = drop.participants.some((p) => p.id === "you");
        return {
          ...drop,
          participants: hasYou
            ? drop.participants
            : [{ id: "you", name: "You", aura: "#34D399" }, ...drop.participants],
          replies: [
            {
              id: uid("sig"),
              threadId,
              authorName: "You",
              body: text,
              createdAt: new Date().toISOString(),
            },
            ...drop.replies,
          ],
        };
      })
    );
  }

  const openDrop = useMemo(() => {
    if (!openDropId) return null;
    return drops.find((d) => d.id === openDropId) ?? null;
  }, [drops, openDropId]);

  const openDropRoom = openDrop
    ? rooms.find((room) => room.id === openDrop.roomId) ?? null
    : null;

  return (
    <div
      className={clsx(
        "min-h-screen w-full",
        "bg-gradient-to-b from-[#070712] via-[#09091a] to-black",
        "text-white"
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-5">
          <div className="text-2xl font-semibold tracking-tight">Forums</div>
          <div className="mt-1 text-sm text-white/60">
            Rooms are what we're calling channels for now. Thread Drops open like private conversation rooms.
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 md:col-span-4 lg:col-span-3">
            <RoomsPanel
              rooms={filteredRooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={(id) => {
                setSelectedRoomId(id);
                setDropQuery("");
              }}
              query={roomQuery}
              onQueryChange={setRoomQuery}
              showPinned
              showCounts
              showUnread
            />
          </aside>

          <main className="col-span-12 md:col-span-8 lg:col-span-9">
            <ThreadDropPanel
              room={selectedRoom}
              drops={roomDrops}
              query={dropQuery}
              onQueryChange={setDropQuery}
              onCreateDrop={(roomId) => openCreate(roomId)}
              onOpenDrop={(dropId) => setOpenDropId(dropId)}
            />
          </main>
        </div>
      </div>

      {createOpen && (
        <ModalShell title="Create Thread Drop" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                  Room
                </div>
                <select
                  value={draftRoomId}
                  onChange={(e) => setDraftRoomId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                >
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id} className="bg-[#080812]">
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                  Status
                </div>
                <select
                  value={draftPrivacy}
                  onChange={(e) => setDraftPrivacy(e.target.value as ThreadDropPrivacy)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                >
                  <option value="public" className="bg-[#080812]">Public Room</option>
                  <option value="private" className="bg-[#080812]">Private Room</option>
                  <option value="work" className="bg-[#080812]">Work Room</option>
                  <option value="invite-only" className="bg-[#080812]">Invite Only</option>
                </select>
              </label>
            </div>

            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                Title
              </div>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Name the room signal..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                autoFocus
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                Body
              </div>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="What should people know before they step into this Thread Drop?"
                rows={5}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-white/70 hover:border-white/20 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={!draftTitle.trim() || !draftBody.trim()}
                className={clsx(
                  "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                  draftTitle.trim() && draftBody.trim()
                    ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-50 hover:bg-emerald-300/20"
                    : "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                )}
              >
                Create Thread Drop
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {openDrop && (
        <ThreadDropRoom
          thread={openDrop}
          room={openDropRoom}
          onClose={() => setOpenDropId(null)}
          onSendSignal={sendSignal}
        />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80]">
      <button
        aria-label="Close modal overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-3xl border border-white/10 bg-[#0b0b18]/95 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_90px_rgba(0,0,0,0.72)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/90">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-white/20 hover:bg-white/5"
            >
              Close
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ThreadDropRoom({
  thread,
  room,
  onClose,
  onSendSignal,
}: {
  thread: ThreadDrop;
  room: ForumRoom | null;
  onClose: () => void;
  onSendSignal: (threadId: string, body: string) => void;
}) {
  const [signal, setSignal] = useState("");
  const [mounted, setMounted] = useState(false);
  const roomColor = room?.color ?? "#A78BFA";
  const canSend = signal.trim().length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="Leave Thread Drop room"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div className="absolute inset-x-0 bottom-[calc(104px+env(safe-area-inset-bottom))] top-[104px] overflow-y-auto px-3 py-3 sm:top-[112px] sm:px-5 sm:py-4 md:px-8">
        <section className="relative mx-auto grid min-h-[min(640px,calc(100vh-244px))] max-h-[calc(100vh-236px-env(safe-area-inset-bottom))] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#071016]/92 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_80px_rgba(52,211,153,0.13),0_28px_110px_rgba(0,0,0,0.78)] backdrop-blur-2xl sm:rounded-[2rem]">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(760px 360px at 20% 0%, ${roomColor}33, transparent 62%),
                radial-gradient(560px 320px at 90% 12%, rgba(244,114,182,0.18), transparent 68%),
                linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%)`,
            }}
          />

          <header className="relative shrink-0 border-b border-white/10 px-4 py-4 sm:px-7 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
                    Thread Drop Room
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                    {room?.name ?? "Room"}
                  </span>
                  <span className="rounded-full border border-pink-200/25 bg-pink-200/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-pink-100">
                    {privacyLabel(thread.privacy)}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {thread.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                  <span>Opened by {thread.authorName}</span>
                  <span className="text-white/25">/</span>
                  <span>{formatDateTime(thread.createdAt)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80 transition hover:border-white/25 hover:bg-white/12"
              >
                Leave Room
              </button>
            </div>
          </header>

          <div className="relative min-h-0 overflow-auto px-4 py-4 sm:px-7 sm:py-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="space-y-4">
                <article className="rounded-3xl border border-white/10 bg-black/24 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/70">
                    Original Signal
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/82">
                    {thread.body}
                  </p>
                </article>

                <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
                        Signals
                      </div>
                      <div className="mt-1 text-sm text-white/45">
                        Replies dropped into this Thread Drop room.
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-bold text-white/70">
                      {thread.replies.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {thread.replies.length > 0 ? (
                      thread.replies.map((reply) => (
                        <div
                          key={reply.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/48">
                            <span className="font-bold text-white/72">{reply.authorName}</span>
                            <span>{formatDateTime(reply.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/78">
                            {reply.body}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
                        No signals yet. Be the first voice in this room.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
                    Participants
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {thread.participants.map((participant) => (
                      <div
                        key={participant.id}
                        title={participant.name}
                        className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/35 text-sm font-black text-white"
                        style={{ boxShadow: `0 0 22px ${participant.aura}88` }}
                      >
                        {participant.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={participant.avatar}
                            alt={participant.name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          participant.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-white/60">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                    Room State
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="flex justify-between gap-3">
                      <span>Privacy</span>
                      <span className="font-bold text-white/78">{privacyLabel(thread.privacy)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Mood</span>
                      <span className="font-bold capitalize text-white/78">{thread.mood ?? "active"}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <footer className="relative shrink-0 border-t border-white/10 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={signal}
                onChange={(e) => setSignal(e.target.value)}
                placeholder="Drop a signal into this room..."
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white placeholder:text-white/36 outline-none focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={() => {
                  const text = signal.trim();
                  if (!text) return;
                  onSendSignal(thread.id, text);
                  setSignal("");
                }}
                className={clsx(
                  "rounded-2xl border px-5 py-3 text-sm font-black uppercase tracking-[0.14em] transition",
                  canSend
                    ? "border-emerald-200/30 bg-emerald-300/16 text-emerald-50 hover:bg-emerald-300/22"
                    : "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                )}
              >
                Send Signal
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>,
    document.body
  );
}
