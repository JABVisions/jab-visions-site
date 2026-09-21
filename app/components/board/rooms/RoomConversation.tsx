"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Room, RoomConversation } from "@/lib/board/rooms";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomConversation({
  room,
  thread,
  onClose,
  onSend,
}: {
  room: Room;
  thread: RoomConversation;
  onClose: () => void;
  onSend: (threadId: string, body: string) => void;
}) {
  const [signal, setSignal] = useState("");
  const [mounted, setMounted] = useState(false);
  const canSend = signal.trim().length > 0;

  useEffect(() => setMounted(true), []);
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
      <button type="button" aria-label="Leave conversation" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="absolute inset-x-0 bottom-[calc(104px+env(safe-area-inset-bottom))] top-[104px] overflow-y-auto px-3 py-3 sm:top-[112px] sm:px-5">
        <section className="relative mx-auto grid min-h-[min(640px,calc(100vh-244px))] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#071016]/92 shadow-[0_28px_110px_rgba(0,0,0,0.78)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(760px 360px at 20% 0%, ${room.color}33, transparent 62%)`,
            }}
          />
          <header className="relative border-b border-white/10 px-4 py-4 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
                    Conversation
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                    {room.name}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{thread.title}</h2>
                <div className="mt-2 text-xs text-white/55">Opened by {thread.authorName}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80"
              >
                Back to Room
              </button>
            </div>
          </header>
          <div className="relative min-h-0 overflow-auto px-4 py-4 sm:px-7">
            <article className="rounded-3xl border border-white/10 bg-black/24 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/70">Original Signal</div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/82">{thread.body}</p>
            </article>
            <section className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">Replies</div>
              <div className="mt-4 space-y-3">
                {thread.replies.length ? (
                  thread.replies.map((reply) => (
                    <div key={reply.id} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                      <div className="flex justify-between gap-2 text-xs text-white/48">
                        <span className="font-bold text-white/72">{reply.authorName}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/78">{reply.body}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
                    No replies yet. Be the first voice in this conversation.
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="relative border-t border-white/10 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={signal}
                onChange={(e) => setSignal(e.target.value)}
                placeholder="Reply in this conversation..."
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={() => {
                  const text = signal.trim();
                  if (!text) return;
                  onSend(thread.id, text);
                  setSignal("");
                }}
                className={clsx(
                  "rounded-2xl border px-5 py-3 text-sm font-black uppercase tracking-[0.14em]",
                  canSend
                    ? "border-emerald-200/30 bg-emerald-300/16 text-emerald-50"
                    : "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                )}
              >
                Send
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>,
    document.body
  );
}
