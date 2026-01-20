"use client";

import React, { useMemo } from "react";

type RoomActivityTag = "new" | "hot" | "quiet";

export type ForumRoom = {
  id: string;
  name: string;
  subtitle?: string; // purpose line (channel description)
  color?: string;
  icon?: string;
  isPinned?: boolean;
  sortOrder?: number;
  threadCount?: number;
  unreadCount?: number;
  activityTag?: RoomActivityTag;
  lastActivityAt?: number;
};

export type RoomsPanelProps = {
  rooms: ForumRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;

  query: string;
  onQueryChange: (q: string) => void;

  showPinned?: boolean;
  showCounts?: boolean;
  showUnread?: boolean;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function tagLabel(tag?: RoomActivityTag) {
  if (!tag) return null;
  if (tag === "new") return "New";
  if (tag === "hot") return "Hot";
  return "Quiet";
}

export default function RoomsPanel({
  rooms,
  selectedRoomId,
  onSelectRoom,
  query,
  onQueryChange,
  showPinned = true,
  showCounts = true,
  showUnread = true,
}: RoomsPanelProps) {
  const { pinned, rest } = useMemo(() => {
    const p = showPinned ? rooms.filter((r) => r.isPinned) : [];
    const r = showPinned ? rooms.filter((r) => !r.isPinned) : rooms;
    return { pinned: p, rest: r };
  }, [rooms, showPinned]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold tracking-wide text-white/90">
          Rooms
        </div>
        <div className="text-xs text-white/40">{rooms.length}</div>
      </div>

      <div className="mt-3">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search rooms"
          className={clsx(
            "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2",
            "text-sm text-white placeholder:text-white/35",
            "outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
          )}
        />
      </div>

      {pinned.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">
            Pinned
          </div>
          <div className="space-y-2">
            {pinned.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                active={room.id === selectedRoomId}
                onClick={() => onSelectRoom(room.id)}
                showCounts={showCounts}
                showUnread={showUnread}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {pinned.length > 0 && (
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">
            All Rooms
          </div>
        )}

        <div className="space-y-2">
          {rest.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              active={room.id === selectedRoomId}
              onClick={() => onSelectRoom(room.id)}
              showCounts={showCounts}
              showUnread={showUnread}
            />
          ))}

          {rooms.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
              No rooms found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomRow({
  room,
  active,
  onClick,
  showCounts,
  showUnread,
}: {
  room: ForumRoom;
  active: boolean;
  onClick: () => void;
  showCounts: boolean;
  showUnread: boolean;
}) {
  const label = tagLabel(room.activityTag);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group w-full rounded-2xl border p-3 text-left transition",
        active
          ? "border-white/25 bg-white/10"
          : "border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 h-10 w-10 shrink-0 rounded-2xl border border-white/10 bg-black/30"
          style={{
            boxShadow: active
              ? `0 0 0 1px rgba(255,255,255,0.12), 0 0 20px ${
                  room.color ?? "rgba(167,139,250,0.35)"
                }`
              : undefined,
          }}
        >
          <div className="flex h-full w-full items-center justify-center text-lg">
            {room.icon ?? "◈"}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-white/90">
              {room.name}
            </div>

            {label && (
              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  room.activityTag === "quiet"
                    ? "border-white/10 bg-black/20 text-white/60"
                    : "border-white/15 bg-white/10 text-white/85"
                )}
              >
                {label}
              </span>
            )}

            {showUnread && (room.unreadCount ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                {room.unreadCount}
              </span>
            )}
          </div>

          {room.subtitle && (
            <div className="mt-1 line-clamp-2 text-xs text-white/55">
              {room.subtitle}
            </div>
          )}

          {showCounts && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: room.color ?? "rgba(167,139,250,0.8)",
                  }}
                />
                {room.threadCount ?? 0} threads
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
