// app/components/board/projects/ProjectDropMenu.tsx
"use client";

import React, { useMemo, useState } from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ProjectType =
  | "Feature Film"
  | "Short Film"
  | "Series"
  | "Music Video"
  | "Commercial"
  | "Stage"
  | "Social"
  | "Other";

export type UnionStatus = "Non-Union" | "SAG-AFTRA" | "Equity" | "Other";

export type CompensationType =
  | "Paid"
  | "Unpaid"
  | "Deferred"
  | "Copy / Credit"
  | "Negotiable";

export type ProjectDrop = {
  id: string;

  // Backstage-lite essentials
  title: string;
  logline: string;
  projectType: ProjectType;

  location: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;

  unionStatus: UnionStatus;
  compensationType: CompensationType;
  rate?: string;

  rolesNeeded: string; // free text list (simple)

  contactName: string;
  contactEmail: string;

  notes?: string;

  createdAt: number;
};

const PROJECT_TYPES: ProjectType[] = [
  "Feature Film",
  "Short Film",
  "Series",
  "Music Video",
  "Commercial",
  "Stage",
  "Social",
  "Other",
];

const UNION_STATUS: UnionStatus[] = ["Non-Union", "SAG-AFTRA", "Equity", "Other"];

const COMP_TYPES: CompensationType[] = [
  "Paid",
  "Unpaid",
  "Deferred",
  "Copy / Credit",
  "Negotiable",
];

function uid() {
  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export default function ProjectDropMenu({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (drop: ProjectDrop) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("Feature Film");

  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");

  const [unionStatus, setUnionStatus] = useState<UnionStatus>("Non-Union");
  const [compensationType, setCompensationType] =
    useState<CompensationType>("Paid");
  const [rate, setRate] = useState("");

  const [rolesNeeded, setRolesNeeded] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setLogline("");
    setProjectType("Feature Film");
    setLocation("");
    setStartDate(today);
    setEndDate("");
    setUnionStatus("Non-Union");
    setCompensationType("Paid");
    setRate("");
    setRolesNeeded("");
    setContactName("");
    setContactEmail("");
    setNotes("");
    setError(null);
  }

  function validateEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  function handleCreate() {
    setError(null);

    if (!title.trim()) return setError("Project title is required.");
    if (!logline.trim()) return setError("Logline is required.");
    if (!location.trim()) return setError("Location is required.");
    if (!startDate.trim()) return setError("Start date is required.");
    if (!rolesNeeded.trim()) return setError("Roles needed is required.");
    if (!contactName.trim()) return setError("Contact name is required.");
    if (!contactEmail.trim()) return setError("Contact email is required.");
    if (!validateEmail(contactEmail)) return setError("Contact email looks invalid.");

    const drop: ProjectDrop = {
      id: uid(),
      title: title.trim(),
      logline: logline.trim(),
      projectType,
      location: location.trim(),
      startDate,
      endDate: endDate.trim() ? endDate.trim() : undefined,
      unionStatus,
      compensationType,
      rate: rate.trim() ? rate.trim() : undefined,
      rolesNeeded: rolesNeeded.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      notes: notes.trim() ? notes.trim() : undefined,
      createdAt: Date.now(),
    };

    onCreate(drop);
    reset();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={clsx(
          "w-full md:max-w-3xl",
          "rounded-t-3xl md:rounded-3xl",
          "border border-white/10 bg-black/60",
          "shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-white font-semibold text-lg">Drop Project</div>
            <div className="text-white/60 text-sm">
              Backstage-style, simplified.
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setError(null);
              onClose();
            }}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white">
              <span className="text-white/70">Fix:</span>{" "}
              <span className="text-white">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">Project Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="THOSE RYDERZ (Feature Film)"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {/* Logline */}
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">Logline *</label>
              <textarea
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                placeholder="One sentence that sells the vibe."
                rows={3}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none resize-none"
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-white/60">Project Type *</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="text-xs text-white/60">Location *</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="NYC, Remote, Atlanta..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {/* Dates */}
            <div>
              <label className="text-xs text-white/60">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/60">End Date (optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {/* Union */}
            <div>
              <label className="text-xs text-white/60">Union Status *</label>
              <select
                value={unionStatus}
                onChange={(e) => setUnionStatus(e.target.value as UnionStatus)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              >
                {UNION_STATUS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Compensation */}
            <div>
              <label className="text-xs text-white/60">Compensation *</label>
              <select
                value={compensationType}
                onChange={(e) =>
                  setCompensationType(e.target.value as CompensationType)
                }
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              >
                {COMP_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate */}
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">
                Rate / Pay Details (optional)
              </label>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="$200/day, $500 flat, deferred + meals..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {/* Roles needed */}
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">Roles Needed *</label>
              <textarea
                value={rolesNeeded}
                onChange={(e) => setRolesNeeded(e.target.value)}
                placeholder="Lead Actor (18-25), DP, HMU, PA..."
                rows={3}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none resize-none"
              />
              <div className="mt-2 text-xs text-white/40">
                Keep it simple. No giant breakdowns yet.
              </div>
            </div>

            {/* Contact */}
            <div>
              <label className="text-xs text-white/60">Contact Name *</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Andy"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/60">Contact Email *</label>
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="name@email.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra info for the team (tone, refs, timeline)."
                rows={3}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="rounded-xl border border-white/20 bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/15 transition"
          >
            Create Project Drop
          </button>
        </div>
      </div>
    </div>
  );
}
