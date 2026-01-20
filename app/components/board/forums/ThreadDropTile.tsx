"use client";

import React from "react";
import ReactionsBar, {
  type ReactionKey,
  type ReactionsMap,
} from "@/app/components/board/forums/ReactionsBar";

/* -------------------------------------------------------------------------- */
/* Types */
/* -------------------------------------------------------------------------- */

export type ThreadAuthor =
  | string
  | {
      name: string;
      avatar?: string | null;
    };

export type ThreadReply = {
  id: string;
  author: ThreadAuthor;
  text: string;
  createdAt: number;
};

export type ThreadState = "new" | "active" | "quiet";

export type ThreadDrop = {
  id: string;
  title: string;
  channel?: string;
  description?: string;
  author: ThreadAuthor;

  replies?: ThreadReply[];
  tags?: string[];
  state?: ThreadState;
  reactions?: ReactionsMap;

  createdAt: number;
  updatedAt: number;
};

/* -------------------------------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------------------------------- */

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function authorName(a: ThreadAuthor) {
  return typeof a === "string" ? a : a?.name ?? "Unknown";
}

function safeRepliesCount(replies?: ThreadReply[]) {
  return Array.isArray(replies) ? replies.length : 0;
}

function safeTags(tags?: string[]) {
  return Array.isArray(tags) ? tags.filter(Boolean).slice(0, 8) : [];
}

function formatTime(ts: number) {
  if (!Number.isFinite(ts)) return "just now";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* -------------------------------------------------------------------------- */
/* Pill system – matches Feed drops */
/* -------------------------------------------------------------------------- */

function pillBase(extra?: string) {
  return clsx(
    "inline-flex items-center rounded-full px-3 py-1",
    "text-[11px] font-semibold tracking-wide",
    "shadow-sm",
    extra
  );
}

function statePill(state: ThreadState) {
  if (state === "active")
    return pillBase("bg-emerald-200/80 text-emerald-900");

  if (state === "new")
    return pillBase("bg-pink-200/80 text-pink-900");

  return pillBase("bg-black/10 text-black/50");
}

/* -------------------------------------------------------------------------- */
/* Component */
/* -------------------------------------------------------------------------- */

export default function ThreadDropTile({
  thread,
  onOpen,
  onReact,
}: {
  thread: ThreadDrop;
  onOpen: (t: ThreadDrop) => void;
  onReact: (threadId: string, key: ReactionKey) => void;
}) {
  const repliesCount = safeRepliesCount(thread.replies);
  const tags = safeTags(thread.tags);
  const state: ThreadState = thread.state ?? "new";

  return (
    <button
      type="button"
      onClick={() => onOpen(thread)}
      className={clsx(
        "group w-full text-left rounded-3xl",
        "border border-black/10 bg-white/70",
        "shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
        "px-6 py-5",
        "hover:bg-white hover:border-black/15 transition"
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header – Feed-style pills */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* THREAD – primary dark pill */}
          <span className={pillBase("bg-emerald-800 text-white")}>
            THREAD
          </span>

          {/* Channel – HYPE-style */}
          {thread.channel && (
            <span className={pillBase("bg-yellow-200/80 text-black/70")}>
              {thread.channel}
            </span>
          )}

          {/* State */}
          <span className={statePill(state)}>{state}</span>
        </div>

        {/* Right-side actions (PIN / OPEN language) */}
        <div className="flex items-center gap-2">
          <span className={pillBase("bg-white/60 text-black/50")}>
            {formatTime(thread.updatedAt)}
          </span>

          <span
            className={clsx(
              pillBase("bg-pink-500 text-white"),
              "opacity-0 group-hover:opacity-100 transition"
            )}
          >
            OPEN
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Title + description */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-emerald-700">
          {thread.title}
        </h3>

        {thread.description && (
          <p className="mt-2 text-sm text-black/70 whitespace-pre-wrap">
            {thread.description}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Meta */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-black/60">
            {repliesCount} {repliesCount === 1 ? "reply" : "replies"}
          </span>
          <span className="text-black/30">•</span>
          <span className="text-black/50">by {authorName(thread.author)}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Reactions */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4">
        <ReactionsBar
          reactions={
            thread.reactions ?? {
              heart: 0,
              pleased: 0,
              funny: 0,
              omg: 0,
              angry: 0,
              aww: 0,
            }
          }
          onReact={(key) => onReact(thread.id, key)}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tags */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(tags.length ? tags : ["thread"]).map((t) => (
          <span
            key={t}
            className={pillBase("bg-white/60 text-black/60")}
          >
            #{t}
          </span>
        ))}
      </div>
    </button>
  );
}
