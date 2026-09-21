"use client";

import React from "react";
import type { Room } from "@/lib/board/rooms";
import type { StudioCaptureMode } from "@/lib/board/dropItem";
import { suggestedStudioModeForRoom, type RoomQuickCreateMode } from "@/lib/board/dropDestination";
import RoomQuickCreate from "./RoomQuickCreate";

export default function RoomDropComposer({
  room,
  canCreate,
  canShare,
  disabledReason,
  onCreateDrop,
  onShareExisting,
}: {
  room: Room;
  canCreate: boolean;
  canShare: boolean;
  disabledReason?: string;
  onCreateDrop: (mode: StudioCaptureMode, quick?: RoomQuickCreateMode) => void;
  onShareExisting: () => void;
}) {
  const suggested = suggestedStudioModeForRoom(room.id);

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">
          Create Room Drop
        </div>
        <span className="text-[11px] text-white/45">
          {room.icon} {room.name}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCreateDrop(suggested)}
          disabled={!canCreate}
          className="rounded-full border border-emerald-200/30 bg-emerald-300/16 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Create Room Drop
        </button>
        {canShare ? (
          <button
            type="button"
            onClick={onShareExisting}
            className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
          >
            Share existing Drop
          </button>
        ) : null}
      </div>
      {canCreate ? (
        <div className="mt-3">
          <RoomQuickCreate suggested={suggested} onPick={onCreateDrop} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/50">
          {disabledReason || "Join this Room to create a Drop here."}
        </p>
      )}
    </section>
  );
}
