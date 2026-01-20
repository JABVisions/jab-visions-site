"use client";

import React, { useEffect, useMemo, useState } from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PROJECTS_STORAGE_KEY = "jab_projects_v1";

type ProjectStatus = "casting" | "staffing" | "pre_production" | "production" | "post" | "released";

type ProjectDropKind =
  | "overview"
  | "casting"
  | "crew"
  | "script"
  | "schedule"
  | "assets"
  | "links"
  | "notes";

type ProjectDrop = {
  id: string;
  kind: ProjectDropKind;
  title: string;
  summary?: string;
};

type Project = {
  id: string;
  createdAt: number;
  updatedAt: number;

  title: string;
  type: string; // Film, Series, Music Video, Short, Commercial, etc.
  status: ProjectStatus;

  logline: string;
  location: string;

  // Backstage-style quick facts
  dates: string; // e.g. "Jan 20–Feb 3"
  pay: string; // e.g. "Paid / Deferred / Profit-share"
  union: string; // e.g. "Non-Union"
  rolesNeeded: string; // short summary

  // Deep inspection fields
  description: string;
  notes: string;

  drops: ProjectDrop[];
};

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p: any) => ({
        id: String(p?.id ?? ""),
        createdAt: Number(p?.createdAt ?? Date.now()),
        updatedAt: Number(p?.updatedAt ?? Date.now()),
        title: String(p?.title ?? ""),
        type: String(p?.type ?? "Project"),
        status: (p?.status as ProjectStatus) ?? "casting",
        logline: String(p?.logline ?? ""),
        location: String(p?.location ?? ""),
        dates: String(p?.dates ?? ""),
        pay: String(p?.pay ?? ""),
        union: String(p?.union ?? ""),
        rolesNeeded: String(p?.rolesNeeded ?? ""),
        description: String(p?.description ?? ""),
        notes: String(p?.notes ?? ""),
        drops: Array.isArray(p?.drops) ? (p.drops as ProjectDrop[]) : [],
      }))
      .filter((p) => p.id && p.title);
  } catch {
    return [];
  }
}

function writeProjects(items: Project[]) {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function statusLabel(s: ProjectStatus) {
  switch (s) {
    case "casting":
      return "Casting";
    case "staffing":
      return "Staffing";
    case "pre_production":
      return "Pre-Production";
    case "production":
      return "Production";
    case "post":
      return "Post";
    case "released":
      return "Released";
  }
}

function dropLabel(k: ProjectDropKind) {
  switch (k) {
    case "overview":
      return "Overview";
    case "casting":
      return "Casting";
    case "crew":
      return "Crew";
    case "script":
      return "Script";
    case "schedule":
      return "Schedule";
    case "assets":
      return "Assets";
    case "links":
      return "Links";
    case "notes":
      return "Notes";
  }
}

function dropEmoji(k: ProjectDropKind) {
  switch (k) {
    case "overview":
      return "🧠";
    case "casting":
      return "🎭";
    case "crew":
      return "🎬";
    case "script":
      return "📄";
    case "schedule":
      return "🗓️";
    case "assets":
      return "🗂️";
    case "links":
      return "🔗";
    case "notes":
      return "📝";
  }
}

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return "";
  }
}

function TileFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-black/20 overflow-hidden",
        "shadow-[0_12px_44px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
      <div className="text-[11px] tracking-[0.35em] text-white/55">PROJECTS</div>
      <div className="mt-2 text-lg font-semibold text-white/90">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-white/55">{subtitle}</div> : null}
    </div>
  );
}

/** Rounded rectangle “drop buttons” (not vertical cards) */
function DropGrid({
  drops,
  onPick,
}: {
  drops: ProjectDrop[];
  onPick: (drop: ProjectDrop) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {drops.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onPick(d)}
          className={clsx(
            "rounded-2xl border border-white/10 bg-white/5",
            "px-4 py-3 text-left hover:bg-white/10 transition",
            "shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/85 truncate">
                {dropLabel(d.kind)}
              </div>
              <div className="mt-1 text-xs text-white/50 line-clamp-2">
                {d.summary ?? "Open drop"}
              </div>
            </div>
            <div className="text-lg shrink-0">{dropEmoji(d.kind)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ProjectCenter() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [dropsOpen, setDropsOpen] = useState(false);
  const [activeDrop, setActiveDrop] = useState<ProjectDrop | null>(null);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Project>>({
    title: "",
    type: "Film",
    status: "casting",
    logline: "",
    location: "",
    dates: "",
    pay: "",
    union: "Non-Union",
    rolesNeeded: "",
    description: "",
    notes: "",
  });
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(readProjects());
  }, []);

  useEffect(() => {
    writeProjects(projects);
  }, [projects]);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((p) => p.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]);

  const defaultDrops: ProjectDrop[] = useMemo(
    () => [
      {
        id: "pd_overview",
        kind: "overview",
        title: "Overview",
        summary: "The quick view: status, logline, location, dates, pay.",
      },
      {
        id: "pd_casting",
        kind: "casting",
        title: "Casting",
        summary: "Roles needed, breakdown notes, audition pipeline.",
      },
      {
        id: "pd_crew",
        kind: "crew",
        title: "Crew",
        summary: "Crew needs, departments, rates, availability.",
      },
      {
        id: "pd_script",
        kind: "script",
        title: "Script",
        summary: "Script links, versions, locked pages, notes.",
      },
      {
        id: "pd_schedule",
        kind: "schedule",
        title: "Schedule",
        summary: "Shoot dates, call times, milestones.",
      },
      {
        id: "pd_assets",
        kind: "assets",
        title: "Assets",
        summary: "Lookbook, images, audio, key links.",
      },
      {
        id: "pd_links",
        kind: "links",
        title: "Links",
        summary: "External links: IMDb, Drive, Notion, decks.",
      },
      {
        id: "pd_notes",
        kind: "notes",
        title: "Notes",
        summary: "Internal notes, private reminders.",
      },
    ],
    []
  );

  const openCreate = () => {
    setDraftError(null);
    setDraft({
      title: "",
      type: "Film",
      status: "casting",
      logline: "",
      location: "",
      dates: "",
      pay: "",
      union: "Non-Union",
      rolesNeeded: "",
      description: "",
      notes: "",
    });
    setCreateOpen(true);
  };

  const createProject = () => {
    const title = String(draft.title ?? "").trim();
    if (!title) {
      setDraftError("Project title is required.");
      return;
    }

    const now = Date.now();
    const p: Project = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      title,
      type: String(draft.type ?? "Project"),
      status: (draft.status as ProjectStatus) ?? "casting",
      logline: String(draft.logline ?? ""),
      location: String(draft.location ?? ""),
      dates: String(draft.dates ?? ""),
      pay: String(draft.pay ?? ""),
      union: String(draft.union ?? ""),
      rolesNeeded: String(draft.rolesNeeded ?? ""),
      description: String(draft.description ?? ""),
      notes: String(draft.notes ?? ""),
      drops: defaultDrops.map((d) => ({ ...d, id: uid() })),
    };

    setProjects((prev) => [p, ...prev]);
    setCreateOpen(false);
    setActiveProjectId(p.id);
    setDropsOpen(false);
    setActiveDrop(null);
  };

  const updateProject = (id: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      )
    );
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setDropsOpen(false);
      setActiveDrop(null);
    }
  };

  // --------------------- PROJECTS TABLE VIEW ---------------------
  const ProjectsTable = () => (
    <TileFrame>
      <SectionHeader
        title="Projects Table"
        subtitle="A Backstage-inspired outlet where creators list, inspect, and book work."
      />

      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-white/70">
            Total: <span className="text-white/90 font-medium">{projects.length}</span>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className={clsx(
              "rounded-2xl border border-white/10 bg-white/5 px-4 py-2",
              "text-sm text-white/75 hover:bg-white/10 transition"
            )}
          >
            + New Project
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr] gap-3 px-2 pb-2 text-[11px] tracking-[0.30em] text-white/45">
              <div>PROJECT</div>
              <div>STATUS</div>
              <div>LOCATION</div>
              <div>DATES</div>
              <div>PAY</div>
            </div>

            <div className="grid gap-3">
              {projects.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  No projects yet. Create one and it’ll live here.
                </div>
              ) : (
                projects
                  .slice()
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActiveProjectId(p.id);
                        setDropsOpen(false);
                        setActiveDrop(null);
                      }}
                      className={clsx(
                        "w-full text-left rounded-3xl border border-white/10 bg-black/20",
                        "hover:bg-white/[0.06] transition shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                      )}
                    >
                      <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr] gap-3 p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/90 truncate">
                            {p.title}
                          </div>
                          <div className="mt-1 text-xs text-white/55 line-clamp-1">
                            {p.type} • {p.logline || "Add a logline to sell the vision."}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            Updated: {formatDate(p.updatedAt)}
                          </div>
                        </div>

                        <div className="text-sm text-white/70">{statusLabel(p.status)}</div>
                        <div className="text-sm text-white/70">{p.location || "—"}</div>
                        <div className="text-sm text-white/70">{p.dates || "—"}</div>
                        <div className="text-sm text-white/70">{p.pay || "—"}</div>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </TileFrame>
  );

  // --------------------- PROJECT PAGE VIEW ---------------------
  const ProjectPage = ({ p }: { p: Project }) => (
    <TileFrame>
      <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.35em] text-white/55">PROJECT PAGE</div>
            <div className="mt-2 text-xl font-semibold text-white/90 truncate">{p.title}</div>
            <div className="mt-1 text-sm text-white/55">
              {p.type} • {statusLabel(p.status)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveProjectId(null)}
              className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
              title="Back to Projects"
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={() => setDropsOpen((v) => !v)}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 hover:bg-white/10 transition"
              title="Open Project Drops"
            >
              Project Drops
            </button>

            <button
              type="button"
              onClick={() => deleteProject(p.id)}
              className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/60 hover:bg-black/40 transition"
              title="Delete Project"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Project Drops panel */}
        {dropsOpen ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-white/80 font-medium">Project Drops</div>
              <button
                type="button"
                onClick={() => {
                  setDropsOpen(false);
                  setActiveDrop(null);
                }}
                className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
              >
                Close
              </button>
            </div>

            <div className="mt-3">
              <DropGrid
                drops={p.drops?.length ? p.drops : defaultDrops.map((d) => ({ ...d, id: uid() }))}
                onPick={(d) => setActiveDrop(d)}
              />
            </div>

            {activeDrop ? (
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-4">
                <div className="text-sm font-semibold text-white/90">
                  {dropEmoji(activeDrop.kind)} {dropLabel(activeDrop.kind)}
                </div>
                <div className="mt-1 text-sm text-white/55">
                  {activeDrop.summary ?? "Drop opened."}
                </div>

                <div className="mt-3 text-xs text-white/45">
                  V1 behavior: drops open this inspector. Next step: connect each drop to its own
                  data + actions (casting posts, crew booking, asset pinning, etc.).
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Deep inspection: editable sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs tracking-[0.30em] text-white/45">QUICK FACTS</div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <label className="block">
                <div className="text-xs text-white/55 mb-2">Status</div>
                <select
                  value={p.status}
                  onChange={(e) => updateProject(p.id, { status: e.target.value as ProjectStatus })}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 focus:outline-none focus:ring-2 focus:ring-white/10"
                >
                  <option value="casting">Casting</option>
                  <option value="staffing">Staffing</option>
                  <option value="pre_production">Pre-Production</option>
                  <option value="production">Production</option>
                  <option value="post">Post</option>
                  <option value="released">Released</option>
                </select>
              </label>

              <label className="block">
                <div className="text-xs text-white/55 mb-2">Location</div>
                <input
                  value={p.location}
                  onChange={(e) => updateProject(p.id, { location: e.target.value })}
                  placeholder="City, State"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </label>

              <label className="block">
                <div className="text-xs text-white/55 mb-2">Dates</div>
                <input
                  value={p.dates}
                  onChange={(e) => updateProject(p.id, { dates: e.target.value })}
                  placeholder="Jan 20–Feb 3"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </label>

              <label className="block">
                <div className="text-xs text-white/55 mb-2">Pay</div>
                <input
                  value={p.pay}
                  onChange={(e) => updateProject(p.id, { pay: e.target.value })}
                  placeholder="Paid / Deferred / Profit-share"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </label>

              <label className="block">
                <div className="text-xs text-white/55 mb-2">Union</div>
                <input
                  value={p.union}
                  onChange={(e) => updateProject(p.id, { union: e.target.value })}
                  placeholder="Non-Union"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </label>

              <label className="block">
                <div className="text-xs text-white/55 mb-2">Roles Needed</div>
                <input
                  value={p.rolesNeeded}
                  onChange={(e) => updateProject(p.id, { rolesNeeded: e.target.value })}
                  placeholder="Lead actor, DP, HMU…"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs tracking-[0.30em] text-white/45">PITCH + INSPECTION</div>

            <label className="block mt-3">
              <div className="text-xs text-white/55 mb-2">Logline</div>
              <input
                value={p.logline}
                onChange={(e) => updateProject(p.id, { logline: e.target.value })}
                placeholder="One sentence that sells the project."
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
              />
            </label>

            <label className="block mt-3">
              <div className="text-xs text-white/55 mb-2">Description</div>
              <textarea
                value={p.description}
                onChange={(e) => updateProject(p.id, { description: e.target.value })}
                placeholder="Thorough overview: story, vibe, scope, what you’re hiring for."
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
              />
            </label>

            <label className="block mt-3">
              <div className="text-xs text-white/55 mb-2">Internal Notes</div>
              <textarea
                value={p.notes}
                onChange={(e) => updateProject(p.id, { notes: e.target.value })}
                placeholder="Private notes for your planning."
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
              />
            </label>

            <div className="mt-3 text-xs text-white/45">
              Updated: {formatDate(p.updatedAt)}
            </div>
          </div>
        </div>
      </div>
    </TileFrame>
  );

  return (
    <div className="w-full">
      {activeProject ? <ProjectPage p={activeProject} /> : <ProjectsTable />}

      {/* CREATE PROJECT MODAL */}
      {createOpen ? (
        <div className="fixed inset-0 z-[999]">
          <button
            type="button"
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close create project modal"
          />
          <div className="absolute left-1/2 top-1/2 w-[min(760px,92%)] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-3xl border border-white/10 bg-[#070913]/90 shadow-[0_20px_90px_rgba(0,0,0,0.65)] overflow-hidden">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="text-[11px] tracking-[0.35em] text-white/55">NEW PROJECT</div>
                  <div className="mt-2 text-xl font-semibold text-white/90">Create Project</div>
                  <div className="mt-1 text-sm text-white/55">
                    Build a project listing that creators can inspect like a Backstage breakdown.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 pb-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Title (required)</div>
                    <input
                      value={String(draft.title ?? "")}
                      onChange={(e) => {
                        setDraftError(null);
                        setDraft((p) => ({ ...p, title: e.target.value }));
                      }}
                      placeholder="Project name…"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Type</div>
                    <input
                      value={String(draft.type ?? "")}
                      onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}
                      placeholder="Film, Series, Music Video…"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                  </label>
                </div>

                <label className="block mt-3">
                  <div className="text-xs text-white/55 mb-2">Logline</div>
                  <input
                    value={String(draft.logline ?? "")}
                    onChange={(e) => setDraft((p) => ({ ...p, logline: e.target.value }))}
                    placeholder="One sentence pitch…"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Location</div>
                    <input
                      value={String(draft.location ?? "")}
                      onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))}
                      placeholder="City, State"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Status</div>
                    <select
                      value={(draft.status as ProjectStatus) ?? "casting"}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, status: e.target.value as ProjectStatus }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 focus:outline-none focus:ring-2 focus:ring-white/10"
                    >
                      <option value="casting">Casting</option>
                      <option value="staffing">Staffing</option>
                      <option value="pre_production">Pre-Production</option>
                      <option value="production">Production</option>
                      <option value="post">Post</option>
                      <option value="released">Released</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Dates</div>
                    <input
                      value={String(draft.dates ?? "")}
                      onChange={(e) => setDraft((p) => ({ ...p, dates: e.target.value }))}
                      placeholder="Jan 20–Feb 3"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs text-white/55 mb-2">Pay</div>
                    <input
                      value={String(draft.pay ?? "")}
                      onChange={(e) => setDraft((p) => ({ ...p, pay: e.target.value }))}
                      placeholder="Paid / Deferred / Profit-share"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                  </label>
                </div>

                <label className="block mt-3">
                  <div className="text-xs text-white/55 mb-2">Roles Needed</div>
                  <input
                    value={String(draft.rolesNeeded ?? "")}
                    onChange={(e) => setDraft((p) => ({ ...p, rolesNeeded: e.target.value }))}
                    placeholder="Lead actor, DP, HMU…"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                  />
                </label>

                <label className="block mt-3">
                  <div className="text-xs text-white/55 mb-2">Description</div>
                  <textarea
                    value={String(draft.description ?? "")}
                    onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Thorough overview for creators to inspect."
                    rows={5}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                  />
                </label>

                {draftError ? (
                  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                    {draftError}
                  </div>
                ) : null}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createProject}
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/85 hover:bg-white/15 transition"
                  >
                    Create Project
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-white/40">
              Tip: Projects are accessed through the Projects tile under Work Desk (not the dock).
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
