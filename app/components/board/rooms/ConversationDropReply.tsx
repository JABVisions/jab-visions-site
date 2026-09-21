"use client";

import React from "react";
import ActivityCard from "@/app/components/board/ActivityCard";
import RoomMemberOrb from "./RoomMemberOrb";
import { activityFromRoomShare } from "@/lib/board/rooms";
import type { RoomConversationReply } from "@/lib/board/rooms";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";

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
  const authorName = pickBoardDisplayName(reply.authorName) || reply.authorName || "Board";
  if (reply.dropId && reply.dropSnapshot) {
    const activity = activityFromRoomShare({
      id: reply.id,
      roomId: roomId || String(reply.dropSnapshot.roomId || ""),
      dropId: reply.dropId,
      sharedBy: "",
      sharedByName: authorName,
      snapshot: {
        ...reply.dropSnapshot,
        roomName: roomName || reply.dropSnapshot.roomName,
        conversationTitle: conversationTitle || reply.dropSnapshot.conversationTitle,
        authorAvatar: reply.authorAvatar || reply.dropSnapshot.authorAvatar,
        authorName,
      },
      createdAt: reply.createdAt,
      origin: "conversation",
      conversationId: reply.threadId,
    });
    if (activity) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/48">
            <span className="inline-flex items-center gap-2 font-bold text-white/72">
              <RoomMemberOrb name={authorName} avatarUrl={reply.authorAvatar} size={22} />
              {authorName}
            </span>
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
      <div className="flex items-center justify-between gap-2 text-xs text-white/48">
        <span className="inline-flex items-center gap-2 font-bold text-white/72">
          <RoomMemberOrb name={authorName} avatarUrl={reply.authorAvatar} size={22} />
          {authorName}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/78">{reply.body}</p>
    </div>
  );
}
