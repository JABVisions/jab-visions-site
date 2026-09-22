"use client";

import React from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function OfficialRoomBadge({
  compact,
  comingSoon,
}: {
  compact?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[10px] font-black uppercase tracking-[0.18em]",
        comingSoon
          ? "border-white/15 bg-white/8 text-white/70"
          : "border-lime-300/45 bg-[linear-gradient(135deg,rgba(191,255,79,0.18),rgba(217,70,239,0.16))] text-lime-200 shadow-[0_0_18px_rgba(191,255,79,0.24)]"
      )}
      title="Official JAB Room"
    >
      <span
        aria-hidden
        className={clsx(
          "grid h-3.5 w-3.5 place-items-center rounded-full",
          comingSoon
            ? "bg-white/20 text-[8px]"
            : "bg-[radial-gradient(circle_at_30%_20%,#ffd8ff,transparent_42%),linear-gradient(135deg,#d946ef,#86198f)] text-[8px] shadow-[0_0_10px_rgba(217,70,239,0.72)]"
        )}
      >
        ◆
      </span>
      {compact ? "JAB" : comingSoon ? "Official · Soon" : "JAB Official"}
    </span>
  );
}
