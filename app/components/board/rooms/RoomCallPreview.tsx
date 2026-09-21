"use client";

import React from "react";
import type { Room, RoomCallSession } from "@/lib/board/rooms";

export default function RoomCallPreview({
  room,
  session,
}: {
  room: Room;
  session: RoomCallSession | null;
}) {
  if (!session || (session.status !== "live" && session.status !== "starting")) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-black/35 p-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(420px 180px at 80% 0%, ${room.color}22, transparent 62%)`,
        }}
      />
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50">
          Room Call
        </div>
        <p className="mt-3 text-sm text-white/70">
          Small-group call is open as a placeholder. Everyone in the Room can speak once a provider is connected. Media is not live yet.
        </p>
        <div className="mt-3 text-xs text-white/45">
          {session.participantIds.length || 1} in the call · provider {session.provider}
        </div>
      </div>
    </section>
  );
}
