"use client";

import React from "react";
import type { Room, RoomLiveSession } from "@/lib/board/rooms";

export default function RoomLivePreview({
  room,
  session,
}: {
  room: Room;
  session: RoomLiveSession | null;
}) {
  if (!session || (session.status !== "live" && session.status !== "starting")) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-rose-300/25 bg-black/40 p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(500px 200px at 20% 0%, ${room.color}33, transparent 60%),
            linear-gradient(180deg, rgba(244,63,94,0.16), transparent 55%)`,
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-rose-50">
            <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_#fb7185]" />
            Live Room · {session.mode}
          </div>
          <span className="text-xs text-white/55">{session.viewerCount} watching</span>
        </div>
        <div className="mt-4 grid min-h-[160px] place-items-center rounded-[1.2rem] border border-white/10 bg-black/50">
          <div className="px-6 text-center">
            <div className="text-sm font-semibold text-white/85">Broadcast stage is wired, not streaming yet.</div>
            <p className="mt-2 text-xs leading-5 text-white/50">
              No livestream vendor is attached. Discussion stays open under this portal so a later LiveKit / Daily / Agora / WebRTC session can land here without changing the Room.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
