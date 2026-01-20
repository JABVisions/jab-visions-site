"use client";

import React from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function TileFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden",
        "shadow-[0_12px_44px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
      <TileFrame>
        <div className="p-6">
          <div className="text-[11px] tracking-[0.35em] text-white/50">BOARD</div>
          <h1 className="mt-2 text-2xl font-semibold text-white/90">Projects</h1>
          <p className="mt-2 text-sm text-white/55 max-w-[70ch]">
            Backstage-inspired: thorough project listings creators can examine and book work from.
            (Next: Project Drop button → Project Drops list → Project Tile → Project Page.)
          </p>

          <div className="mt-6 rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.30em] text-white/45">PROJECT TABLE</div>
                <div className="mt-2 text-sm text-white/70">
                  Placeholder UI so routing works now.
                </div>
              </div>

              <button
                type="button"
                className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2 text-sm text-lime-100/90 hover:bg-lime-400/20 transition shadow-[0_0_20px_rgba(163,230,53,0.16)]"
              >
                Project Drop →
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/75">
                No projects yet.
              </div>
              <div className="mt-1 text-xs text-white/45">
                Next step: add Project Drops (rectangular rounded tiles) and a detailed inspection flow.
              </div>
            </div>
          </div>
        </div>
      </TileFrame>
    </div>
  );
}
