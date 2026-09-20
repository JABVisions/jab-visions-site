"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_IMAGE_MIN_LONG_EDGE,
  isHeicFile,
  prepareBoardImageFile,
  PROJECT_COVER_MAX_LONG_EDGE,
} from "@/lib/board/imageQuality";
import { parseBoardStorageFromUrl } from "@/lib/board/musicPlayback";
import { uploadProjectCover } from "@/lib/board/projectCoverUpload";
import { checkUploadSize } from "@/lib/board/uploadLimits";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function fileToDataUrl(
  file: File,
  opts: { maxWidth: number; maxHeight: number; quality?: number }
) {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    const timer = window.setTimeout(() => {
      reader.abort();
      reject(new Error("Could not read that file."));
    }, 8_000);
    reader.onloadend = () => window.clearTimeout(timer);
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error("That image could not be opened.")), 8_000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("That image could not be opened."));
    };
    img.src = source;
  });

  const scale = Math.min(1, opts.maxWidth / image.width, opts.maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not available.");

  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", opts.quality ?? 0.84);
}

/** Media shown in the Project Drop thumbnail */
export type ProjectMedia = {
  kind: "image" | "video";
  src: string;
  bucket?: string;
  storagePath?: string;
};

export type ProjectDrop = {
  id: string;

  title: string;
  logline: string;

  projectType: string;
  status: ProjectDropStatus;
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
  goal?: string;
  milestone?: string;
  media?: ProjectMedia;

  createdAt: number;
};

export type ProjectDropStatus =
  | "casting"
  | "staffing"
  | "pre_production"
  | "production"
  | "post"
  | "released";

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

const PROJECT_STATUSES: Array<{ value: ProjectDropStatus; label: string }> = [
  { value: "casting", label: "Casting" },
  { value: "staffing", label: "Staffing" },
  { value: "pre_production", label: "Pre-Production" },
  { value: "production", label: "Production" },
  { value: "post", label: "Post" },
  { value: "released", label: "Released" },
];

const UNION = ["Non-Union", "SAG-AFTRA", "Equity", "Other"] as const;

const COMP = ["Paid", "Deferred", "Unpaid", "Negotiable"] as const;

type ProjectDropDraft = {
  id?: string;
  title?: string;
  logline?: string;
  projectType?: string;
  status?: ProjectDropStatus;
  location?: string;
  startDate?: string;
  endDate?: string;
  unionStatus?: string;
  compensationType?: string;
  rate?: string;
  rolesNeeded?: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  goal?: string;
  milestone?: string;
  media?: ProjectMedia;
  createdAt?: number;
};

export default function ProjectDropMenu({
  open,
  onClose,
  onCreate,
  onUpdate,
  initialProject,
  defaultHostName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (drop: ProjectDrop) => void | Promise<void>;
  onUpdate?: (drop: ProjectDrop) => void | Promise<void>;
  initialProject?: ProjectDropDraft | null;
  defaultHostName?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  // fields
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");

  const [projectType, setProjectType] = useState<string>("Feature Film");
  const [status, setStatus] = useState<ProjectDropStatus>("casting");
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
  const [goal, setGoal] = useState("");
  const [milestone, setMilestone] = useState("");

  // Media: either a URL or uploaded file -> stored as dataURL for prototype reliability
  const [mediaKind, setMediaKind] = useState<ProjectMedia["kind"]>("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaDataUrl, setMediaDataUrl] = useState<string>("");
  const [mediaBucket, setMediaBucket] = useState("");
  const [mediaStoragePath, setMediaStoragePath] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const editing = Boolean(initialProject?.id);
  const mediaFileRef = useRef<File | null>(null);
  const previewObjectUrlRef = useRef<string>("");
  const coverRef = useRef({ bucket: "", path: "", url: "" });
  const uploadPromiseRef = useRef<Promise<void> | null>(null);
  const uploadGenerationRef = useRef(0);
  const publishingRef = useRef(false);

  function revokePreviewObjectUrl() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = "";
    }
  }

  function setPreviewFromFile(file: File) {
    revokePreviewObjectUrl();
    const url = URL.createObjectURL(file);
    previewObjectUrlRef.current = url;
    setMediaDataUrl(url);
  }

  const mediaPreview = useMemo(() => {
    const src = mediaDataUrl || mediaUrl;
    if (!src && !mediaStoragePath) return null;
    return {
      kind: mediaKind,
      src: src || "",
      ...(mediaBucket ? { bucket: mediaBucket } : {}),
      ...(mediaStoragePath ? { storagePath: mediaStoragePath } : {}),
    } as ProjectMedia;
  }, [mediaDataUrl, mediaUrl, mediaKind, mediaBucket, mediaStoragePath]);

  // Hydrate create drafts vs edit fields when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!initialProject?.id) {
      setContactName((current) =>
        current.trim() ? current : (defaultHostName || "").trim()
      );
      return;
    }
    setTitle(initialProject.title || "");
    setLogline(initialProject.logline || "");
    setProjectType(initialProject.projectType || "Feature Film");
    setStatus(initialProject.status || "casting");
    setLocation(initialProject.location || "");
    setStartDate(initialProject.startDate || "");
    setEndDate(initialProject.endDate || "");
    setUnionStatus(
      (UNION as readonly string[]).includes(initialProject.unionStatus || "")
        ? (initialProject.unionStatus as (typeof UNION)[number])
        : "Non-Union"
    );
    setCompensationType(
      (COMP as readonly string[]).includes(initialProject.compensationType || "")
        ? (initialProject.compensationType as (typeof COMP)[number])
        : "Negotiable"
    );
    setRate(initialProject.rate || "");
    setRolesNeeded(initialProject.rolesNeeded || "");
    setContactName(initialProject.contactName || defaultHostName || "");
    setContactEmail(initialProject.contactEmail || "");
    setNotes(initialProject.notes || "");
    setGoal(initialProject.goal || "");
    setMilestone(initialProject.milestone || "");
    const media = initialProject.media;
    setMediaKind(media?.kind === "video" ? "video" : "image");
    rememberCover({
      bucket: media?.bucket || "",
      path: media?.storagePath || "",
      url: media?.src || "",
    });
    revokePreviewObjectUrl();
    setMediaDataUrl(media?.src?.startsWith("data:") || media?.src?.startsWith("blob:") ? media.src : "");
    setPublishing(false);
    publishingRef.current = false;
  }, [open, initialProject, defaultHostName]);

  useEffect(() => {
    return () => {
      revokePreviewObjectUrl();
    };
  }, []);

  useEffect(() => {
    if (!mediaUploading) return;
    const timer = window.setTimeout(() => setMediaUploading(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [mediaUploading]);

  function rememberCover(next: { bucket?: string; path?: string; url?: string }) {
    coverRef.current = {
      bucket: next.bucket || "",
      path: next.path || "",
      url: next.url || "",
    };
    setMediaBucket(coverRef.current.bucket);
    setMediaStoragePath(coverRef.current.path);
    setMediaUrl(coverRef.current.url);
  }

  async function sendCoverToBoard(file: File, generation: number) {
    const uploaded = await uploadProjectCover(file);
    if (generation !== uploadGenerationRef.current) return;
    if (!uploaded) return;
    rememberCover({
      bucket: uploaded.bucket,
      path: uploaded.storagePath,
      url: uploaded.imageUrl,
    });
  }

  function resetAll() {
    setError(null);
    setTitle("");
    setLogline("");
    setProjectType("Feature Film");
    setStatus("casting");
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
    setGoal("");
    setMilestone("");
    setMediaKind("image");
    setMediaUrl("");
    setMediaDataUrl("");
    setMediaBucket("");
    setMediaStoragePath("");
    setMediaUploading(false);
    setPublishing(false);
    publishingRef.current = false;
    revokePreviewObjectUrl();
    mediaFileRef.current = null;
    coverRef.current = { bucket: "", path: "", url: "" };
    uploadPromiseRef.current = null;
    uploadGenerationRef.current += 1;
  }

  async function onPickFile(file: File | null) {
    setError(null);
    uploadGenerationRef.current += 1;
    const generation = uploadGenerationRef.current;
    rememberCover({});
    if (!file) {
      revokePreviewObjectUrl();
      setMediaDataUrl("");
      mediaFileRef.current = null;
      setMediaUploading(false);
      uploadPromiseRef.current = null;
      return;
    }

    const isImage =
      file.type.startsWith("image/") ||
      isHeicFile(file) ||
      /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name);
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);

    if (!isVideo && !isImage) {
      setError("Please upload an image or video file.");
      return;
    }

    if (isVideo) {
      const sizeError = checkUploadSize(file, "video");
      if (sizeError) {
        setError(sizeError);
        return;
      }
      setMediaKind("video");
      mediaFileRef.current = file;
      setPreviewFromFile(file);
      setMediaUploading(true);
      const job = (async () => {
        try {
          const { uploadBoardMediaFile } = await import("@/lib/board/boardMediaUpload");
          const uploaded = await uploadBoardMediaFile(file, {
            folder: "project-media",
          });
          if (generation !== uploadGenerationRef.current) return;
          if (!uploaded) {
            setError("Couldn’t upload that video. Check your connection and try again.");
            return;
          }
          rememberCover({
            bucket: uploaded.bucket,
            path: uploaded.storagePath,
            url: uploaded.signedUrl || uploaded.publicUrl,
          });
        } catch {
          if (generation !== uploadGenerationRef.current) return;
          setError("Couldn’t upload that video. Try again.");
        } finally {
          if (generation !== uploadGenerationRef.current) return;
          setMediaUploading(false);
          uploadPromiseRef.current = null;
        }
      })();
      uploadPromiseRef.current = job;
      return;
    }

    const sizeError = checkUploadSize(file, "image");
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setMediaKind("image");
    mediaFileRef.current = file;
    setPreviewFromFile(file);
    setMediaUploading(true);

    const job = (async () => {
      try {
        const prepared = await prepareBoardImageFile(file, {
          minLongEdge: BOARD_IMAGE_MIN_LONG_EDGE,
          maxLongEdge: PROJECT_COVER_MAX_LONG_EDGE,
        });
        if (generation !== uploadGenerationRef.current) return;
        mediaFileRef.current = prepared;
        setPreviewFromFile(prepared);
        await sendCoverToBoard(prepared, generation);
      } catch {
        if (generation !== uploadGenerationRef.current) return;
        const fallback = await fileToDataUrl(file, {
          maxWidth: PROJECT_COVER_MAX_LONG_EDGE,
          maxHeight: PROJECT_COVER_MAX_LONG_EDGE,
          quality: 0.84,
        }).catch(() => "");
        if (fallback) {
          revokePreviewObjectUrl();
          setMediaDataUrl(fallback);
        } else if (!mediaDataUrl) {
          setError("Couldn’t read that file. Try a different photo.");
        }
      } finally {
        if (generation !== uploadGenerationRef.current) return;
        setMediaUploading(false);
        uploadPromiseRef.current = null;
      }
    })();
    uploadPromiseRef.current = job;
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
    if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim()))
      return "Contact email looks invalid.";

    return null;
  }

  async function handleCreate() {
    if (publishingRef.current) return;
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    publishingRef.current = true;
    setPublishing(true);

    if (!coverRef.current.path && uploadPromiseRef.current) {
      await Promise.race([
        uploadPromiseRef.current,
        new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
      ]);
    }

    const coverBucket = coverRef.current.bucket || mediaBucket;
    const coverPath = coverRef.current.path || mediaStoragePath;
    const coverUrl = coverRef.current.url || mediaUrl;

    const id = editing
      ? String(initialProject?.id)
      : (globalThis.crypto as any)?.randomUUID?.() ??
        `${Date.now()}-${Math.random()}`;

    const drop: ProjectDrop = {
      id,
      title: title.trim(),
      logline: logline.trim(),

      projectType,
      status,
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
      goal: goal.trim() ? goal.trim() : undefined,
      milestone: milestone.trim() ? milestone.trim() : undefined,
      media: coverPath
        ? {
            kind: mediaKind,
            src: coverUrl || mediaDataUrl || "",
            bucket: coverBucket || undefined,
            storagePath: coverPath,
          }
        : mediaPreview ?? undefined,

      createdAt: editing ? Number(initialProject?.createdAt || Date.now()) : Date.now(),
    };

    try {
      if (editing) {
        if (!onUpdate) throw new Error("missing update handler");
        await onUpdate(drop);
      } else {
        await onCreate(drop);
      }
    } catch {
      setError(editing ? "Couldn’t update that Project Drop. Try again." : "Couldn’t post that Project Drop. Try Submit again.");
      publishingRef.current = false;
      setPublishing(false);
      return;
    }

    onClose();
    resetAll();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto px-4 py-6 md:py-10"
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
      <form
        className={clsx(
          "relative my-auto w-full max-w-3xl rounded-3xl border border-white/10",
          "bg-black/70 backdrop-blur-xl shadow-2xl overflow-hidden"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          handleCreate();
        }}
        style={{ maxHeight: "min(900px, calc(100vh - 3rem))" }}
      >
        {/* header */}
        <div className="p-5 md:p-6 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white text-lg md:text-xl font-semibold">
                {editing ? "Update Project Drop" : "Drop Project"}
              </div>
              <div className="text-white/60 text-sm">
                {editing
                  ? "Edit the project details, then save them back to the notebook."
                  : "Build the project, then publish it into the community feed."}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="submit"
                disabled={publishing}
                className="rounded-2xl border border-lime-300/30 bg-lime-400/20 px-4 py-2 text-sm font-semibold text-lime-50 hover:bg-lime-400/25 transition disabled:opacity-60"
              >
                {publishing ? (editing ? "Saving…" : "Posting…") : editing ? "Save Update" : "Publish to Community"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-white">
              <span className="text-white/70">Fix:</span> {error}
            </div>
          )}
        </div>

        {/* body */}
        <div className="p-5 md:p-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 18rem)" }}>
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
                onChange={(e) => setProjectType(e.target.value)}
                className={selectClass}
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {projectType && !(PROJECT_TYPES as readonly string[]).includes(projectType) ? (
                  <option value={projectType}>{projectType}</option>
                ) : null}
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

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Project Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectDropStatus)}
                className={selectClass}
              >
                {PROJECT_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Goal / Milestone (optional)">
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Build the pitch deck, cast leads, finish concept trailer..."
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <Field label="Next Milestone (optional)">
              <textarea
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
                rows={2}
                placeholder="What should collaborators know is next?"
                className={textareaClass}
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
              This shows on the drop tile. Upload an image or paste a hosted image/video URL.
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
                      const value = e.target.value;
                      setMediaUrl(value);
                      if (value.trim()) {
                        revokePreviewObjectUrl();
                        setMediaDataUrl("");
                      }
                      const parsed = parseBoardStorageFromUrl(value.trim());
                      rememberCover({
                        bucket: parsed?.bucket || "",
                        path: parsed?.storagePath || "",
                        url: value,
                      });
                    }}
                  placeholder="https://..."
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <Field label="Upload File (optional)">
                <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-100/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50 shadow-[0_0_18px_rgba(103,232,249,0.10)] transition hover:-translate-y-0.5 hover:bg-cyan-100/15">
                  {mediaUploading ? "Uploading" : "Upload"}
                  <input
                    type="file"
                    accept="image/*,image/heic,image/heif,.heic,.heif,video/*"
                    onChange={(e) => {
                      const next = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onPickFile(next);
                    }}
                    className="sr-only"
                  />
                </label>
                <div className="mt-2 min-h-5 max-w-full truncate text-xs font-semibold text-white/55">
                  {mediaStoragePath
                    ? "Cover uploaded to Board."
                    : mediaUploading
                      ? mediaDataUrl
                        ? "Cover attached. Sending to Board…"
                        : "Preparing photo..."
                      : mediaDataUrl
                        ? "Media attached from this device."
                        : "Select image or video from this device."}
                </div>
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
                      uploadGenerationRef.current += 1;
                      uploadPromiseRef.current = null;
                      revokePreviewObjectUrl();
                      setMediaDataUrl("");
                      mediaFileRef.current = null;
                      rememberCover({});
                      setMediaUploading(false);
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
        <div className="sticky bottom-0 p-5 md:p-6 border-t border-white/10 bg-black/75 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">
              {editing
                ? "This will update the project tile in your notebook"
                : "This will create the project tile and add the drop to Community Feed"}
            </div>

            <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={publishing}
              className="rounded-2xl border border-lime-300/30 bg-lime-400/20 px-5 py-2.5 text-sm font-semibold text-lime-50 hover:bg-lime-400/25 transition disabled:opacity-60"
            >
              {publishing
                ? editing
                  ? "Saving…"
                  : "Posting…"
                : editing
                  ? "Update Project Drop"
                  : "Submit Project Drop to Community"}
            </button>
            </div>
          </div>
        </div>
      </form>
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
