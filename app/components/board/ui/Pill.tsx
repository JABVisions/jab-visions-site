"use client";

import React from "react";

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80 ring-1 ring-white/10">
      {children}
    </span>
  );
}
