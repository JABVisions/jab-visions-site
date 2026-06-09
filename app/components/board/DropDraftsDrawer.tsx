"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DROP_DRAFTS_UPDATED_EVENT,
  readDropDrafts,
  removeDropDraft,
  type DropDraft,
  type DropDraftKind,
} from "@/lib/board/dropDrafts";

type FilterKey = "all" | DropDraftKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Photos / Art" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Voice" },
];

function formatWhen(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(ts);
  } catch {
    return "";
  }
}

function kindLabel(kind: DropDraftKind) {
  return kind === "audio" ? "Voice" : kind === "video" ? "Video" : "Photo / Art";
}

export default function DropDraftsDrawer({
  open,
  onClose,
  onOpenDraft,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDraft?: (draft: DropDraft) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<DropDraft[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const sync = () => setDrafts(readDropDrafts());
    sync();
    window.addEventListener(DROP_DRAFTS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      window.removeEventListener(DROP_DRAFTS_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = { all: drafts.length, image: 0, video: 0, audio: 0 };
    for (const d of drafts) base[d.kind] += 1;
    return base;
  }, [drafts]);

  const visible = useMemo(
    () => (filter === "all" ? drafts : drafts.filter((d) => d.kind === filter)),
    [drafts, filter]
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="draftsOverlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="draftsDrawer" role="dialog" aria-modal="true" aria-label="Drop Studio drafts">
        <header className="draftsHead">
          <div>
            <p className="draftsEyebrow">Drop Studio</p>
            <h2 className="draftsTitle">Drafts</h2>
          </div>
          <button type="button" className="draftsClose" onClick={onClose} aria-label="Close drafts">
            ✕
          </button>
        </header>

        <div className="draftsFilters" role="tablist" aria-label="Filter drafts by type">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`draftsChip ${filter === f.key ? "on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="draftsChipCount">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="draftsList">
          {visible.length === 0 ? (
            <div className="draftsEmpty">
              {drafts.length === 0
                ? "No drafts yet. Captures in Drop Studio auto-save here."
                : "No drafts of this type."}
            </div>
          ) : (
            visible.map((draft) => (
              <article className="draftCard" key={draft.id}>
                <div className="draftPreview">
                  {draft.kind === "audio" ? (
                    <audio src={draft.dataUrl} controls preload="metadata" />
                  ) : draft.kind === "video" ? (
                    <video src={draft.dataUrl} controls playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.dataUrl} alt={draft.fileName} />
                  )}
                </div>
                <div className="draftMeta">
                  <span className="draftKind">{kindLabel(draft.kind)}</span>
                  <span className="draftWhen">{formatWhen(draft.createdAt)}</span>
                </div>
                <div className="draftActions">
                  <button
                    type="button"
                    className="draftBtn open"
                    onClick={() => onOpenDraft?.(draft)}
                  >
                    Open
                  </button>
                  <a className="draftBtn" href={draft.dataUrl} download={draft.fileName}>
                    Save
                  </a>
                  <button
                    type="button"
                    className="draftBtn danger"
                    onClick={() => removeDropDraft(draft.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <style jsx>{`
          .draftsOverlay {
            position: fixed;
            inset: 0;
            z-index: 100060;
            display: flex;
            justify-content: flex-end;
            background: rgba(4, 8, 14, 0.6);
            backdrop-filter: blur(8px);
          }
          .draftsDrawer {
            width: min(420px, 100vw);
            height: 100%;
            display: flex;
            flex-direction: column;
            padding: max(14px, env(safe-area-inset-top)) 16px max(14px, env(safe-area-inset-bottom));
            background:
              radial-gradient(circle at 18% 0%, rgba(82, 240, 213, 0.14), transparent 40%),
              linear-gradient(180deg, rgba(8, 26, 33, 0.96), rgba(6, 10, 22, 0.98));
            border-left: 1px solid rgba(132, 244, 231, 0.3);
            box-shadow: -18px 0 50px rgba(0, 0, 0, 0.5);
            color: #e8fff8;
          }
          .draftsHead {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }
          .draftsEyebrow {
            margin: 0;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: #7ff5e7;
          }
          .draftsTitle {
            margin: 4px 0 0;
            font-size: 1.3rem;
            font-weight: 900;
          }
          .draftsClose {
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.08);
            color: #e8fff8;
            width: 34px;
            height: 34px;
            cursor: pointer;
          }
          .draftsFilters {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            margin: 14px 0 10px;
          }
          .draftsChip {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            border-radius: 999px;
            padding: 7px 12px;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(232, 255, 248, 0.74);
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(167, 244, 232, 0.18);
            cursor: pointer;
          }
          .draftsChip.on {
            color: #06121a;
            background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
            border-color: rgba(255, 255, 255, 0.5);
          }
          .draftsChipCount {
            font-size: 10px;
            opacity: 0.8;
          }
          .draftsList {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            display: grid;
            gap: 12px;
            padding-right: 2px;
            align-content: start;
          }
          .draftsEmpty {
            margin-top: 24px;
            text-align: center;
            font-size: 13px;
            color: rgba(220, 255, 248, 0.55);
          }
          .draftCard {
            border-radius: 18px;
            border: 1px solid rgba(167, 244, 232, 0.16);
            background: rgba(255, 255, 255, 0.04);
            overflow: hidden;
          }
          .draftPreview {
            background: #02070a;
            display: grid;
            place-items: center;
          }
          .draftPreview img,
          .draftPreview video {
            display: block;
            width: 100%;
            max-height: 220px;
            object-fit: contain;
          }
          .draftPreview audio {
            width: 100%;
            padding: 14px;
          }
          .draftMeta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 9px 12px 0;
            font-size: 11px;
          }
          .draftKind {
            font-weight: 900;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: rgba(126, 246, 230, 0.9);
          }
          .draftWhen {
            color: rgba(220, 255, 248, 0.5);
          }
          .draftActions {
            display: flex;
            gap: 8px;
            padding: 10px 12px 12px;
          }
          .draftBtn {
            flex: 1 1 auto;
            text-align: center;
            border-radius: 12px;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #e8fff8;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(167, 244, 232, 0.2);
            cursor: pointer;
            text-decoration: none;
          }
          .draftBtn.open {
            color: #06121a;
            background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
            border-color: rgba(255, 255, 255, 0.5);
          }
          .draftBtn.danger {
            color: #ffc4dc;
            border-color: rgba(255, 146, 190, 0.4);
          }
        `}</style>
      </aside>
    </div>,
    document.body
  );
}
