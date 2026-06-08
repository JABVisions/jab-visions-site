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
  onMarkAllRead,
  onClear,
}: {
  items: WorkCallItem[];
  counts: Record<WorkCallType, number>;
  onOpen?: (id: string) => void;
  onCreate?: () => void;
  onMarkAllRead?: () => void;
  onClear?: () => void;
}) {
  const [filter, setFilter] = useState<WorkCallType | "all">("all");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((x) => (filter === "all" ? true : x.type === filter))
      .filter((x) => (unreadOnly ? !!x.unread : true))
      .filter((x) => {
        if (!q) return true;
        return (
          x.title.toLowerCase().includes(q) ||
          (x.preview ?? "").toLowerCase().includes(q) ||
          typeLabel(x.type).toLowerCase().includes(q)
        );
      });
  }, [items, filter, query, unreadOnly]);

  const unreadCount = items.filter((item) => item.unread).length;

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
              Track casting, crew, gigs, and collaboration asks in one place.
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
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["All", items.length],
            ["Unread", unreadCount],
            ["Casting", counts.casting ?? 0],
            ["Crew", counts.crew ?? 0],
            ["Gigs", counts.gigs ?? 0],
          ].map(([label, count]) => (
            <div
              key={String(label)}
              className="grid aspect-square min-h-[86px] place-items-center rounded-2xl border border-white/10 bg-white/5 px-2 py-3 text-center sm:aspect-auto"
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/36">{label}</div>
                <div className="mt-2 text-lg font-semibold leading-none text-white/86">{count}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search work calls..."
            className="min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/82 outline-none placeholder:text-white/35 focus:ring-2 focus:ring-lime-300/30"
          />
          <button
            type="button"
            onClick={() => setUnreadOnly((value) => !value)}
            className={clsx(
              "rounded-2xl border px-4 py-2 text-sm transition",
              unreadOnly
                ? "border-lime-300/30 bg-lime-400/15 text-lime-100"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            )}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={!items.some((item) => item.unread)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/68 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Mark read
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={items.length === 0}
            className="rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-2 text-sm text-red-100/80 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Clear
          </button>
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
      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/80">No Work Calls match this view.</div>
            <div className="mt-1 text-xs text-white/45">
              Post a new call or adjust the filter/search.
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onOpen?.(w.id)}
                className={clsx(
                  "w-full text-left rounded-3xl border p-4 transition",
                  w.unread
                    ? "border-lime-300/20 bg-lime-400/[0.08]"
                    : "border-white/10 bg-white/[0.04]",
                  "hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-lime-300/30"
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

                      <span
                        className={clsx(
                          "shrink-0 rounded-full border px-2 py-1 text-[11px]",
                          typePillClasses(w.type)
                        )}
                      >
                        {typeLabel(w.type)}
                      </span>
                    </div>
                    <div className="mt-2 text-base font-semibold text-white/88">{w.title}</div>

                    {w.preview ? (
                      <div className="mt-2 text-sm leading-6 text-white/58 line-clamp-3">{w.preview}</div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right text-xs text-white/40">
                    <div>{new Date(w.createdAt).toLocaleDateString()}</div>
                    <div className="mt-2 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
                      Open
                    </div>
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
