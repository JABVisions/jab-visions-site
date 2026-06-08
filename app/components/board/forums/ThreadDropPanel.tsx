"use client";

import React from "react";

type ThreadDropPrivacy = "public" | "private" | "work" | "invite-only";
type ThreadDropMood = "quiet" | "active" | "urgent" | "dreaming" | "locked";

export type ForumRoom = {
  id: string;
  name: string;
  subtitle?: string;
  color?: string;
  icon?: string;
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

function fmtDateTime(value: string) {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return "just now";
  return new Date(parsed).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
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

function moodClass(mood?: ThreadDropMood) {
  switch (mood) {
    case "urgent":
      return "border-rose-300/25 bg-rose-300/12 text-rose-100";
    case "dreaming":
      return "border-violet-300/25 bg-violet-300/12 text-violet-100";
    case "locked":
      return "border-slate-200/20 bg-slate-200/10 text-slate-100";
    case "quiet":
      return "border-cyan-200/18 bg-cyan-200/8 text-cyan-100";
    case "active":
    default:
      return "border-emerald-200/22 bg-emerald-200/10 text-emerald-100";
  }
}

function glowShadow(color?: string) {
  const c = color ?? "rgba(167,139,250,0.35)";
  return `0 0 0 1px rgba(255,255,255,0.06), 0 0 34px ${c}44`;
}

function Badge({
  children,
  dark,
  className,
}: {
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "text-[11px] font-extrabold uppercase tracking-[0.14em]",
        dark
          ? "border-emerald-200/20 bg-emerald-200/12 text-emerald-50"
          : "border-white/10 bg-white/8 text-white/66",
        className
      )}
    >
      {children}
    </span>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur">
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

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search threads in this room"
            className={clsx(
              "w-64 max-w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2",
              "text-sm text-white placeholder:text-white/35",
              "outline-none focus:border-emerald-300/30 focus:ring-2 focus:ring-emerald-300/10"
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
        {(drops ?? []).map((drop) => (
          <ThreadDropTile
            key={drop.id}
            drop={drop}
            roomColor={roomColor}
            onOpen={() => onOpenDrop?.(drop.id)}
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
  const replies = drop.replies.length;
  const postedLabel = fmtDateTime(drop.createdAt);

  return (
    <article
      className={clsx(
        "group relative w-full overflow-hidden rounded-3xl border border-white/10 text-left",
        "bg-black/24 transition",
        "hover:border-white/20 hover:bg-white/[0.06]"
      )}
      style={{ boxShadow: glowShadow(roomColor) }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-65"
        style={{
          background: roomColor
            ? `radial-gradient(700px 220px at 20% 0%, ${roomColor}33, transparent 60%),
               radial-gradient(700px 220px at 82% 100%, rgba(52,211,153,0.12), transparent 68%),
               linear-gradient(135deg, rgba(255,255,255,0.055), transparent 48%)`
            : `radial-gradient(700px 220px at 20% 0%, rgba(167,139,250,0.20), transparent 60%),
               radial-gradient(700px 220px at 80% 100%, rgba(244,114,182,0.12), transparent 65%)`,
        }}
      />

      <div
        className="pointer-events-none absolute left-0 top-0 h-full w-[6px] opacity-70"
        style={{ background: roomColor ?? "rgba(167,139,250,0.6)" }}
      />

      <div className="pointer-events-none absolute right-4 top-4 h-14 w-14 rounded-full border border-white/10 bg-white/[0.035] opacity-80 shadow-[0_0_32px_rgba(255,255,255,0.08)]" />

      <div className="relative p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge dark>Thread Drop</Badge>
          <Badge className={moodClass(drop.mood)}>{drop.mood ?? "active"}</Badge>
          <span className="text-[12px] font-semibold text-white/64">{postedLabel}</span>
        </div>

        <div className="mt-3 text-base font-extrabold tracking-[0.02em] text-emerald-300/95">
          {drop.title}
        </div>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/68">
          {drop.body}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{replies} {replies === 1 ? "reply" : "replies"}</Badge>
            <Badge>{privacyLabel(drop.privacy)}</Badge>
            <Badge>by {drop.authorName}</Badge>
          </div>

          <button
            type="button"
            onClick={onOpen}
            className={clsx(
              "rounded-full border border-emerald-200/24 bg-emerald-200/12 px-4 py-2",
              "text-[12px] font-black uppercase tracking-[0.14em] text-emerald-50",
              "transition hover:bg-emerald-200/18 hover:shadow-[0_0_22px_rgba(52,211,153,0.20)]"
            )}
          >
            Open
          </button>
        </div>
      </div>
    </article>
  );
}
