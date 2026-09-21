"use client";

import React from "react";
import { livePresence, presenceLabel, presenceSentence, type RoomPresence } from "@/lib/board/rooms";
import RoomMemberOrb from "./RoomMemberOrb";

export default function RoomPresence({
  people,
  color,
}: {
  people: RoomPresence[];
  color?: string;
}) {
  const live = livePresence(people);
  const extra = Math.max(0, live.length - 5);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />
        {presenceLabel(live.length)}
      </span>
      <div className="flex items-center">
        {live.slice(0, 5).map((person, index) => (
          <span key={person.userId} className="-ml-1 first:ml-0" style={{ zIndex: 6 - index }}>
            <RoomMemberOrb
              name={person.displayName || person.username || "Board"}
              avatarUrl={person.avatarUrl}
              glow={color}
            />
          </span>
        ))}
        {extra > 0 ? (
          <span className="-ml-1 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-black/50 text-[10px] font-black text-white/70">
            +{extra}
          </span>
        ) : null}
      </div>
      <span className="text-xs text-white/45">{presenceSentence(live.length)}</span>
    </div>
  );
}
