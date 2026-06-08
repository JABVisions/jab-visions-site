"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EVENTS } from "@/lib/boardStore";
import {
  BOARD_PROJECTS_UPDATED_EVENT,
  syncResolvedProjectsToStorage,
  statusLabel,
} from "@/lib/board/projects";

const PROJECT_DROPS_UPDATED_EVENT = "board:project-drops:updated";
type NotebookTab = "all" | "projects" | "casting" | "crew" | "gigs" | "auditions" | "saved";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ProjectTileLite = ReturnType<typeof syncResolvedProjectsToStorage>[number];

export default function ProjectNotebook({
  onOpenProjects,
  bigger,
  limit = 10,
}: {
  onOpenProjects: () => void;
  bigger?: boolean;
  limit?: number;
}) {
  const [projects, setProjects] = useState<ProjectTileLite[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<NotebookTab>("all");

  function loadProjects() {
    if (typeof window === "undefined") return;
    setProjects(syncResolvedProjectsToStorage());
  }

  useEffect(() => {
    loadProjects();

    function onStorage(e: StorageEvent) {
      if (e.key) loadProjects();
    }
    function onProjectsUpdated() {
      loadProjects();
    }
    function onFeedUpdated() {
      loadProjects();
    }
    function onActivityNew() {
      loadProjects();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      BOARD_PROJECTS_UPDATED_EVENT,
      onProjectsUpdated as EventListener
    );
    window.addEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
    window.addEventListener("board:activity:new", onActivityNew as EventListener);
    window.addEventListener(PROJECT_DROPS_UPDATED_EVENT, onProjectsUpdated as EventListener);

    // same-tab polling (prototype)
    const t = window.setInterval(loadProjects, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        BOARD_PROJECTS_UPDATED_EVENT,
        onProjectsUpdated as EventListener
      );
      window.removeEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
      window.removeEventListener("board:activity:new", onActivityNew as EventListener);
      window.removeEventListener(
        PROJECT_DROPS_UPDATED_EVENT,
        onProjectsUpdated as EventListener
      );
      window.clearInterval(t);
    };
  }, []);

  const tabs: Array<{ key: NotebookTab; label: string }> = [
    { key: "all", label: "All" },
    { key: "projects", label: "Projects" },
    { key: "casting", label: "Casting Calls" },
    { key: "crew", label: "Crew Calls" },
    { key: "gigs", label: "Gigs" },
    { key: "auditions", label: "Auditions" },
    { key: "saved", label: "Saved" },
  ];

  function tabMatches(project: ProjectTileLite) {
    const hay = [
      project.projectType,
      project.status,
      project.title,
      project.logline,
      project.rolesNeeded,
      project.department,
      project.roleTitle,
    ]
      .join(" ")
      .toLowerCase();

    if (activeTab === "all") return true;
    if (activeTab === "projects") return /project|production|film|short/.test(hay);
    if (activeTab === "casting") return /casting|cast|actor|role/.test(hay);
    if (activeTab === "crew") return /crew|department|camera|sound|stylist|production/.test(hay);
    if (activeTab === "gigs") return /gig|job|paid|rate|compensation/.test(hay);
    if (activeTab === "auditions") return /audition|self[-\s]?tape|tape/.test(hay);
    if (activeTab === "saved") return Boolean((project as any).isSaved || (project as any).saved);
    return true;
  }

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter(tabMatches)
      .filter((project) => {
        if (!q) return true;
        const hay = [
          project.title,
          project.logline,
          project.productionTitle,
          project.roleTitle,
          project.location,
          project.authorName,
          project.contactName,
          project.rolesNeeded,
          project.department,
          project.notes,
          project.projectType,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, limit);
  }, [projects, query, activeTab, limit]);

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
              Project drops, casting calls, gigs, and production notes.
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onOpenProjects}
              className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2 text-sm text-lime-100/90 hover:bg-lime-400/20 transition"
            >
              Project
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, role, location, author, tags..."
            className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-white/82 outline-none placeholder:text-white/34 focus:border-lime-200/35 focus:shadow-[0_0_22px_rgba(190,242,100,0.14)]"
          />

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  "rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition",
                  activeTab === tab.key
                    ? "border-lime-200/45 bg-lime-300/18 text-lime-50 shadow-[0_0_18px_rgba(190,242,100,0.14)]"
                    : "border-white/10 bg-white/5 text-white/48 hover:bg-white/10"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-xs text-white/50">Notebook Notes</div>
            <div className="text-xs text-white/40">{recent.length} shown · {projects.length} total</div>
          </div>

          <div className="p-4">
            {recent.length === 0 ? (
              <div className="text-sm text-white/55">
                No project notes yet. Create a project drop, casting call, or work opportunity to start filling your notebook.
              </div>
            ) : (
              <div className="grid gap-3">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={onOpenProjects}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-200/18 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/80">
                            {p.projectType || "Project"}
                          </span>
                          <span className="rounded-full border border-lime-200/16 bg-lime-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-100/78">
                            {statusLabel(p.status)}
                          </span>
                        </div>
                        <div className="text-white/85 text-sm font-semibold truncate">
                          {p.title}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/45">
                          <div
                            className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border bg-black/30 text-[10px] font-black text-white/80"
                            style={{
                              borderColor: `${p.authorGlow || "#FF4FD8"}70`,
                              boxShadow: `0 0 18px ${p.authorGlow || "#FF4FD8"}44`,
                            }}
                          >
                            {p.authorAvatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.authorAvatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (p.authorName || p.contactName || "B").slice(0, 1)
                            )}
                          </div>
                          <span className="font-bold text-white/62">
                            {p.authorName || p.contactName || "Project Host"}
                          </span>
                          {p.authorUsername ? <span>@{p.authorUsername}</span> : null}
                        </div>
                        {p.logline ? (
                          <div className="mt-1 text-white/60 text-xs line-clamp-2">
                            {p.logline}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs text-white/40">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/48">
                      <div>
                        <div className="tracking-[0.18em] text-white/32">Invites</div>
                        <div className="mt-1 text-white/70">{p.invites.length}</div>
                      </div>
                      <div>
                        <div className="tracking-[0.18em] text-white/32">Location</div>
                        <div className="mt-1 text-white/70 line-clamp-1">{p.location || "TBD"}</div>
                      </div>
                      <div>
                        <div className="tracking-[0.18em] text-white/32">Roles</div>
                        <div className="mt-1 line-clamp-1 text-white/70">
                          {p.roleTitle || p.rolesNeeded || "TBD"}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 text-xs text-white/40">
          Open Projects to manage host info, invites, and the project room.
        </div>
      </div>
    </div>
  );
}
