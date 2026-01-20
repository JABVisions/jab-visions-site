// app/board/explore/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Compass, Search, Filter, ChevronRight } from "lucide-react";

type ExploreResult = {
  id: string;
  type: "thread" | "room" | "person" | "drop";
  title: string;
  subtitle: string;
  tags: string[];
};

function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ExplorePage() {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "thread" | "room" | "person" | "drop"
  >("all");

  const results = useMemo<ExploreResult[]>(() => {
    return [
      {
        id: safeId(),
        type: "thread",
        title: "Board Build Log",
        subtitle: "Routes, components, and recovery notes",
        tags: ["dev", "system"],
      },
      {
        id: safeId(),
        type: "drop",
        title: "Signal Drop Concepts",
        subtitle: "Comment signals + bucket notifications",
        tags: ["signals", "ux"],
      },
      {
        id: safeId(),
        type: "room",
        title: "Lounge",
        subtitle: "A social room for casual drops",
        tags: ["vibes", "friends"],
      },
      {
        id: safeId(),
        type: "person",
        title: "Amelia",
        subtitle: "@amelia",
        tags: ["friend-zone"],
      },
    ];
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return results.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!s) return true;
      const hay = `${r.type} ${r.title} ${r.subtitle} ${r.tags.join(" ")}`.toLowerCase();
      return hay.includes(s);
    });
  }, [q, results, typeFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            <h1 className="text-xl font-semibold tracking-tight">Explore</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Search the universe. Later: real indexing + Supabase.
          </p>
        </div>

        <Link
          href="/board"
          className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900"
        >
          Back to Feed
        </Link>
      </div>

      {/* Search + filter */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads, rooms, people, drops..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/40 px-3 py-1 text-xs text-neutral-300">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </span>

          {(["all", "thread", "drop", "room", "person"] as const).map((t) => {
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs",
                  active
                    ? "border-neutral-700 bg-neutral-200/10 text-neutral-100"
                    : "border-neutral-800 bg-neutral-950/30 text-neutral-300 hover:bg-neutral-900/40"
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  {r.type}
                </div>
                <div className="mt-1 truncate text-base font-semibold">
                  {r.title}
                </div>
                <div className="mt-1 text-sm text-neutral-300">{r.subtitle}</div>

                {!!r.tags.length && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-neutral-800 bg-neutral-950/40 px-2 py-1 text-xs text-neutral-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900"
                onClick={() => alert("Next: route to detail pages by type")}
              >
                Open <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {!filtered.length && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5 text-sm text-neutral-400">
            Nothing found. Try a different search spell. 🧭
          </div>
        )}
      </div>
    </div>
  );
}
