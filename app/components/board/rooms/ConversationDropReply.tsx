"use client";

import React from "react";
import ActivityCard from "@/app/components/board/ActivityCard";
import { activityFromRoomShare } from "@/lib/board/rooms";
import type { RoomConversationReply } from "@/lib/board/rooms";

export default function ConversationDropReply({
  reply,
  roomId,
  roomName,
  conversationTitle,
}: {
  reply: RoomConversationReply;
  roomId?: string;
  roomName?: string;
  conversationTitle?: string;
}) {
  if (reply.dropId && reply.dropSnapshot) {
    const activity = activityFromRoomShare({
      id: reply.id,
      roomId: roomId || String(reply.dropSnapshot.roomId || ""),
      dropId: reply.dropId,
      sharedBy: "",
      sharedByName: reply.authorName,
      snapshot: {
        ...reply.dropSnapshot,
        roomName: roomName || reply.dropSnapshot.roomName,
        conversationTitle: conversationTitle || reply.dropSnapshot.conversationTitle,
      },
      createdAt: reply.createdAt,
      origin: "conversation",
      conversationId: reply.threadId,
    });
    if (activity) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <div className="mb-2 flex justify-between gap-2 text-xs text-white/48">
            <span className="font-bold text-white/72">{reply.authorName}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/80">
              Drop
            </span>
          </div>
          <ActivityCard item={activity} compact roomScoped />
        </div>
      );
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
      <div className="flex justify-between gap-2 text-xs text-white/48">
        <span className="font-bold text-white/72">{reply.authorName}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/78">{reply.body}</p>
    </div>
  );
}
