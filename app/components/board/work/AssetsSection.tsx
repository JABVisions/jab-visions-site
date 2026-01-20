"use client";

import React, { useMemo } from "react";
import type { WorkState } from "./types";
import { BoardDropButton, type BoardDropPayload } from "@/app/components/board/ui/BoardDropButton";

function iconFor(kind: string) {
  if (kind === "image") return "🖼️";
  if (kind === "video") return "🎥";
  if (kind === "document") return "📄";
  return "🔗";
}

export function AssetsSection({
  state,
  onChange,
}: {
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const drops = useMemo(
    () => [...state.assets].sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [state.assets]
  );

  const addDrop = (drop: BoardDropPayload) => {
    // Map BoardDropPayload into your existing WorkState.assets item shape.
    // We keep it compatible by storing:
    // - type: derived from kind
    // - url, thumbUrl, tags, createdAt
    const mapped: any = {
      id: drop.id,
      type:
        drop.kind === "image"
          ? "Artwork"
          : drop.kind === "video"
          ? "Video Reel"
          : drop.kind === "document"
          ? "Link"
          : "Link",
      title: drop.title,
      url: drop.url,
      thumbUrl: drop.thumbUrl,
      tags: drop.tags ?? [],
      visibility: "Public",
      createdAt: drop.createdAt,
      kind: drop.kind,
      filename: drop.filename,
      mimeType: drop.mimeType,
    };

    onChange({ ...state, assets: [mapped, ...state.assets] });
  };

  const recent = drops.slice(0, 9);

  return (
    <div className="space-y-4">
      {/* Universal Board Drop tile */}
      <BoardDropButton
        title="Board Drop"
        subtitle="Upload artwork, reels, documents, or links"
        onCreate={addDrop}
        allowed={["image", "video", "document", "link"]}
      />

      {/* Recent drops (small portal gallery, not a table) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {recent.map((d: any) => (
          <a
            key={d.id}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className={[
              "rounded-3xl bg-white/80 ring-1 ring-emerald-200",
              "shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden",
              "hover:bg-white transition",
            ].join(" ")}
          >
            <div className="h-32 bg-white flex items-center justify-center">
              {d.thumbUrl ? (
                <img src={d.thumbUrl} alt={d.title} className="h-full w-full object-cover" />
              ) : (
                <div className="text-4xl">{iconFor(d.kind || "link")}</div>
              )}
            </div>
            <div className="p-4">
              <div className="text-sm font-extrabold text-emerald-800 truncate">
                {d.title}
              </div>
              <div className="mt-1 text-xs text-emerald-700/70 truncate">
                {d.kind ? d.kind.toUpperCase() : "DROP"}
                {d.filename ? ` • ${d.filename}` : ""}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
