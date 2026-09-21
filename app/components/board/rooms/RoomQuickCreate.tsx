"use client";

import React from "react";
import type { StudioCaptureMode } from "@/lib/board/dropItem";
import { ROOM_QUICK_CREATE_MODES, type RoomQuickCreateMode } from "@/lib/board/dropDestination";

export default function RoomQuickCreate({
  onPick,
  suggested,
}: {
  onPick: (mode: StudioCaptureMode, quick: RoomQuickCreateMode) => void;
  suggested?: StudioCaptureMode;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick create Drop modes">
      {ROOM_QUICK_CREATE_MODES.map((mode) => {
        const active = suggested === mode.studioMode && mode.id !== "link";
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onPick(mode.studioMode, mode.id)}
            className={
              active
                ? "rounded-full border border-emerald-200/30 bg-emerald-300/16 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-50"
                : "rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
            }
          >
            {mode.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onPick(suggested || "photo", "photo")}
        className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
      >
        More
      </button>
    </div>
  );
}
