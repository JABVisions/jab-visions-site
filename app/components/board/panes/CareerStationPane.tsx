"use client";

export default function CareerStationPane() {
  return (
    <div className="space-y-3">
      <div className="text-white/80 text-sm tracking-wide">Career Station</div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { title: "Work Calls", sub: "Browse roles & gigs" },
          { title: "Portfolio", sub: "Your work tiles" },
          { title: "Projects", sub: "Build + collab" },
          { title: "Crew Hub", sub: "Teams & roles" },
        ].map((x) => (
          <button
            key={x.title}
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm text-white/80 hover:bg-white/10 transition"
          >
            {x.title}
            <div className="text-xs text-white/50 mt-1">{x.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
