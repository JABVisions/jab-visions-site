"use client";

import React from "react";
import ActivityCard from "@/app/components/board/ActivityCard";
import { activityFromRoomShare, type RoomDropShare } from "@/lib/board/rooms";

export default function RoomDropCard({
  share,
  onRemove,
  canRemove,
}: {
  share: RoomDropShare;
  onRemove?: (dropId: string) => void;
  canRemove?: boolean;
}) {
  const activity = activityFromRoomShare(share);
  if (!activity) return null;

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/80">
        <span>{share.origin === "create" ? "Room Drop" : "Shared Drop"}</span>
      </div>
      <ActivityCard item={activity} compact roomScoped onRemove={canRemove ? onRemove : undefined} />
    </div>
  );
}
