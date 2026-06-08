"use client";

import { useRouter } from "next/navigation";
import { Sparkles, Radio, ChevronRight } from "lucide-react";

export type ProfileOrbData = {
  id: string;
  name: string;
  username: string;
  aura: string;
  avatar?: string;
  status: string;
  boardTitle: string;
  tags: string[];
  recentDrops: string[];
  x: number;
  y: number;
  size?: "sm" | "md" | "lg";
  delay?: number;
};

type ProfileOrbProps = ProfileOrbData;

const sizeMap = {
  sm: "h-28 w-28",
  md: "h-36 w-36",
  lg: "h-44 w-44",
};

export default function ProfileOrb({
  name,
  username,
  aura,
  avatar,
  status,
  boardTitle,
  tags,
  recentDrops,
  x,
  y,
  size = "md",
  delay = 0,
}: ProfileOrbProps) {
  const router = useRouter();

  function openProfile() {
    router.push(`/board/profile/${username}`);
  }

  return (
    <button
      type="button"
      onClick={openProfile}
      className="group absolute text-left outline-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        animation: `orbFloat ${7 + delay}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
      aria-label={`Open ${name}'s Board profile`}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <div
          className="absolute inset-0 rounded-full blur-3xl"
          style={{
            background: aura,
            animation: "pulseAura 4.5s ease-in-out infinite",
          }}
        />

        <div
          className={`relative ${sizeMap[size]} overflow-hidden rounded-full border border-white/20 bg-black/50 shadow-2xl backdrop-blur-xl transition duration-500 group-hover:scale-110`}
          style={{
            boxShadow: `0 0 38px ${aura}`,
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={name}
              className="h-full w-full object-cover opacity-90"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5">
              <span className="text-4xl font-black tracking-widest text-white">
                {name.slice(0, 1)}
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/70" />

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80 backdrop-blur-md">
            <Radio className="h-3 w-3" />
            Live Board
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-[115%] w-72 -translate-x-1/2 translate-y-3 rounded-3xl border border-white/15 bg-black/80 p-4 opacity-0 shadow-2xl backdrop-blur-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-white">{name}</p>
              <p className="text-xs text-white/50">@{username}</p>
            </div>

            <div
              className="rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
              style={{
                color: aura,
                border: `1px solid ${aura}`,
              }}
            >
              Aura
            </div>
          </div>

          <p className="text-sm font-semibold text-white/85">{boardTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">{status}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles className="h-3.5 w-3.5" />
              Recent Drops
            </div>

            <div className="space-y-1">
              {recentDrops.map((drop) => (
                <div
                  key={drop}
                  className="flex items-center justify-between rounded-xl bg-black/30 px-2 py-1.5 text-xs text-white/70"
                >
                  <span>{drop}</span>
                  <ChevronRight className="h-3 w-3 text-white/30" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
