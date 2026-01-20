"use client";

import React from "react";

export type ForumRoom = {
  id: string;
  name: string;
  subtitle?: string;
  color?: string;
  icon?: string;
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

export type ThreadDropPanelProps = {
  room: ForumRoom | null;
  drops: ThreadDrop[];

  query: string;
  onQueryChange: (q: string) => void;

  onCreateDrop?: (roomId: string) => void;
  onOpenDrop?: (dropId: string) => void;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ThreadDropPanel({
  room,
  drops,
  query,
  onQueryChange,
  onCreateDrop,
  onOpenDrop,
}: ThreadDropPanelProps) {
  const roomId = room?.id ?? "";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-lg"
              style={{
                boxShadow: room?.color ? `0 0 18px ${room.color}` : undefined,
              }}
            >
              {room?.icon ?? "🧵"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white/95">
                {room?.name ?? "Select a room"}
              </div>
              {room?.subtitle && (
                <div className="truncate text-sm text-white/55">
                  {room.subtitle}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search threads in this room"
            className={clsx(
              "w-64 max-w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2",
              "text-sm text-white placeholder:text-white/35",
              "outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
            )}
          />

          <button
            type="button"
            disabled={!roomId}
            onClick={() => roomId && onCreateDrop?.(roomId)}
            className={clsx(
              "rounded-xl border px-3 py-2 text-sm font-semibold transition",
              roomId
                ? "border-white/15 bg-white/10 text-white/90 hover:border-white/25 hover:bg-white/15"
                : "border-white/10 bg-black/20 text-white/40"
            )}
          >
            + Create Thread
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(drops ?? []).map((d) => {
          const stamp = timeAgo(d.lastReplyAt ?? d.createdAt);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpenDrop?.(d.id)}
              className={clsx(
                "group w-full rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition",
                "hover:border-white/20 hover:bg-white/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-white/90">
                    {d.title}
                  </div>
                  {d.subtitle && (
                    <div className="mt-1 line-clamp-2 text-sm text-white/55">
                      {d.subtitle}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/45">
                    <span>{d.authorName ?? "Unknown"}</span>
                    <span className="opacity-60">•</span>
                    <span>{stamp}</span>
                    <span className="opacity-60">•</span>
                    <span>{d.replyCount ?? 0} replies</span>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/60">
                  Open
                </div>
              </div>
            </button>
          );
        })}

        {room && (drops ?? []).length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <div className="text-base font-semibold text-white/85">
              This room is quiet.
            </div>
            <div className="mt-1 text-sm text-white/55">
              Create the first thread drop and set the tone.
            </div>
            <button
              type="button"
              onClick={() => roomId && onCreateDrop?.(roomId)}
              className="mt-4 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:border-white/25 hover:bg-white/15"
            >
              + Create Thread
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
