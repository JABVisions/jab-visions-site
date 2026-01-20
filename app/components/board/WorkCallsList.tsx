"use client";

import React, { useMemo, useState } from "react";

type WorkCallType = "casting" | "crew" | "gigs" | "collaborations";

export type WorkCallItem = {
  id: string;
  type: WorkCallType;
  title: string;
  preview?: string;
  createdAt: number;
  unread?: boolean;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function typeLabel(t: WorkCallType) {
  switch (t) {
    case "casting":
      return "Casting Call";
    case "crew":
      return "Crew Call";
    case "gigs":
      return "Gigs";
    case "collaborations":
      return "Collaborations";
  }
}

function typePillClasses(_t: WorkCallType) {
  return "border-white/10 bg-white/5 text-white/75";
}

export default function WorkCallsList({
  items,
  counts,
  onOpen,
  onCreate,
}: {
  items: WorkCallItem[];
  counts: Record<WorkCallType, number>;
  onOpen?: (id: string) => void;
  onCreate?: () => void;
}) {
  const [filter, setFilter] = useState<WorkCallType | "all">("all");

  const filtered = useMemo(() => {
    const base = items.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "all") return base;
    return base.filter((x) => x.type === filter);
  }, [items, filter]);

  const tabs: Array<{ id: WorkCallType | "all"; label: string; count: number }> = [
    { id: "all", label: "All", count: items.length },
    { id: "casting", label: "Casting Call", count: counts.casting ?? 0 },
    { id: "crew", label: "Crew Call", count: counts.crew ?? 0 },
    { id: "gigs", label: "Gigs", count: counts.gigs ?? 0 },
    { id: "collaborations", label: "Collaborations", count: counts.collaborations ?? 0 },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs tracking-[0.35em] text-white/55">WORK CALLS</div>
            <div className="mt-2 text-lg font-semibold text-white/90">Inbox</div>
            <div className="mt-1 text-sm text-white/55">
              Message-list Work Calls with tags by index.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCreate}
              className={clsx(
                "rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2",
                "text-sm text-lime-100/90 hover:bg-lime-400/20 transition",
                "shadow-[0_0_20px_rgba(163,230,53,0.16)]"
              )}
            >
              + Work Call
            </button>

            <div className="hidden sm:block rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
              Index:
              <span className="ml-2 text-white/80">Casting {counts.casting ?? 0}</span>
              <span className="mx-2 text-white/20">•</span>
              <span className="text-white/80">Crew {counts.crew ?? 0}</span>
              <span className="mx-2 text-white/20">•</span>
              <span className="text-white/80">Gigs {counts.gigs ?? 0}</span>
              <span className="mx-2 text-white/20">•</span>
              <span className="text-white/80">Collabs {counts.collaborations ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 -mx-1 px-1 overflow-x-auto overflow-y-hidden">
          <div className="flex flex-nowrap gap-2 min-w-max pb-1">
            {tabs.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={clsx(
                    "shrink-0 rounded-2xl px-4 py-2 text-sm transition border whitespace-nowrap",
                    active
                      ? "border-lime-300/25 bg-lime-400/15 text-lime-100/90 shadow-[0_0_22px_rgba(163,230,53,0.18)]"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  )}
                >
                  {t.label}
                  <span className="ml-2 text-xs text-white/55">({t.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/80">No Work Calls yet.</div>
            <div className="mt-1 text-xs text-white/45">
              Hit <span className="text-white/70 font-medium">+ Work Call</span> to post the first one.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onOpen?.(w.id)}
                className={clsx(
                  "w-full text-left rounded-2xl p-4 transition",
                  "hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-lime-300/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {w.unread ? (
                        <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(163,230,53,0.6)]" />
                      ) : (
                        <span className="mt-[2px] inline-block h-2 w-2 rounded-full bg-white/10" />
                      )}

                      <div className="text-sm font-medium text-white/85 truncate">{w.title}</div>

                      <span
                        className={clsx(
                          "shrink-0 rounded-full border px-2 py-1 text-[11px]",
                          typePillClasses(w.type)
                        )}
                      >
                        {typeLabel(w.type)}
                      </span>
                    </div>

                    {w.preview ? (
                      <div className="mt-2 text-xs text-white/55 line-clamp-2">{w.preview}</div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-xs text-white/40">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
