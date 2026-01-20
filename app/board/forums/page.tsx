// app/board/forums/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import RoomsPanel from "@/app/components/board/forums/RoomsPanel";
import ThreadDropPanel from "@/app/components/board/forums/ThreadDropPanel";

/* -------------------------------------------------------------------------- */
/* NOTE: “Rooms” is our UI word for what most apps call “Channels”.
   These Rooms will later evolve into “Room Drops” (a drop-style container),
   but for now they’re just the organizing layer for Thread Drops.
-------------------------------------------------------------------------- */

type RoomActivityTag = "new" | "hot" | "quiet";

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

export type ThreadDrop = {
  id: string;
  roomId: string;
  title: string;
  subtitle?: string;
  authorName?: string;
  createdAt: number;
  lastReplyAt?: number;
  replyCount?: number;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const STORAGE_KEY = "jab_forums_selected_room_v1";

function uid(prefix = "t") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const now = Date.now();

const SEED_ROOMS: ForumRoom[] = [
  {
    id: "lobby",
    name: "Lobby",
    subtitle: "Start here • intros • links",
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
    subtitle: "Updates • releases • notices",
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
    subtitle: "Auditions • recasts • submissions",
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
    subtitle: "Gigs • collaborators • rates",
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
    subtitle: "Build logs • dev threads • goals",
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
    subtitle: "Memes • life • random drops",
    icon: "🍿",
    color: "#FB7185",
    threadCount: 9,
    unreadCount: 0,
    activityTag: "quiet",
    lastActivityAt: now - 1000 * 60 * 60 * 24 * 2,
  },
];

const SEED_DROPS: ThreadDrop[] = [
  {
    id: "d1",
    roomId: "lobby",
    title: "Introduce yourself: what’s your Board vibe?",
    subtitle: "Drop a sentence + your favorite link",
    authorName: "System",
    createdAt: now - 1000 * 60 * 60 * 22,
    lastReplyAt: now - 1000 * 60 * 11,
    replyCount: 18,
  },
  {
    id: "d2",
    roomId: "lobby",
    title: "Rooms vs Channels: naming discussion",
    subtitle: "We’re using “Rooms” now to prep for Room Drops later.",
    authorName: "John Andy",
    createdAt: now - 1000 * 60 * 60 * 5,
    lastReplyAt: now - 1000 * 60 * 9,
    replyCount: 7,
  },
  {
    id: "a1",
    roomId: "announcements",
    title: "Update: Forums navigation is now Room-based",
    subtitle: "Rooms = channels (for now). Room Drops come later.",
    authorName: "Admin",
    createdAt: now - 1000 * 60 * 60 * 26,
    lastReplyAt: now - 1000 * 60 * 60 * 12,
    replyCount: 3,
  },
  {
    id: "c1",
    roomId: "casting",
    title: "Open call: extras for NYC street scene",
    subtitle: "Dates, wardrobe notes, signup link",
    authorName: "Casting",
    createdAt: now - 1000 * 60 * 80,
    lastReplyAt: now - 1000 * 60 * 7,
    replyCount: 22,
  },
  {
    id: "c2",
    roomId: "casting",
    title: "Self-tape format: slate + takes + file naming",
    subtitle: "Keeping submissions consistent",
    authorName: "John Andy",
    createdAt: now - 1000 * 60 * 60 * 3,
    lastReplyAt: now - 1000 * 60 * 2,
    replyCount: 11,
  },
  {
    id: "cr1",
    roomId: "crew",
    title: "Looking for a PA for a one-day interior shoot",
    subtitle: "Paid, food provided, Manhattan",
    authorName: "Prod Team",
    createdAt: now - 1000 * 60 * 60 * 9,
    lastReplyAt: now - 1000 * 60 * 35,
    replyCount: 5,
  },
  {
    id: "p1",
    roomId: "projects",
    title: "Work Desk → Projects page: UI layout brainstorm",
    subtitle: "Tile-based table + drop creator column",
    authorName: "John Andy",
    createdAt: now - 1000 * 60 * 60 * 30,
    lastReplyAt: now - 1000 * 60 * 60 * 4,
    replyCount: 9,
  },
  {
    id: "o1",
    roomId: "offtopic",
    title: "What’s everyone building this week?",
    subtitle: "Anything counts. Even half-finished ideas.",
    authorName: "Community",
    createdAt: now - 1000 * 60 * 60 * 50,
    lastReplyAt: now - 1000 * 60 * 60 * 48,
    replyCount: 4,
  },
];

export default function ForumsPage() {
  const [rooms, setRooms] = useState<ForumRoom[]>(SEED_ROOMS);
  const [drops, setDrops] = useState<ThreadDrop[]>(SEED_DROPS);

  const [roomQuery, setRoomQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [openDropId, setOpenDropId] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");

  // load last-used room safely
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

    const exists = !!saved && rooms.some((r) => r.id === saved);

    if (exists) {
      setSelectedRoomId(saved);
      return;
    }

    const fallback = rooms.find((r) => r.id === "lobby")?.id ?? rooms[0]?.id ?? null;
    setSelectedRoomId(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist selection
  useEffect(() => {
    if (!selectedRoomId) return;
    try {
      localStorage.setItem(STORAGE_KEY, selectedRoomId);
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
          const hay = `${d.title} ${d.subtitle ?? ""} ${d.authorName ?? ""}`.toLowerCase();
          return hay.includes(q);
        });

    return filtered.sort((a, b) => {
      const at = a.lastReplyAt ?? a.createdAt;
      const bt = b.lastReplyAt ?? b.createdAt;
      return bt - at;
    });
  }, [drops, selectedRoomId, dropQuery]);

  // keep room thread counts fresh (lightweight derived update)
  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => {
        const count = drops.filter((d) => d.roomId === r.id).length;
        return { ...r, threadCount: count };
      })
    );
  }, [drops]);

  function openCreate(roomId?: string) {
    if (roomId) setSelectedRoomId(roomId);
    setDraftTitle("");
    setDraftSubtitle("");
    setCreateOpen(true);
  }

  function submitCreate() {
    if (!selectedRoomId) return;
    const title = draftTitle.trim();
    if (!title) return;

    const newDrop: ThreadDrop = {
      id: uid("th"),
      roomId: selectedRoomId,
      title,
      subtitle: draftSubtitle.trim() || undefined,
      authorName: "You",
      createdAt: Date.now(),
      lastReplyAt: Date.now(),
      replyCount: 0,
    };

    setDrops((prev) => [newDrop, ...prev]);

    // bump room activity
    setRooms((prev) =>
      prev.map((r) =>
        r.id === selectedRoomId
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

  const openDrop = useMemo(() => {
    if (!openDropId) return null;
    return drops.find((d) => d.id === openDropId) ?? null;
  }, [drops, openDropId]);

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
            Rooms are what we’re calling channels for now. Later, we’ll evolve this into Room Drops.
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 md:col-span-4 lg:col-span-3">
            <RoomsPanel
              rooms={filteredRooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={(id) => {
                setSelectedRoomId(id);
                // Optional: clear search when switching rooms
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

      {/* Create Thread Drop Modal */}
      {createOpen && (
        <ModalShell title="Create Thread Drop" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              Room: <span className="text-white/90 font-semibold">{selectedRoom?.name ?? "Unknown"}</span>
            </div>

            <label className="block">
              <div className="mb-1 text-xs font-semibold text-white/60">Title</div>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Give this thread a clean title…"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                autoFocus
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-semibold text-white/60">Subtitle (optional)</div>
              <input
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                placeholder="Short purpose line (like a channel note)…"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
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
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:border-white/25 hover:bg-white/15"
              >
                Create
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Open Thread Drop Modal */}
      {openDropId && openDrop && (
        <ModalShell title="Thread Drop" onClose={() => setOpenDropId(null)}>
          <div className="space-y-2">
            <div className="text-lg font-semibold text-white/95">{openDrop.title}</div>
            {openDrop.subtitle && <div className="text-sm text-white/60">{openDrop.subtitle}</div>}
            <div className="pt-3 text-sm text-white/55">
              This is the thread view placeholder. Next step: replies, reactions, and “drop inside the drop.”
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpenDropId(null)}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:border-white/25 hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Minimal modal shell (no external deps) */
/* -------------------------------------------------------------------------- */

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
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Close modal overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-white/10 bg-[#0b0b18]/95 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white/90">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-white/70 hover:border-white/20 hover:bg-white/5"
            >
              ✕
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
