"use client";

import React from "react";
import { BoardFrame } from "@/app/components/board/BoardFrame";

export function DropCard({
  drop,
}: {
  drop: {
    id: string;
    text: string;
    created_at: string;
    style_snapshot?: any; // jsonb
    profile?: { board_style?: any; user?: string; display_name?: string } | null;
  };
}) {
  const style = drop.style_snapshot ?? drop.profile?.board_style ?? null;

  return (
    <BoardFrame style={style} className="relative overflow-hidden">
      <div className="text-xs opacity-70">
        {drop.profile?.display_name ?? drop.profile?.user ?? "Board User"}
      </div>
      <div className="mt-2 text-sm leading-relaxed">{drop.text}</div>
      <div className="mt-3 text-[11px] opacity-60">
        {new Date(drop.created_at).toLocaleString()}
      </div>
    </BoardFrame>
  );
}
