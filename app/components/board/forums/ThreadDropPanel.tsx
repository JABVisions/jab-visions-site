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

type Props = {
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

function fmtDateTime(ts: number) {
  try {
    const d = new Date(ts);
    // Matches your feed vibe: 1/10/2026, 1:34:46 PM
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function glowShadow(color?: string) {
  const c = color ?? "rgba(167,139,250,0.35)";
  return `0 0 0 1px rgba(255,255,255,0.06), 0 0 28px ${c}`;
}

function Badge({
  children,
  ghost,
  dark,
}: {
  children: React.ReactNode;
  ghost?: boolean;
  dark?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "text-[11px] font-extrabold uppercase tracking-[0.14em]",
        dark
          ? "border-black/30 bg-black/85 text-white/90"
          : ghost
            ? "border-black/10 bg-white/50 text-black/50"
            : "border-black/10 bg-white/70 text-black/65"
      )}
    >
      {children}
    </span>
  );
}

function ActionPill({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex items-center justify-center rounded-full border px-3 py-2",
        "text-[12px] font-extrabold uppercase tracking-[0.10em]",
        "border-black/10 bg-white/70 text-black/65",
        "hover:bg-white/80 hover:text-black/75 transition"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export default function ThreadDropPanel({
  room,
  drops,
  query,
  onQueryChange,
  onCreateDrop,
  onOpenDrop,
}: Props) {
  const roomId = room?.id ?? "";
  const roomColor = room?.color;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-lg"
              style={{ boxShadow: roomColor ? `0 0 18px ${roomColor}` : undefined }}
            >
              {room?.icon ?? "🧵"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white/95">
                {room?.name ?? "Select a room"}
              </div>
              {room?.subtitle && (
                <div className="truncate text-sm text-white/55">{room.subtitle}</div>
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

      {/* drop list */}
      <div className="mt-4 space-y-3">
        {(drops ?? []).map((d) => (
          <ThreadDropTile
            key={d.id}
            drop={d}
            roomColor={roomColor}
            onOpen={() => onOpenDrop?.(d.id)}
          />
        ))}

        {room && (drops ?? []).length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <div className="text-base font-semibold text-white/85">This room is quiet.</div>
            <div className="mt-1 text-sm text-white/55">
              Create the first Thread Drop and set the tone.
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

function ThreadDropTile({
  drop,
  roomColor,
  onOpen,
}: {
  drop: ThreadDrop;
  roomColor?: string;
  onOpen: () => void;
}) {
  const replies = drop.replyCount ?? 0;

  // Use createdAt for “posted” time, but keep lastReplyAt available for later if you want “last active”
  const postedAt = drop.createdAt;
  const postedLabel = fmtDateTime(postedAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        "group relative w-full overflow-hidden rounded-3xl border border-white/10 text-left",
        "bg-black/20 transition",
        "hover:border-white/20 hover:bg-white/[0.06]"
      )}
      style={{ boxShadow: glowShadow(roomColor) }}
    >
      {/* aura wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: roomColor
            ? `radial-gradient(700px 220px at 20% 0%, ${roomColor}33, transparent 60%),
               radial-gradient(700px 220px at 80% 100%, ${roomColor}22, transparent 65%)`
            : `radial-gradient(700px 220px at 20% 0%, rgba(167,139,250,0.20), transparent 60%),
               radial-gradient(700px 220px at 80% 100%, rgba(244,114,182,0.12), transparent 65%)`,
        }}
      />

      {/* left drop spine */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-full w-[6px] opacity-70"
        style={{ background: roomColor ?? "rgba(167,139,250,0.6)" }}
      />

      <div className="relative p-4">
        {/* ✅ NEW: pill ABOVE title + date/time next to it (small white) */}
        <div className="flex items-center gap-3">
          <Badge dark>THREAD</Badge>
          <span className="text-[12px] font-semibold text-white/70">
            {postedLabel}
          </span>
        </div>

        {/* title */}
        <div className="mt-3 font-extrabold tracking-[0.02em] text-emerald-300/95">
          {drop.title}
        </div>

        {/* subtitle (optional) */}
        {drop.subtitle ? (
          <div className="mt-1 line-clamp-2 text-sm text-white/60">{drop.subtitle}</div>
        ) : null}

        {/* badges + actions row (stays like your drop tile layout) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge ghost>{replies} REPLIES</Badge>
            {drop.authorName ? <Badge ghost>{drop.authorName.toUpperCase()}</Badge> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <ActionPill>OPEN</ActionPill>
          </div>
        </div>
      </div>

      {/* subtle sheen */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-0 bg-white/[0.04]" />
        <div
          className="absolute -top-10 left-1/2 h-24 w-[120%] -translate-x-1/2 rotate-[-6deg]"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)",
          }}
        />
      </div>
    </button>
  );
}
