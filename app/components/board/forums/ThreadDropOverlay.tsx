"use client";

import React, { useEffect, useState } from "react";
import type { ThreadDrop, ThreadAuthor } from "./ThreadDropTile";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function authorName(a: ThreadAuthor) {
  return typeof a === "string" ? a : a?.name ?? "Unknown";
}

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ThreadDropOverlay({
  thread,
  onClose,
  onAddReply,
}: {
  thread: ThreadDrop;
  onClose: () => void;
  onAddReply: (threadId: string, replyText: string) => void;
}) {
  const [text, setText] = useState("");

  const replies = thread.replies ?? [];
  const canPost = text.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      <div className="absolute inset-0 p-4 sm:p-6 md:p-8">
        <div
          className={clsx(
            "relative h-full w-full rounded-3xl border border-white/10",
            "bg-gradient-to-b from-white/10 to-black/30 backdrop-blur-xl",
            "shadow-2xl overflow-hidden"
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-pink-400/80">
                {thread.channel ?? "Forum"}
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold text-white">
                {thread.title}
              </h2>
              <div className="mt-1 text-xs text-white/50">
                by {authorName(thread.author)} · updated {formatTime(thread.updatedAt)}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Close ✕
            </button>
          </div>

          <div className="grid h-[calc(100%-64px)] grid-rows-[1fr_auto]">
            <div className="overflow-auto p-5">
              {thread.description && (
                <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                  {thread.description}
                </div>
              )}

              <div className="space-y-3">
                {replies.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    No replies yet. Be the first voice in this room.
                  </div>
                ) : (
                  replies.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>{authorName(r.author)}</span>
                        <span>{formatTime(r.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">
                        {r.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-white/10 p-4">
              <div className="flex gap-3">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write a reply…"
                  className={clsx(
                    "flex-1 rounded-xl border border-white/10 bg-black/30",
                    "px-4 py-3 text-sm text-white placeholder:text-white/40",
                    "outline-none focus:border-pink-400/40"
                  )}
                />
                <button
                  type="button"
                  disabled={!canPost}
                  onClick={() => {
                    const v = text.trim();
                    if (!v) return;
                    onAddReply(thread.id, v);
                    setText("");
                  }}
                  className={clsx(
                    "rounded-xl px-4 py-3 text-sm font-semibold",
                    canPost
                      ? "bg-pink-500/80 text-white hover:bg-pink-500"
                      : "cursor-not-allowed bg-white/10 text-white/40"
                  )}
                >
                  Reply
                </button>
              </div>

              <div className="mt-2 text-xs text-white/40">
                Press <span className="text-white/60">Esc</span> to close.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}