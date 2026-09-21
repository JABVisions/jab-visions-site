"use client";

import Link from "next/link";
import React from "react";
import type { RoomCardModel } from "@/lib/board/rooms";
import { roomHref } from "@/lib/board/rooms";
import OfficialRoomBadge from "./OfficialRoomBadge";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomCard({
  room,
  compact,
}: {
  room: RoomCardModel;
  compact?: boolean;
}) {
  const live = room.live || room.state === "LIVE" || room.state === "STAGE";
  const href = room.comingSoon ? undefined : roomHref(room.id);

  const body = (
    <article
      className={clsx(
        "group relative overflow-hidden rounded-[1.6rem] border text-left transition",
        "border-white/10 bg-black/30 backdrop-blur-xl",
        compact ? "h-[168px] w-[220px] min-w-[220px]" : "h-[210px] w-[260px] min-w-[260px]",
        room.comingSoon ? "opacity-80" : "hover:-translate-y-0.5 hover:border-white/25"
      )}
      style={{
        boxShadow: `0 0 0 1px ${room.color}22, 0 0 34px ${room.color}28, 0 18px 50px rgba(0,0,0,0.45)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(420px 180px at 18% 0%, ${room.color}55, transparent 62%),
            radial-gradient(280px 160px at 92% 100%, ${room.accent}33, transparent 70%),
            linear-gradient(160deg, rgba(255,255,255,0.08), transparent 46%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-y-6 left-0 w-1.5 rounded-full bg-white/20" style={{ background: room.color }} />

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-black/35 text-2xl"
            style={{ boxShadow: `0 0 22px ${room.color}` }}
          >
            {room.icon}
          </div>
          <div className="flex flex-col items-end gap-1">
            {room.isOfficial ? <OfficialRoomBadge compact comingSoon={room.comingSoon} /> : null}
            {live ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_#fb7185]" />
                LIVE
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 min-w-0">
          <div className="truncate text-base font-semibold tracking-tight text-white">{room.name}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{room.description}</p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[11px] font-semibold text-white/60">
          <span>{room.memberCount} members</span>
          <span className="text-white/25">·</span>
          <span className="inline-flex items-center gap-1 text-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {room.presenceCount} inside
          </span>
        </div>
      </div>
    </article>
  );

  if (!href) {
    return <div className="cursor-default">{body}</div>;
  }

  return (
    <Link href={href} className="block shrink-0">
      {body}
    </Link>
  );
}
