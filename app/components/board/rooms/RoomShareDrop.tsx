"use client";

import React, { useMemo, useState } from "react";
import { readBestLocalDropItems, type DropItem } from "@/lib/board/dropItem";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomShareDrop({
  open,
  onClose,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  onShare: (drop: DropItem) => void;
}) {
  const [query, setQuery] = useState("");
  const drops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return readBestLocalDropItems()
      .filter((drop) => {
        if (!q) return true;
        return `${drop.title} ${drop.type} ${drop.description || ""}`.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85]">
      <button aria-label="Close share overlay" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#0b0b18]/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.72)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-white/90">Share a Drop</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70"
          >
            Close
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your Drops"
          className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
        />
        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {drops.map((drop) => (
            <button
              key={drop.id}
              type="button"
              onClick={() => onShare(drop)}
              className={clsx(
                "w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left",
                "hover:border-white/20 hover:bg-white/[0.07]"
              )}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/80">
                {drop.type === "Media" ? "Vision" : drop.type} Drop
              </div>
              <div className="mt-1 text-sm font-semibold text-white">{drop.title}</div>
            </button>
          ))}
          {drops.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
              No Drops in this Board yet. Make one in Drop Studio, then share it into the Room.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
