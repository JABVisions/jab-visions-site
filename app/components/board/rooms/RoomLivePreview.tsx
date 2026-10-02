"use client";

import React from "react";
import type { Room, RoomLiveSession } from "@/lib/board/rooms";
import { isActiveLiveSession } from "@/lib/board/rooms/liveWebRtc";
import RoomLiveStage from "./RoomLiveStage";

export default function RoomLivePreview({
  room,
  session,
  userId,
  displayName,
  onSessionChange,
  onFailed,
  onEnded,
}: {
  room: Room;
  session: RoomLiveSession | null;
  userId?: string | null;
  displayName?: string;
  onSessionChange?: (session: RoomLiveSession) => void;
  onFailed?: (message: string) => void;
  onEnded?: () => void;
}) {
  if (!isActiveLiveSession(session)) return null;
  if (!userId) {
    return (
      <section className="rounded-[1.5rem] border border-rose-300/25 bg-black/40 p-4 text-sm text-white/70">
        {room.name} is Live. Join the Room to watch the stage.
      </section>
    );
  }

  return (
    <RoomLiveStage
      room={room}
      session={session}
      userId={userId}
      displayName={displayName}
      onSessionChange={onSessionChange}
      onFailed={onFailed}
      onEnded={onEnded}
    />
  );
}
