"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DropDraftsDrawer.module.css";
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

  const uniqueDrafts = useMemo(() => {
    const byId = new Map<string, DropDraft>();
    for (const draft of drafts) {
      const prior = byId.get(draft.id);
      if (!prior || draft.createdAt >= prior.createdAt) byId.set(draft.id, draft);
    }
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [drafts]);

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
      all: uniqueDrafts.length + documents.length,
      image: 0,
      video: 0,
      audio: 0,
      document: documents.length,
      "art-project": artDraft ? 1 : 0,
    };
    base.all += artDraft ? 1 : 0;
    for (const d of uniqueDrafts) base[d.kind] += 1;
    return base;
  }, [uniqueDrafts, documents, artDraft]);

  const entries = useMemo(() => {
    const mediaEntries = (filter === "document" || filter === "art-project" ? [] : filter === "all" ? uniqueDrafts : uniqueDrafts.filter((d) => d.kind === filter))
      .map((draft) => ({ type: "media" as const, updatedAt: draft.createdAt, draft }));
    const documentEntries = (filter === "all" || filter === "document" ? documents : [])
      .map((doc) => ({ type: "document" as const, updatedAt: doc.updatedAt, doc }));
    const artEntries = artDraft && (filter === "all" || filter === "art-project")
      ? [{ type: "art" as const, updatedAt: artDraft.updatedAt, artDraft }]
      : [];
    return [...mediaEntries, ...documentEntries, ...artEntries].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [artDraft, documents, uniqueDrafts, filter]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`${styles.draftsScope} draftsOverlay`}
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
              const isAudioDraft = draft.kind === "audio";
              const hasAudioPreview = draft.kind === "audio" && draft.dataUrl.length > 160;
              return <article className={`draftCard ${isAudioDraft ? "voiceProjectCard" : ""}`} key={draft.id}>
                {isAudioDraft ? (
                  <div className="voiceProjectPreview">
                    <div className="voiceProjectArt" aria-hidden="true">
                      <span className="voiceProjectGlyph">🎙️</span>
                      <div className="voiceProjectWave">
                        {Array.from({ length: 32 }, (_, index) => (
                          <i key={index} style={{ height: `${18 + ((index * 17 + draft.id.length * 13) % 68)}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="voiceProjectSummary">
                      <span className="voiceProjectEyebrow">Voice Studio project</span>
                      <strong>{draft.fileName === "Voice Studio project" ? `Voice project ${draft.id.slice(-6)}` : draft.fileName}</strong>
                      <span>{hasAudioPreview ? "Preview ready" : "Auto-saved project"} · Edited {formatWhen(draft.createdAt)}</span>
                    </div>
                    {hasAudioPreview ? <audio className="voiceProjectPlayer" src={draft.dataUrl} controls preload="metadata" aria-label={`Preview ${draft.fileName}`} /> : null}
                  </div>
                ) : (
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
                )}
                <div className="draftMeta">
                  <span className="draftKind">{isAudioDraft ? "Voice Project" : kindLabel(draft.kind)}</span>
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
                    {isAudioDraft ? "Resume project" : "Open"}
                  </button>
                  {!isAudioDraft || hasAudioPreview ? (
                    <a className="draftBtn" href={draft.dataUrl} download={draft.fileName}>Save</a>
                  ) : null}
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

      </aside>
    </div>,
    document.body
  );
}
