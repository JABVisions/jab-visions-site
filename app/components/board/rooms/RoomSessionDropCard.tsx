"use client";

import React from "react";
import type { RoomCallSession, RoomLiveSession, RoomPresence as RoomPresencePerson } from "@/lib/board/rooms";
import RoomMediaSession from "./RoomMediaSession";
import RoomMemberOrb from "./RoomMemberOrb";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomSessionDropCard({
  session,
  people,
}: {
  session: RoomCallSession | RoomLiveSession;
  people?: RoomPresencePerson[];
}) {
  const isLive = session.kind === "live";
  const host = (people || []).find((person) => person.userId === session.startedBy) || null;
  const ended = session.status === "ended";
  const active = !ended && (session.status === "live" || session.status === "starting");

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[1.5rem] border",
        isLive ? "border-rose-300/30" : "border-cyan-300/25"
      )}
      style={{
        boxShadow: active ? `0 0 32px ${isLive ? "#fb718533" : "#67e8f933"}` : undefined,
      }}
    >
      <div
        className={clsx(
          "flex items-center justify-between gap-2 border-b px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em]",
          isLive ? "border-rose-300/20 bg-rose-400/10 text-rose-100" : "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
        )}
      >
        <span className="inline-flex items-center gap-2">
          {active ? (
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                isLive ? "bg-rose-400 shadow-[0_0_10px_#fb7185]" : "bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
              )}
            />
          ) : null}
          {isLive ? "Live Drop" : "Call Drop"}
        </span>
        {isLive ? <span className="normal-case tracking-normal">{session.viewerCount} watching</span> : null}
      </div>
      <div className="bg-black/30 p-4">
        <div className="flex items-center gap-2">
          <RoomMemberOrb name={host?.displayName || "Someone"} avatarUrl={host?.avatarUrl} size={28} glow={isLive ? "#fb7185" : "#67e8f9"} />
          <div className="text-sm font-semibold text-white/85">
            {host?.displayName || "Someone"} {isLive ? "is live" : "started a call"}
          </div>
        </div>

        {active && session.provider === "livekit" ? (
          <RoomMediaSession roomId={session.roomId} session={session} />
        ) : (
          <div className="mt-4 grid min-h-[120px] place-items-center rounded-[1.2rem] border border-white/10 bg-black/50">
            <div className="px-6 text-center text-sm font-semibold text-white/60">
              {ended ? "This session has ended." : "Preparing broadcast stage…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
