"use client";

import { formatUploadBytes, type BoardUploadProgress } from "@/lib/board/uploadProgress";
import "./boardUploadProgressBar.css";

export default function BoardUploadProgressBar({
  progress,
  className,
  title,
}: {
  progress: BoardUploadProgress | null | undefined;
  className?: string;
  title?: string;
}) {
  if (!progress) return null;
  return (
    <div
      className={`boardUploadProgress ${className ?? ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      {title ? <div className="boardUploadProgressTitle">{title}</div> : null}
      <div className="boardUploadProgressMeta">
        <span className="boardUploadProgressPercent">{progress.percent}%</span>
        <span className="boardUploadProgressBytes">{formatUploadBytes(progress.loaded, progress.total)}</span>
        <span className="boardUploadProgressEta">{progress.label}</span>
      </div>
      <div
        className="boardUploadProgressTrack"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={progress.label}
      >
        <div className="boardUploadProgressFill" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}
