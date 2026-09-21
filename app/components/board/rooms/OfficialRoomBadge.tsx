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
          : "border-amber-200/35 bg-[linear-gradient(135deg,rgba(255,214,102,0.28),rgba(255,77,166,0.16))] text-amber-50 shadow-[0_0_18px_rgba(255,214,102,0.28)]"
      )}
      title="Official JAB Room"
    >
      <span
        aria-hidden
        className={clsx(
          "grid h-3.5 w-3.5 place-items-center rounded-full",
          comingSoon
            ? "bg-white/20 text-[8px]"
            : "bg-[radial-gradient(circle_at_30%_20%,#fff7d6,transparent_42%),linear-gradient(135deg,#f5d76e,#ff6b9d)] text-[8px] shadow-[0_0_10px_rgba(255,215,110,0.7)]"
        )}
      >
        ◆
      </span>
      {compact ? "JAB" : comingSoon ? "Official · Soon" : "JAB Official"}
    </span>
  );
}
