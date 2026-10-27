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
import {
  DESCRIPT_DOCS_UPDATED_EVENT,
  descriptPlainText,
  readDescriptDocs,
  removeDescriptDoc,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";
import {
  ART_DRAFT_UPDATED_EVENT,
  loadArtDraft,
  peekArtDraftMeta,
  type ArtDraftMeta,
} from "@/lib/board/artDraftSession";

type FilterKey = "all" | DropDraftKind | "document" | "art-project";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Photos / Art" },
  { key: "art-project", label: "Art Studio" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Voice" },
  { key: "document", label: "Writing" },
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
  initialFilter = "all",
  onClose,
  onOpenDraft,
  onOpenDescriptDoc,
  onOpenArtDraft,
}: {
  open: boolean;
  initialFilter?: FilterKey;
  onClose: () => void;
  onOpenDraft?: (draft: DropDraft) => void;
  onOpenDescriptDoc?: (doc: DescriptDoc) => void;
  onOpenArtDraft?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<DropDraft[]>([]);
  const [documents, setDocuments] = useState<DescriptDoc[]>([]);
  const [artDraft, setArtDraft] = useState<ArtDraftMeta | null>(null);
  const [filter, setFilter] = useState<FilterKey>(initialFilter);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setFilter(initialFilter);
  }, [initialFilter, open]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      setDrafts(readDropDrafts());
      setDocuments(readDescriptDocs());
      setArtDraft(peekArtDraftMeta());
    };
    sync();
    void loadArtDraft().then(() => setArtDraft(peekArtDraftMeta()));
    window.addEventListener(DROP_DRAFTS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    window.addEventListener(DESCRIPT_DOCS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener(ART_DRAFT_UPDATED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener(DROP_DRAFTS_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
      window.removeEventListener(DESCRIPT_DOCS_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener(ART_DRAFT_UPDATED_EVENT, sync as EventListener);
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
    const base: Record<FilterKey, number> = {
      all: drafts.length + documents.length,
      image: 0,
      video: 0,
      audio: 0,
      document: documents.length,
      "art-project": artDraft ? 1 : 0,
    };
    base.all += artDraft ? 1 : 0;
    for (const d of drafts) base[d.kind] += 1;
    return base;
  }, [drafts, documents, artDraft]);

  const entries = useMemo(() => {
    const mediaEntries = (filter === "document" || filter === "art-project" ? [] : filter === "all" ? drafts : drafts.filter((d) => d.kind === filter))
      .map((draft) => ({ type: "media" as const, updatedAt: draft.createdAt, draft }));
    const documentEntries = (filter === "all" || filter === "document" ? documents : [])
      .map((doc) => ({ type: "document" as const, updatedAt: doc.updatedAt, doc }));
    const artEntries = artDraft && (filter === "all" || filter === "art-project")
      ? [{ type: "art" as const, updatedAt: artDraft.updatedAt, artDraft }]
      : [];
    return [...mediaEntries, ...documentEntries, ...artEntries].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [artDraft, documents, drafts, filter]);

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
            <p className="draftsSubtitle">Unfinished work, ready when you are.</p>
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
          {entries.length === 0 ? (
            <div className="draftsEmpty">
              {drafts.length === 0 && documents.length === 0 && !artDraft
                ? "Your unfinished captures and writing will show up here."
                : "No drafts of this type."}
            </div>
          ) : (
            entries.map((entry) => {
              if (entry.type === "art") {
                return <article className="draftCard documentCard" key={entry.artDraft.draftId}>
                  <div className="documentPreview" aria-hidden="true">🎨</div>
                  <div className="documentInfo">
                    <div className="draftMeta">
                      <span className="draftKind">Art Studio</span>
                      <span className="draftWhen">Edited {formatWhen(entry.artDraft.updatedAt)}</span>
                    </div>
                    <h3 className="documentTitle">Canvas in progress</h3>
                    <p className="documentExcerpt">Pick up where you left off in Art Studio.</p>
                    <div className="draftActions">
                      <button type="button" className="draftBtn open" onClick={onOpenArtDraft}>Resume art</button>
                    </div>
                  </div>
                </article>;
              }
              if (entry.type === "document") {
                const doc = entry.doc;
                return <article className="draftCard documentCard" key={doc.id}>
                <div className="documentPreview" aria-hidden="true">✍️</div>
                <div className="documentInfo">
                  <div className="draftMeta">
                    <span className="draftKind">Writing</span>
                    <span className="draftWhen">Edited {formatWhen(doc.updatedAt)}</span>
                  </div>
                  <h3 className="documentTitle">{doc.title.trim() || "Untitled draft"}</h3>
                  <p className="documentExcerpt">
                    {descriptPlainText(doc.html).trim().slice(0, 150) || "An unfinished Descript document"}
                  </p>
                  <div className="draftActions">
                    <button type="button" className="draftBtn open" onClick={() => onOpenDescriptDoc?.(doc)}>
                      Resume writing
                    </button>
                    <button type="button" className="draftBtn danger" onClick={() => removeDescriptDoc(doc.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
              }
              const draft = entry.draft;
              return <article className="draftCard" key={draft.id}>
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
                  <span className="draftFileName">{draft.fileName || "Untitled capture"}</span>
                  {draft.count && draft.count > 1 ? (
                    <span className="draftCount" title="Times this draft was saved">
                      🗂 {draft.count}×
                    </span>
                  ) : null}
                  <span className="draftWhen">Edited {formatWhen(draft.createdAt)}</span>
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
            })
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
          .draftsSubtitle {
            margin: 4px 0 0;
            color: rgba(220, 255, 248, 0.58);
            font-size: 12px;
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
          .documentCard { display: grid; grid-template-columns: 66px minmax(0, 1fr); }
          .documentPreview {
            display: grid;
            place-items: center;
            min-height: 100%;
            background: linear-gradient(145deg, rgba(82, 240, 213, 0.16), rgba(126, 226, 255, 0.08));
            font-size: 24px;
          }
          .documentInfo { min-width: 0; padding: 10px 10px 0 0; }
          .documentTitle { margin: 8px 12px 0; overflow: hidden; color: #f2fffc; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
          .documentExcerpt { margin: 5px 12px 0; color: rgba(220, 255, 248, 0.56); font-size: 11px; line-height: 1.45; }
          .draftFileName { flex: 1 1 auto; overflow: hidden; color: rgba(232,255,248,.72); text-overflow: ellipsis; white-space: nowrap; }
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
          .draftCount {
            font-weight: 900;
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
