"use client";

import React from "react";
import type { ProjectDrop } from "./ProjectDropMenu";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ProjectDropCard({
  drop,
  isOpen,
  onReview,
  onExit,
  onRequestCall,
}: {
  drop: ProjectDrop;
  isOpen: boolean;
  onReview: (drop: ProjectDrop) => void;
  onExit: () => void;
  onRequestCall: (drop: ProjectDrop) => void;
}) {
  return (
    <div
      className={clsx(
        "w-full rounded-2xl border border-white/10 bg-black/30 overflow-hidden",
        "hover:bg-black/40 hover:border-white/20 transition"
      )}
    >
      {/* Title ABOVE like standard drop tiles */}
      <div className="p-4 md:p-5 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base md:text-lg font-semibold text-white truncate">
              {drop.title}
            </div>
            <div className="mt-1 text-sm text-white/70 line-clamp-2">
              {drop.logline}
            </div>
          </div>

          <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            {drop.projectType}
          </div>
        </div>
      </div>

      {/* Thumbnail media */}
      <div className="relative">
        {drop.media ? (
          drop.media.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={drop.media.src}
              alt={`${drop.title} thumbnail`}
              className="w-full h-44 md:h-56 object-cover"
            />
          ) : (
            <video
              src={drop.media.src}
              className="w-full h-44 md:h-56 object-cover"
              muted
              playsInline
              controls
            />
          )
        ) : (
          <div className="w-full h-44 md:h-56 bg-white/5 flex items-center justify-center text-sm text-white/40">
            No media thumbnail yet
          </div>
        )}

        {/* Review button */}
        {!isOpen && (
          <div className="absolute bottom-3 right-3">
            <button
              type="button"
              onClick={() => onReview(drop)}
              className="rounded-xl border border-white/20 bg-black/55 px-4 py-2 text-sm text-white hover:bg-black/70 transition"
            >
              Review
            </button>
          </div>
        )}
      </div>

      {/* Gift-open details window inside the drop */}
      {isOpen && (
        <div className="p-4 md:p-5 border-t border-white/10 bg-black/35">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-semibold text-sm md:text-base">
                Details
              </div>
              <div className="mt-1 text-white/60 text-xs md:text-sm">
                This is the embedded review window. Request a call, or exit.
              </div>
            </div>

            <button
              type="button"
              onClick={onExit}
              className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
            >
              Exit
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoBox label="Location" value={drop.location} />
            <InfoBox
              label="Dates"
              value={`${drop.startDate}${drop.endDate ? ` to ${drop.endDate}` : ""}`}
            />
            <InfoBox label="Union" value={drop.unionStatus} />
            <InfoBox
              label="Compensation"
              value={`${drop.compensationType}${drop.rate ? ` • ${drop.rate}` : ""}`}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/50">Roles Needed</div>
            <div className="mt-1 text-sm text-white/80 whitespace-pre-wrap">
              {drop.rolesNeeded}
            </div>
          </div>

          {drop.notes ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs text-white/50">Notes</div>
              <div className="mt-1 text-sm text-white/75 whitespace-pre-wrap">
                {drop.notes}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-white/50 truncate">
              Contact:{" "}
              <span className="text-white/70">
                {drop.contactName} • {drop.contactEmail}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onRequestCall(drop)}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 transition"
            >
              Request Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-sm text-white/80 truncate">{value}</div>
    </div>
  );
}
