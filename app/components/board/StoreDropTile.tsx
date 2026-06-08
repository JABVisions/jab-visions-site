"use client";

import { ExternalLink } from "lucide-react";

export type StoreDrop = {
  id: string;
  artifactId?: string;
  title: string;
  price: string;
  href: string;
  image: string;
  description?: string;
  soldOut?: boolean;
  aura?: "red" | "blue" | "yellow" | "black" | "pink" | "green" | "neutral";
};

const auraGlow = {
  red: "hover:border-red-400/60 hover:shadow-red-500/20",
  blue: "hover:border-blue-400/60 hover:shadow-blue-500/20",
  yellow: "hover:border-yellow-300/60 hover:shadow-yellow-300/20",
  black: "hover:border-white/40 hover:shadow-white/15",
  pink: "hover:border-pink-400/60 hover:shadow-pink-400/20",
  green: "hover:border-lime-300/60 hover:shadow-lime-300/20",
  neutral: "hover:border-white/30 hover:shadow-white/10",
};

export default function StoreDropTile({ drop }: { drop: StoreDrop }) {
  return (
    <a
      href={drop.href}
      target="_blank"
      rel="noreferrer"
      className={[
        "group block overflow-hidden rounded-3xl border border-white/10",
        "bg-[#101014]/90 shadow-xl backdrop-blur-xl",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl",
        auraGlow[drop.aura ?? "neutral"],
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={drop.image}
          alt={drop.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />

        {/* Collectible holographic sheen — sweeps across the artifact on hover. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 46%, rgba(126,226,255,0.18) 52%, rgba(255,158,236,0.18) 58%, transparent 74%)",
            backgroundSize: "220% 220%",
            animation: "storeHolo 2.6s ease-in-out infinite",
            mixBlendMode: "screen",
          }}
        />
        <style>{`
          @keyframes storeHolo {
            0% { background-position: 130% 0%; }
            100% { background-position: -30% 100%; }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-store-holo] { animation: none !important; }
          }
        `}</style>

        <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/75 backdrop-blur-md">
          Store Drop
        </div>

        {drop.soldOut ? (
          <div className="absolute right-3 top-3 rounded-full border border-rose-300/25 bg-rose-500/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-rose-100 backdrop-blur-md">
            Sold Out
          </div>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-white/10 p-4">
        {drop.artifactId ? (
          <p className="text-[11px] uppercase tracking-[0.25em] text-lime-300/70">
            {drop.artifactId}
          </p>
        ) : null}

        <div>
          <h3 className="line-clamp-2 text-base font-bold text-white">{drop.title}</h3>

          {drop.description ? (
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/50">
              {drop.description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-black text-white">{drop.price}</span>

          {drop.soldOut ? (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
              Archived
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70 transition group-hover:bg-lime-300/15 group-hover:text-lime-100">
              View
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
