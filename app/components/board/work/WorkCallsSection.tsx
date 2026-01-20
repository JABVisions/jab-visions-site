"use client";

import React from "react";
import type { WorkState } from "./types";
import { EmptyState } from "@/app/components/board/ui/EmptyState";
import { Pill } from "@/app/components/board/ui/Pill";

export function WorkCallsSection({
  state,
  onChange,
}: {
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const calls = [...state.calls].sort((a, b) => b.createdAt - a.createdAt);

  const remove = (id: string) => {
    onChange({ ...state, calls: state.calls.filter((c) => c.id !== id) });
  };

  if (!calls.length) {
    return (
      <EmptyState
        title="No work calls posted."
        hint="Post an audition, collab, or request to start the opportunity feed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((c) => (
        <div
          key={c.id}
          className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{c.type}</Pill>
                {typeof c.paid === "boolean" && (
                  <Pill>{c.paid ? "Paid" : "Unpaid"}</Pill>
                )}
                {typeof c.remote === "boolean" && (
                  <Pill>{c.remote ? "Remote" : "In-Person"}</Pill>
                )}
                {c.deadline ? <Pill>Deadline: {c.deadline}</Pill> : null}
              </div>

              <div className="text-sm font-semibold">{c.title}</div>
              <p className="text-sm text-white/70 whitespace-pre-line">
                {c.description}
              </p>

              {!!c.tags?.length && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.tags.slice(0, 6).map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 md:flex-col md:items-end">
              {c.link ? (
                <a
                  href={c.link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85 ring-1 ring-white/10 hover:bg-white/15"
                >
                  Respond
                </a>
              ) : (
                <button className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/50 ring-1 ring-white/10 cursor-not-allowed">
                  Respond
                </button>
              )}

              <button
                onClick={() => remove(c.id)}
                className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60 ring-1 ring-white/10 hover:bg-white/10"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
