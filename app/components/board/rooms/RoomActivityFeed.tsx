"use client";

import React from "react";
import type { RoomFeedItem } from "@/lib/board/rooms";
import { canRemoveFromRoom } from "@/lib/board/forumRoomDrop";
import RoomDropCard from "./RoomDropCard";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatTime(value: number) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RoomActivityFeed({
  items,
  color,
  onOpenConversation,
  onRemoveShare,
  userId,
  canModerate,
}: {
  items: RoomFeedItem[];
  color?: string;
  onOpenConversation?: (id: string) => void;
  onRemoveShare?: (dropId: string) => void;
  userId?: string | null;
  canModerate?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
        <div className="text-base font-semibold text-white/85">This room is holding a quiet pulse.</div>
        <p className="mt-1 text-sm text-white/50">
          Conversations, Room Drops, and future Live activity will gather here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "drop_share" && item.share) {
          return (
            <RoomDropCard
              key={item.id}
              share={item.share}
              onRemove={onRemoveShare}
              canRemove={canRemoveFromRoom({
                share: item.share,
                userId,
                moderate: canModerate,
              })}
            />
          );
        }

        const conversationDropPointer = item.kind === "reply" && item.id.startsWith("conversation_drop:");

        return (
          <article
            key={item.id}
            className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30 p-4"
            style={{ boxShadow: color ? `0 0 28px ${color}22` : undefined }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                  item.kind === "live"
                    ? "border-rose-300/30 bg-rose-400/15 text-rose-100"
                    : item.kind === "call"
                      ? "border-cyan-200/25 bg-cyan-300/12 text-cyan-50"
                      : item.kind === "announcement"
                        ? "border-amber-200/30 bg-amber-300/12 text-amber-50"
                        : conversationDropPointer
                          ? "border-emerald-200/25 bg-emerald-300/12 text-emerald-50"
                          : "border-white/10 bg-white/8 text-white/70"
                )}
              >
                {conversationDropPointer ? "Conversation Drop" : item.kind.replace("_", " ")}
              </span>
              {item.pinned ? (
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                  Pinned
                </span>
              ) : null}
              <span className="text-[11px] text-white/45">{formatTime(item.createdAt)}</span>
            </div>
            {item.title ? <h3 className="mt-3 text-base font-semibold text-white">{item.title}</h3> : null}
            {item.body ? (
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-white/65">{item.body}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
              <span>{item.authorName || "Board"}</span>
              {item.conversation ? (
                <button
                  type="button"
                  onClick={() => onOpenConversation?.(item.conversation!.id)}
                  className="rounded-full border border-emerald-200/25 bg-emerald-300/12 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-50"
                >
                  Open
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
