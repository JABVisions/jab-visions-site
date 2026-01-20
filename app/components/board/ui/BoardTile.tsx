"use client";

import React from "react";

type Aura = "magenta" | "violet" | "pink" | "emerald" | "blue" | "none";

const auraStyles: Record<Aura, string> = {
  none: "ring-white/10",
  magenta: "ring-fuchsia-400/25 shadow-[0_0_40px_rgba(217,70,239,0.12)]",
  violet: "ring-violet-400/25 shadow-[0_0_40px_rgba(139,92,246,0.12)]",
  pink: "ring-pink-400/25 shadow-[0_0_40px_rgba(236,72,153,0.12)]",
  emerald: "ring-emerald-400/25 shadow-[0_0_40px_rgba(52,211,153,0.10)]",
  blue: "ring-sky-400/25 shadow-[0_0_40px_rgba(56,189,248,0.10)]",
};

export function BoardTile({
  children,
  aura = "none",
  className = "",
}: {
  children: React.ReactNode;
  aura?: Aura;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl bg-white/[0.04] ring-1",
        auraStyles[aura],
        "p-4 md:p-5",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}
