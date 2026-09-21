"use client";

import React from "react";
import { publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoomMemberOrb({
  name,
  avatarUrl,
  size = 28,
  glow,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  glow?: string;
}) {
  const src = publicOrbAvatarUrl(avatarUrl);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();

  return (
    <span
      title={name}
      className={clsx(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-black/40",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      )}
      style={{
        width: size,
        height: size,
        boxShadow: glow ? `0 0 16px ${glow}88` : undefined,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-black text-white/85">{initial}</span>
      )}
    </span>
  );
}
