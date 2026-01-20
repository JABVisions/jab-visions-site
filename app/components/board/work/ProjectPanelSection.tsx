"use client";

import React from "react";

export default function ProjectPanel() {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-black/80">Projects</div>

      <div className="rounded-[18px] border border-black/10 bg-white/75 p-4 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
        <div className="text-sm text-black/70">
          ProjectPanel loaded ✅
        </div>
        <div className="mt-2 text-xs text-black/45">
          Next: we’ll drop your real Projects UI in here (cards, statuses, roles,
          links, etc.).
        </div>
      </div>
    </div>
  );
}
