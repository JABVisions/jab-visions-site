"use client";

import React, { useMemo, useState } from "react";
import { Modal } from "@/app/components/board/ui/Modal";

export type BoardDropKind = "image" | "video" | "document" | "link";

export type BoardDropPayload = {
  id: string;
  kind: BoardDropKind;
  title: string;
  url: string;            // dataURL for uploads (v1) or normal URL for links
  thumbUrl?: string;      // dataURL thumbnail when possible
  filename?: string;
  mimeType?: string;
  createdAt: number;
  tags?: string[];
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function kindIcon(kind: BoardDropKind) {
  if (kind === "image") return "🖼️";
  if (kind === "video") return "🎥";
  if (kind === "document") return "📄";
  return "🔗";
}

function acceptFor(kind: BoardDropKind) {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  if (kind === "document")
    return ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv,.zip";
  return "";
}

async function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

export function BoardDropButton({
  title = "Board Drop",
  subtitle = "Upload artwork, reels, docs, or links",
  onCreate,
  allowed = ["image", "video", "document", "link"],
  className = "",
}: {
  title?: string;
  subtitle?: string;
  onCreate: (drop: BoardDropPayload) => void;
  allowed?: BoardDropKind[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // modal state
  const [kind, setKind] = useState<BoardDropKind>(allowed[0] ?? "image");
  const [titleText, setTitleText] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  const kindOptions = useMemo(
    () =>
      (["image", "video", "document", "link"] as BoardDropKind[]).filter((k) =>
        allowed.includes(k)
      ),
    [allowed]
  );

  const reset = () => {
    setKind(allowed[0] ?? "image");
    setTitleText("");
    setTagsText("");
    setFile(null);
    setLinkUrl("");
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  const canSave =
    titleText.trim().length > 1 &&
    (kind === "link" ? linkUrl.trim().length > 5 : !!file);

  const save = async () => {
    if (!canSave) return;

    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (kind === "link") {
      onCreate({
        id: newId("drop"),
        kind,
        title: titleText.trim(),
        url: linkUrl.trim(),
        createdAt: Date.now(),
        tags,
      });
      close();
      return;
    }

    if (!file) return;

    // v1: dataURL for uploads (simple + local). Later: Supabase Storage.
    const dataUrl = await readAsDataURL(file);

    const payload: BoardDropPayload = {
      id: newId("drop"),
      kind,
      title: titleText.trim(),
      url: dataUrl,
      createdAt: Date.now(),
      tags,
      filename: file.name,
      mimeType: file.type,
    };

    // thumbnail for image; for others, we keep icon
    if (kind === "image") payload.thumbUrl = dataUrl;

    onCreate(payload);
    close();
  };

  return (
    <>
      {/* Tile button (soundtrack-tile inspired, pastel + green) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "w-full text-left rounded-3xl bg-white/80",
          "ring-1 ring-emerald-200",
          "shadow-[0_10px_30px_rgba(0,0,0,0.08)]",
          "p-4 md:p-5 hover:bg-white transition",
          className,
        ].join(" ")}
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-[#E7FFEE] ring-1 ring-emerald-200 flex items-center justify-center text-xl">
            ⬆️
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-emerald-800 truncate">
              {title}
            </div>
            <div className="text-xs text-emerald-700/70 truncate">
              {subtitle}
            </div>
          </div>

          <div className="rounded-2xl bg-[#E7FFEE] px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            Drop
          </div>
        </div>
      </button>

      {/* Modal */}
      <Modal open={open} title="Board Drop" onClose={close}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-emerald-800">
              Type
              <select
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as BoardDropKind;
                  setKind(next);
                  setFile(null);
                  setLinkUrl("");
                }}
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none"
              >
                {kindOptions.map((k) => (
                  <option key={k} value={k}>
                    {k.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-emerald-800">
              Tags (comma-separated)
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none"
                placeholder="Actor, NYC, Portfolio"
              />
            </label>
          </div>

          <label className="text-xs font-semibold text-emerald-800 block">
            Title
            <input
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none"
              placeholder="e.g., Reel 2026 / Headshot Set / Script PDF"
            />
          </label>

          {kind === "link" ? (
            <label className="text-xs font-semibold text-emerald-800 block">
              Link URL
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none"
                placeholder="https://..."
              />
            </label>
          ) : (
            <label className="text-xs font-semibold text-emerald-800 block">
              Upload ({kindIcon(kind)} {kind})
              <input
                type="file"
                accept={acceptFor(kind)}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none"
              />
              <div className="mt-2 text-[11px] text-emerald-700/70">
                v1 stores uploads locally. Next step: Supabase Storage for real uploads.
              </div>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={close}
              className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-[#E7FFEE]"
            >
              Cancel
            </button>
            <button
              disabled={!canSave}
              onClick={save}
              className="rounded-2xl bg-[#E7FFEE] px-4 py-2 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200 disabled:opacity-50 hover:bg-[#D7FFE3]"
            >
              Create Drop
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
