"use client";

import React from "react";
import type { Room, RoomCallSession } from "@/lib/board/rooms";
import { isActiveCallSession, isCallParticipant, joinCallBlockedReason } from "@/lib/board/rooms/liveWebRtc";
import RoomCallStage from "./RoomCallStage";

export default function RoomCallPreview({
  room,
  session,
  userId,
  displayName,
  onJoin,
  onSessionChange,
  onFailed,
  onEnded,
}: {
  room: Room;
  session: RoomCallSession | null;
  userId?: string | null;
  displayName?: string;
  onJoin?: () => void;
  onSessionChange?: (session: RoomCallSession) => void;
  onFailed?: (message: string) => void;
  onEnded?: () => void;
}) {
  if (!isActiveCallSession(session)) return null;

  if (!userId) {
    return (
      <section className="relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-black/35 p-4 text-sm text-white/70">
        A Room Call is open in {room.name}. Join the Room to speak.
      </section>
    );
  }

  if (session.status === "starting" && isCallParticipant(session, userId)) {
    return (
      <section className="relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-black/35 p-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50">
          Room Call
        </div>
        <p className="mt-3 text-sm text-white/70">Starting the Room Call…</p>
      </section>
    );
  }

  if (!isCallParticipant(session, userId)) {
    const blocked = joinCallBlockedReason(session, userId);
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
            Small-group call is open. Camera and mic go live when you join — up to 6 people can speak.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/45">
              {session.participantIds.length || 1} in the call · WebRTC
            </span>
            <button
              type="button"
              onClick={onJoin}
              disabled={Boolean(blocked) || !onJoin}
              title={blocked || "Join this Room Call"}
              className="rounded-full border border-cyan-200/25 bg-cyan-300/12 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-50 disabled:opacity-40"
            >
              Join Call
            </button>
          </div>
          {blocked ? <div className="mt-2 text-xs text-rose-200">{blocked}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <RoomCallStage
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
