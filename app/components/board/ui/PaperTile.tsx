"use client";

import React from "react";

type Accent = "green" | "pink" | "mixed";

const accentRing: Record<Accent, string> = {
  green: "ring-emerald-300/70",
  pink: "ring-pink-300/70",
  mixed: "ring-emerald-200/60",
};

export function PaperTile({
  children,
  accent = "mixed",
  className = "",
}: {
  children: React.ReactNode;
  accent?: Accent;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-3xl bg-white/80 backdrop-blur-sm",
        "ring-1",
        accentRing[accent],
        "shadow-[0_10px_30px_rgba(0,0,0,0.08)]",
        "p-4 md:p-6",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}
