"use client";

import React, { useEffect, useMemo, useState } from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Media shown in the Project Drop thumbnail */
export type ProjectMedia =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string };

export type ProjectDrop = {
  id: string;

  title: string;
  logline: string;

  projectType: string;
  location: string;

  startDate: string;
  endDate?: string;

  unionStatus: string;
  compensationType: string;
  rate?: string;

  rolesNeeded: string;

  contactName: string;
  contactEmail: string;

  notes?: string;
  media?: ProjectMedia;

  createdAt: number;
};

const PROJECT_TYPES = [
  "Feature Film",
  "Short Film",
  "Web Series",
  "TV Pilot",
  "Music Video",
  "Commercial",
  "Photo Shoot",
  "Other",
] as const;

const UNION = ["Non-Union", "SAG-AFTRA", "Equity", "Other"] as const;

const COMP = ["Paid", "Deferred", "Unpaid", "Negotiable"] as const;

export default function ProjectDropMenu({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (drop: ProjectDrop) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // fields
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");

  const [projectType, setProjectType] =
    useState<(typeof PROJECT_TYPES)[number]>("Feature Film");
  const [location, setLocation] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [unionStatus, setUnionStatus] =
    useState<(typeof UNION)[number]>("Non-Union");
  const [compensationType, setCompensationType] =
    useState<(typeof COMP)[number]>("Negotiable");
  const [rate, setRate] = useState("");

  const [rolesNeeded, setRolesNeeded] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [notes, setNotes] = useState("");

  // Media: either a URL or uploaded file -> stored as dataURL for prototype reliability
  const [mediaKind, setMediaKind] = useState<ProjectMedia["kind"]>("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaDataUrl, setMediaDataUrl] = useState<string>("");

  const mediaPreview = useMemo(() => {
    const src = mediaDataUrl || mediaUrl;
    if (!src) return null;
    return { kind: mediaKind, src } as ProjectMedia;
  }, [mediaDataUrl, mediaUrl, mediaKind]);

  // Reset when opening (fresh slate)
  useEffect(() => {
    if (!open) return;
    setError(null);

    // optional: leave fields as-is if you prefer; for now we keep what you typed
    // If you want "always clear", uncomment the next line:
    // resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetAll() {
    setError(null);
    setTitle("");
    setLogline("");
    setProjectType("Feature Film");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setUnionStatus("Non-Union");
    setCompensationType("Negotiable");
    setRate("");
    setRolesNeeded("");
    setContactName("");
    setContactEmail("");
    setNotes("");
    setMediaKind("image");
    setMediaUrl("");
    setMediaDataUrl("");
  }

  async function onPickFile(file: File | null) {
    setError(null);
    if (!file) {
      setMediaDataUrl("");
      return;
    }

    // Light guardrails
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      setError("Please upload an image or video file.");
      return;
    }

    setMediaKind(isVideo ? "video" : "image");
    setMediaUrl(""); // prefer uploaded file if provided

    // Read as dataURL so it survives refresh (prototype)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataUrl) {
      setError("Couldn’t read that file. Try a different one.");
      return;
    }

    setMediaDataUrl(dataUrl);
  }

  function validate(): string | null {
    if (!title.trim()) return "Project title is required.";
    if (!logline.trim()) return "Logline is required.";
    if (!location.trim()) return "Location is required.";
    if (!startDate.trim()) return "Start date is required.";
    if (!unionStatus.trim()) return "Union status is required.";
    if (!compensationType.trim()) return "Compensation is required.";
    if (!rolesNeeded.trim()) return "Roles Needed is required.";
    if (!contactName.trim()) return "Contact name is required.";
    if (!contactEmail.trim()) return "Contact email is required.";

    // super light email check
    if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim()))
      return "Contact email looks invalid.";

    return null;
  }

  function handleCreate() {
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const id =
      (globalThis.crypto as any)?.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`;

    const drop: ProjectDrop = {
      id,
      title: title.trim(),
      logline: logline.trim(),

      projectType,
      location: location.trim(),

      startDate: startDate.trim(),
      endDate: endDate.trim() ? endDate.trim() : undefined,

      unionStatus,
      compensationType,
      rate: rate.trim() ? rate.trim() : undefined,

      rolesNeeded: rolesNeeded.trim(),

      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),

      notes: notes.trim() ? notes.trim() : undefined,
      media: mediaPreview ?? undefined,

      createdAt: Date.now(),
    };

    // ✅ This is the key: call onCreate reliably
    onCreate(drop);

    // Close + reset
    onClose();
    resetAll();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          onClose();
          // do NOT reset automatically on close; feels better to keep drafts
        }}
        aria-label="Close"
      />

      {/* modal */}
      <div
        className={clsx(
          "relative w-full max-w-3xl rounded-3xl border border-white/10",
          "bg-black/70 backdrop-blur-xl shadow-2xl overflow-hidden"
        )}
      >
        {/* header */}
        <div className="p-5 md:p-6 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white text-lg md:text-xl font-semibold">
                Drop Project
              </div>
              <div className="text-white/60 text-sm">
                Backstage-style, simplified.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-white">
              <span className="text-white/70">Fix:</span> {error}
            </div>
          )}
        </div>

        {/* body */}
        <div className="p-5 md:p-6 max-h-[75vh] overflow-auto">
          {/* Title + Logline */}
          <div className="grid grid-cols-1 gap-3">
            <Field label="Project Title *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Those Ryderz"
                className={inputClass}
              />
            </Field>

            <Field label="Logline *">
              <textarea
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                rows={3}
                placeholder="One sentence. Clean and punchy."
                className={textareaClass}
              />
            </Field>
          </div>

          {/* Type + Location */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Project Type *">
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as any)}
                className={selectClass}
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Location *">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="NYC"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Dates */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Start Date *">
              <input
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="07/01/2026"
                className={inputClass}
              />
            </Field>

            <Field label="End Date (optional)">
              <input
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="10/01/2026"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Union + Compensation */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Union Status *">
              <select
                value={unionStatus}
                onChange={(e) => setUnionStatus(e.target.value as any)}
                className={selectClass}
              >
                {UNION.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Compensation *">
              <select
                value={compensationType}
                onChange={(e) => setCompensationType(e.target.value as any)}
                className={selectClass}
              >
                {COMP.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <Field label="Rate / Pay Details (optional)">
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="$200/day, $500 flat, deferred + meals..."
                className={inputClass}
              />
            </Field>

            <Field label="Roles Needed *">
              <textarea
                value={rolesNeeded}
                onChange={(e) => setRolesNeeded(e.target.value)}
                rows={4}
                placeholder="Role name(s), age range, key traits. Keep it simple."
                className={textareaClass}
              />
            </Field>
          </div>

          {/* Contact */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Contact Name *">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Andy"
                className={inputClass}
              />
            </Field>

            <Field label="Contact Email *">
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="JohnAndyBooks@gmail.com"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Media */}
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-white/85 font-semibold">Media Thumbnail</div>
            <div className="mt-1 text-white/55 text-sm">
              This shows on the drop tile. Upload a file or paste a URL.
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Media Type">
                <select
                  value={mediaKind}
                  onChange={(e) => setMediaKind(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </Field>

              <Field label="Paste Media URL (optional)">
                <input
                  value={mediaUrl}
                  onChange={(e) => {
                    setMediaUrl(e.target.value);
                    if (e.target.value.trim()) setMediaDataUrl("");
                  }}
                  placeholder="https://..."
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <Field label="Upload File (optional)">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-white/70
                             file:mr-4 file:rounded-xl file:border file:border-white/15
                             file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-white
                             hover:file:bg-white/15"
                />
              </Field>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="text-xs text-white/50">Preview</div>
                <div className="mt-2 rounded-xl overflow-hidden border border-white/10 bg-black/40 h-32 flex items-center justify-center">
                  {!mediaPreview ? (
                    <div className="text-xs text-white/40">No media selected</div>
                  ) : mediaPreview.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaPreview.src}
                      alt="media preview"
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <video
                      src={mediaPreview.src}
                      className="w-full h-32 object-cover"
                      muted
                      playsInline
                      controls
                    />
                  )}
                </div>

                {(mediaDataUrl || mediaUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMediaUrl("");
                      setMediaDataUrl("");
                    }}
                    className="mt-2 text-xs text-white/70 hover:text-white underline"
                  >
                    Clear media
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4">
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any extra notes for applicants."
                className={textareaClass}
              />
            </Field>
          </div>
        </div>

        {/* footer */}
        <div className="p-5 md:p-6 border-t border-white/10 bg-black/40">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm text-white hover:bg-white/15 transition"
            >
              Create Project Drop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ UI helpers ------------------------------ */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-white/55">{label}</div>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/20";

const textareaClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/20 resize-none";

const selectClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/20";
