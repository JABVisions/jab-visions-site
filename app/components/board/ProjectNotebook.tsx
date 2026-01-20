"use client";

import React, { useEffect, useMemo, useState } from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PROJECTS_STORAGE_KEY = "jab_board_projects_v1";

type ProjectDropLite = {
  id: string;
  title: string;
  logline?: string;
  createdAt: number;
  media?: { kind: "image" | "video"; src: string };
};

export default function ProjectNotebook({
  onOpenProjects,
  bigger,
  limit = 10,
}: {
  onOpenProjects: () => void;
  bigger?: boolean;
  limit?: number;
}) {
  const [projects, setProjects] = useState<ProjectDropLite[]>([]);

  function safeParse<T>(raw: string | null, fallback: T): T {
    try {
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  function loadProjects() {
    if (typeof window === "undefined") return;
    const parsed = safeParse<ProjectDropLite[]>(
      localStorage.getItem(PROJECTS_STORAGE_KEY),
      []
    );
    const list = Array.isArray(parsed) ? parsed : [];
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setProjects(list);
  }

  useEffect(() => {
    loadProjects();

    function onStorage(e: StorageEvent) {
      if (e.key === PROJECTS_STORAGE_KEY) loadProjects();
    }
    window.addEventListener("storage", onStorage);

    // same-tab polling (prototype)
    const t = window.setInterval(loadProjects, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const recent = useMemo(() => projects.slice(0, limit), [projects, limit]);

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] border border-white/10 bg-black/25 backdrop-blur-md p-4 md:p-5",
        bigger && "min-h-[520px]"
      )}
      style={{
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.05), 0 0 34px rgba(59,130,246,0.12)",
      }}
    >
      {/* notebook spine */}
      <div className="absolute left-0 top-0 h-full w-10 bg-white/5 border-r border-white/10" />
      {/* subtle ruled lines */}
      <div
        className="absolute left-10 right-0 top-0 bottom-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, transparent 1px, transparent 28px)",
        }}
      />

      <div className="relative pl-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-white font-semibold text-lg">Project Notebook</div>
            <div className="text-white/60 text-sm">
              A living log of Project Drops.
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProjects}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
          >
            Open Projects
          </button>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-xs text-white/50">Recent Notes</div>
            <div className="text-xs text-white/40">{projects.length} entries</div>
          </div>

          <div className="p-4">
            {recent.length === 0 ? (
              <div className="text-sm text-white/55">
                No projects yet. When a Project Drop lands, it’ll show up here.
              </div>
            ) : (
              <div className="grid gap-3">
                {recent.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white/85 text-sm font-semibold truncate">
                          {p.title}
                        </div>
                        {p.logline ? (
                          <div className="mt-1 text-white/60 text-xs line-clamp-2">
                            {p.logline}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs text-white/40">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="mt-3 h-[1px] w-full bg-white/10" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 text-xs text-white/40">
          Later: pay drop notifications will also land as notebook entries.
        </div>
      </div>
    </div>
  );
}
