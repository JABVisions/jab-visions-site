"use client";

import Link from "next/link";
import React from "react";
import type { Room, RoomPermissions } from "@/lib/board/rooms";
import OfficialRoomBadge from "./OfficialRoomBadge";
import RoomPresence from "./RoomPresence";
import type { RoomPresence as RoomPresencePerson } from "@/lib/board/rooms";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomHeader({
  room,
  people,
  joined,
  following,
  permissions,
  onJoin,
  onFollow,
  onStartCall,
  onGoLive,
}: {
  room: Room;
  people: RoomPresencePerson[];
  joined?: boolean;
  following?: boolean;
  permissions: RoomPermissions;
  onJoin?: () => void;
  onFollow?: () => void;
  onStartCall?: () => void;
  onGoLive?: () => void;
}) {
  const live = room.state === "LIVE" || room.state === "STAGE";

  return (
    <header className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(720px 280px at 12% 0%, ${room.color}40, transparent 60%),
            radial-gradient(520px 240px at 92% 10%, ${room.accent}28, transparent 68%)`,
        }}
      />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/board/forums"
            className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white/70 hover:border-white/25"
          >
            ← Forums
          </Link>
          <span
            className={clsx(
              "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
              live
                ? "border-rose-300/30 bg-rose-400/15 text-rose-100"
                : "border-white/12 bg-white/8 text-white/70"
            )}
          >
            {room.state}
          </span>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div
            className="grid h-16 w-16 place-items-center rounded-[1.3rem] border border-white/15 bg-black/35 text-3xl"
            style={{ boxShadow: `0 0 28px ${room.color}` }}
          >
            {room.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{room.name}</h1>
              {room.isOfficial ? <OfficialRoomBadge comingSoon={room.comingSoon} /> : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{room.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {room.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/55">{room.memberCount} members</div>
            <RoomPresence people={people} color={room.color} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFollow}
              className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
            >
              {following ? "Following" : "Follow"}
            </button>
            <button
              type="button"
              onClick={onJoin}
              disabled={room.comingSoon}
              className={clsx(
                "rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]",
                joined
                  ? "border-emerald-200/25 bg-emerald-300/15 text-emerald-50"
                  : "border-white/12 bg-white/10 text-white"
              )}
            >
              {joined ? "Joined" : "Join"}
            </button>
            <button
              type="button"
              onClick={onStartCall}
              disabled={!permissions.startCall}
              className="rounded-full border border-cyan-200/25 bg-cyan-300/12 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-50 disabled:opacity-40"
            >
              Start Call
            </button>
            <button
              type="button"
              onClick={onGoLive}
              disabled={!permissions.goLive}
              className="rounded-full border border-rose-300/30 bg-rose-400/15 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-rose-50 disabled:opacity-40"
            >
              Go Live
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
