"use client";

export default function HighlightsPane() {
  return (
    <div className="space-y-3">
      <div className="text-white/80 text-sm tracking-wide">Highlights</div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-sm text-white/80">Pinned Drops</div>
        <div className="text-xs text-white/50 mt-1">
          Later: choose drops from your collection to show here.
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/60"
            >
              Empty Slot
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
