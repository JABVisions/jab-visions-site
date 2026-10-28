"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AudioWaveform from "./AudioWaveform";
import styles from "./DropDraftsDrawer.module.css";
import { deleteVoiceStudioProject, listVoiceStudioProjectCards, syncVoiceStudioProjectsToCloud } from "@/lib/board/voiceStudioProject";
import {
  DROP_DRAFTS_UPDATED_EVENT,
  readDropDrafts,
  removeDropDraft,
  renameDropDraft,
  restoreVoiceStudioDraftCards,
  syncLocalDropDraftsToCloud,
  type DropDraft,
  type DropDraftKind,
} from "@/lib/board/dropDrafts";
import {
  DESCRIPT_DOCS_UPDATED_EVENT,
  descriptPlainText,
  readDescriptDocs,
  removeDescriptDoc,
  sanitizeDescriptHtml,
  saveDescriptDoc,
  syncLocalDescriptDocsToCloud,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";
import {
  ART_DRAFT_UPDATED_EVENT,
  discardArtDraft,
  loadArtDraft,
  peekArtDraftMeta,
  restoreArtDraftFromCloud,
  syncCurrentArtDraftToCloud,
  type ArtDraftMeta,
} from "@/lib/board/artDraftSession";

type FilterKey = "all" | DropDraftKind | "document" | "art-project";

const VOICE_CARD_PLACEHOLDER =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

function draftsFromCloud(rows: unknown): DropDraft[] {
  if (!Array.isArray(rows)) return [];
  const drafts: DropDraft[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string") continue;
    const state = row.editor_state as Record<string, unknown> | null;
    const createdAt = row.updated_at ? Date.parse(String(row.updated_at)) || Date.now() : Date.now();
    if (state?.type === "media") {
      const kind = state.kind === "audio" || state.kind === "video" ? state.kind : "image";
      drafts.push({
        id: row.id,
        kind,
        dataUrl: "",
        fileName: String(state.fileName || "Untitled capture"),
        title: String(state.title || state.fileName || "Untitled capture"),
        mimeType: String(state.mimeType || "application/octet-stream"),
        createdAt: Number(state.createdAt) || createdAt,
        storageBucket: String(state.bucket || "board-media"),
        storagePath: String(state.storagePath || ""),
        remoteUrl: String(state.signedUrl || ""),
      });
    } else if (state?.type === "voice-project") {
      const files = Array.isArray(state.files) ? state.files as Array<Record<string, unknown>> : [];
      drafts.push({
        id: row.id,
        kind: "audio",
        dataUrl: VOICE_CARD_PLACEHOLDER,
        fileName: String(files.find((file) => file.name)?.name || "Voice Booth project"),
        title: String(state.title || files.find((file) => file.name)?.name || `Voice Booth project ${row.id.slice(-6)}`),
        mimeType: "audio/wav",
        createdAt,
        remoteProject: true,
      });
    }
  }
  return drafts;
}

function mergeDrafts(local: DropDraft[], cloud: DropDraft[]): DropDraft[] {
  const byId = new Map(cloud.map((draft) => [draft.id, draft]));
  for (const draft of local) {
    const remote = byId.get(draft.id);
    byId.set(draft.id, remote ? { ...remote, ...draft, remoteUrl: remote.remoteUrl, remoteProject: remote.remoteProject } : draft);
  }
  return [...byId.values()];
}

function artDraftFromCloud(rows: unknown): ArtDraftMeta | null {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((value) => {
    if (!value || typeof value !== "object") return false;
    return (value as Record<string, unknown>).editor_state &&
      ((value as Record<string, unknown>).editor_state as Record<string, unknown>).type === "art-project";
  }) as Record<string, unknown> | undefined;
  if (!row || typeof row.id !== "string") return null;
  const state = row.editor_state as Record<string, unknown>;
  const updatedAt = Number(state.updatedAt) || (row.updated_at ? Date.parse(String(row.updated_at)) : Date.now());
  return {
    draftId: "active-art",
    dropType: "art",
    lastLocalSave: 0,
    lastCloudSave: updatedAt,
    dirty: false,
    createdAt: updatedAt,
    updatedAt,
    paper: Boolean(state.paper),
    recovered: true,
    cloudId: row.id,
    remoteUrl: String(state.signedUrl || ""),
  };
}

function documentsFromCloud(rows: unknown): DescriptDoc[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const state = row.editor_state as Record<string, unknown> | null;
    if (typeof row.id !== "string" || state?.type !== "document") return [];
    return [{
      id: row.id,
      title: String(state.title || ""),
      html: sanitizeDescriptHtml(state.html),
      plainText: String(state.plainText || ""),
      description: typeof state.description === "string" ? state.description : undefined,
      createdAt: Number(state.createdAt) || Date.now(),
      updatedAt: Number(state.updatedAt) || (row.updated_at ? Date.parse(String(row.updated_at)) : Date.now()),
      sourceKind: state.sourceKind as DescriptDoc["sourceKind"],
      templateKey: typeof state.templateKey === "string" ? state.templateKey : undefined,
      destination: state.destination as DescriptDoc["destination"],
      workDropId: typeof state.workDropId === "string" ? state.workDropId : undefined,
    }];
  });
}

function mergeDocuments(local: DescriptDoc[], cloud: DescriptDoc[]): DescriptDoc[] {
  const byId = new Map(cloud.map((doc) => [doc.id, doc]));
  for (const doc of local) {
    const remote = byId.get(doc.id);
    byId.set(doc.id, !remote || doc.updatedAt >= remote.updatedAt ? doc : remote);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

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
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const uniqueDrafts = useMemo(() => {
    const byId = new Map<string, DropDraft>();
    for (const draft of drafts) {
      const prior = byId.get(draft.id);
      if (!prior || draft.createdAt >= prior.createdAt) byId.set(draft.id, draft);
    }
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [drafts]);

  const beginDraftRename = (draft: DropDraft) => {
    setRenamingDraftId(draft.id);
    setRenameValue(draft.title || draft.fileName || "Untitled draft");
  };

  const saveDraftRename = async (draft: DropDraft) => {
    const title = renameValue.trim().slice(0, 100);
    if (!title) return;
    const updated = { ...draft, title, createdAt: Date.now() };
    renameDropDraft(draft.id, title);
    setDrafts((current) => current.map((item) => item.id === draft.id ? updated : item));
    setRenamingDraftId(null);
    try {
      await fetch("/api/board/drop-drafts", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, title }),
      });
    } catch {
      // Keep the title locally; autosave will sync it when the network returns.
    }
  };

  const deleteDraft = (draft: DropDraft) => {
    removeDropDraft(draft.id);
    setDrafts((current) => current.filter((item) => item.id !== draft.id));
    if (draft.kind === "audio") void deleteVoiceStudioProject(draft.id);
    void fetch(`/api/board/drop-drafts?id=${encodeURIComponent(draft.id)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => undefined);
  };

  const saveDocumentRename = (doc: DescriptDoc) => {
    const title = renameValue.trim().slice(0, 100);
    if (!title) return;
    const updated = saveDescriptDoc({ ...doc, title });
    if (updated) setDocuments((current) => current.map((item) => item.id === doc.id ? updated : item));
    setRenamingDraftId(null);
  };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setFilter(initialFilter);
  }, [initialFilter, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const sync = () => {
      setDrafts((current) => mergeDrafts(readDropDrafts(), current.filter((draft) => draft.remoteUrl || draft.remoteProject)));
      setDocuments(readDescriptDocs());
      setArtDraft(peekArtDraftMeta());
    };
    const loadCloudDrafts = async () => {
      try {
        const response = await fetch("/api/board/drop-drafts", { cache: "no-store", credentials: "include" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled && body?.ok) {
          setDrafts(mergeDrafts(readDropDrafts(), draftsFromCloud(body.drafts)));
          setDocuments(mergeDocuments(readDescriptDocs(), documentsFromCloud(body.drafts)));
          const cloudArt = artDraftFromCloud(body.drafts);
          const localArt = peekArtDraftMeta();
          setArtDraft(localArt ? { ...cloudArt, ...localArt, cloudId: cloudArt?.cloudId, remoteUrl: cloudArt?.remoteUrl } : cloudArt);
        }
      } catch {
        // Local drafts remain available if the account sync cannot be reached.
      }
    };
    sync();
    void loadCloudDrafts();
    void Promise.all([syncLocalDropDraftsToCloud(), syncVoiceStudioProjectsToCloud(), syncLocalDescriptDocsToCloud(), syncCurrentArtDraftToCloud()])
      .then(() => loadCloudDrafts());
    void loadArtDraft().then(() => {
      const localArt = peekArtDraftMeta();
      if (localArt) setArtDraft((current) => current ? { ...current, ...localArt, cloudId: current.cloudId || localArt.cloudId, remoteUrl: current.remoteUrl || localArt.remoteUrl } : localArt);
    });
    void listVoiceStudioProjectCards().then((projects) => {
      if (cancelled || !projects.length) return;
      const restored = restoreVoiceStudioDraftCards(projects);
      if (!cancelled) {
        setDrafts((current) => mergeDrafts(restored, current.filter((draft) => draft.remoteUrl || draft.remoteProject)));
      }
    });
    window.addEventListener(DROP_DRAFTS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    window.addEventListener(DESCRIPT_DOCS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener(ART_DRAFT_UPDATED_EVENT, sync as EventListener);
    return () => {
      cancelled = true;
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
                      <button
                      type="button"
                      className="draftBtn open"
                      onClick={async () => {
                        if (entry.artDraft.remoteUrl && entry.artDraft.cloudId) {
                          try {
                            await restoreArtDraftFromCloud({
                              signedUrl: entry.artDraft.remoteUrl,
                              cloudId: entry.artDraft.cloudId,
                              updatedAt: entry.artDraft.updatedAt,
                              paper: entry.artDraft.paper,
                            });
                          } catch {
                            return;
                          }
                        }
                        onOpenArtDraft?.();
                      }}
                    >Resume art</button>
                    <button
                      type="button"
                      className="draftBtn danger"
                      onClick={() => {
                        void discardArtDraft(entry.artDraft.cloudId);
                        setArtDraft(null);
                      }}
                    >Delete</button>
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
                  {renamingDraftId === doc.id ? (
                    <div style={{ display: "flex", gap: 6, margin: "8px 12px 0" }}>
                      <input
                        autoFocus
                        aria-label="Draft title"
                        value={renameValue}
                        maxLength={100}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveDocumentRename(doc);
                          if (event.key === "Escape") setRenamingDraftId(null);
                        }}
                        style={{ minWidth: 0, flex: 1, height: 36, borderRadius: 8, padding: "0 8px" }}
                      />
                      <button type="button" className="draftBtn open" onClick={() => saveDocumentRename(doc)}>Save</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <h3 className="documentTitle" style={{ flex: 1 }}>{doc.title.trim() || "Untitled draft"}</h3>
                      <button
                        type="button"
                        className="draftBtn"
                        aria-label="Rename writing draft"
                        onClick={() => { setRenamingDraftId(doc.id); setRenameValue(doc.title); }}
                      >Rename</button>
                    </div>
                  )}
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
              const hasAudioPreview = isAudioDraft && Boolean(draft.remoteUrl || draft.dataUrl.length > 160);
              return <article
                className={`draftCard ${isAudioDraft ? "voiceProjectCard" : ""}`}
                key={draft.id}
                style={isAudioDraft ? {
                  display: "block",
                  minHeight: 170,
                  padding: 12,
                  border: "1px solid rgba(126, 246, 230, .42)",
                  borderRadius: 18,
                  background: "linear-gradient(145deg, rgba(17, 51, 60, .96), rgba(7, 17, 29, .98))",
                } : undefined}
              >
                {isAudioDraft ? (
                  <div className="voiceProjectPreview" style={{ display: "grid", gap: 10, padding: 0, background: "transparent" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%" }}>
                      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                        {renamingDraftId === draft.id ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              autoFocus
                              aria-label="Draft title"
                              value={renameValue}
                              maxLength={100}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveDraftRename(draft);
                                if (event.key === "Escape") setRenamingDraftId(null);
                              }}
                              style={{ minWidth: 0, flex: 1, height: 40, borderRadius: 9, padding: "0 10px", color: "#f2fffc", background: "#0b2028", border: "1px solid rgba(126,246,230,.45)", fontSize: 14 }}
                            />
                            <button type="button" onClick={() => void saveDraftRename(draft)} style={{ border: 0, borderRadius: 9, padding: "0 10px", background: "#7ee2ff", color: "#06121a", fontWeight: 900 }}>Save</button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <strong style={{ minWidth: 0, overflow: "hidden", color: "#f2fffc", fontSize: 16, lineHeight: 1.25, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {draft.title || ((draft.fileName === "Voice Studio project" || draft.fileName === "Voice Booth project") ? `Voice Booth project ${draft.id.slice(-6)}` : draft.fileName)}
                              </strong>
                              <button
                                type="button"
                                aria-label="Rename voice draft"
                                title="Rename draft"
                                onClick={() => beginDraftRename(draft)}
                                style={{ flex: "0 0 34px", width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(167,244,232,.3)", background: "rgba(255,255,255,.07)", color: "#bffcf4", fontSize: 17, cursor: "pointer" }}
                              >✎</button>
                            </div>
                            <span style={{ display: "block", marginTop: 4, color: "rgba(220,255,248,.56)", fontSize: 11 }}>
                              Voice project · Edited {formatWhen(draft.createdAt)}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete ${draft.title || draft.fileName || "voice draft"}`}
                        title="Delete draft"
                        onClick={() => deleteDraft(draft)}
                        style={{ appearance: "none", flex: "0 0 42px", width: 42, height: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: "1px solid rgba(255,90,116,.85)", background: "rgba(112,22,38,.88)", color: "#fff", fontSize: 25, lineHeight: 1, fontWeight: 700, cursor: "pointer", WebkitAppearance: "none" }}
                      >×</button>
                    </div>
                    <AudioWaveform
                      src={hasAudioPreview ? (draft.remoteUrl || draft.dataUrl) : null}
                      draftId={hasAudioPreview ? undefined : draft.id}
                      height={58}
                    />
                    {hasAudioPreview ? <audio className="voiceProjectPlayer" src={draft.remoteUrl || draft.dataUrl} controls preload="metadata" aria-label={`Preview ${draft.title || draft.fileName}`} /> : null}
                    <button
                      type="button"
                      onClick={() => { void onOpenDraft?.(draft); }}
                      style={{ appearance: "none", display: "inline-flex", width: "100%", minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,.75)", background: "linear-gradient(120deg, #fff, #7ee2ff)", color: "#06121a", fontSize: 12, fontWeight: 900, letterSpacing: ".04em", cursor: "pointer", WebkitAppearance: "none" }}
                    >
                      Resume project
                    </button>
                  </div>
                ) : (
                <div className="draftPreview">
                  {draft.kind === "audio" ? (
                    <audio src={draft.remoteUrl || draft.dataUrl} controls preload="metadata" />
                  ) : draft.kind === "video" ? (
                    <video src={draft.remoteUrl || draft.dataUrl} controls playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.remoteUrl || draft.dataUrl} alt={draft.fileName} />
                  )}
                </div>
                )}
                {!isAudioDraft ? (
                  <div className="draftMeta">
                    <span className="draftKind">{kindLabel(draft.kind)}</span>
                    {renamingDraftId === draft.id ? (
                      <>
                        <input
                          aria-label="Draft title"
                          value={renameValue}
                          maxLength={100}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveDraftRename(draft);
                            if (event.key === "Escape") setRenamingDraftId(null);
                          }}
                          style={{ minWidth: 0, flex: 1, height: 36, borderRadius: 8, padding: "0 8px" }}
                        />
                        <button type="button" className="draftBtn open" onClick={() => void saveDraftRename(draft)}>Save</button>
                      </>
                    ) : (
                      <>
                        <span className="draftFileName">{draft.title || draft.fileName || "Untitled capture"}</span>
                        <button type="button" className="draftBtn" aria-label="Rename draft" onClick={() => beginDraftRename(draft)}>Rename</button>
                      </>
                    )}
                    {draft.count && draft.count > 1 ? (
                      <span className="draftCount" title="Times this draft was saved">🗂 {draft.count}×</span>
                    ) : null}
                    <span className="draftWhen">Edited {formatWhen(draft.createdAt)}</span>
                  </div>
                ) : null}
                {!isAudioDraft ? (
                  <div className="draftActions">
                    <button type="button" className="draftBtn open" onClick={() => onOpenDraft?.(draft)}>Open</button>
                    <a className="draftBtn" href={draft.remoteUrl || draft.dataUrl} download={draft.fileName}>Save</a>
                    <button type="button" className="draftBtn danger" onClick={() => deleteDraft(draft)}>Delete</button>
                  </div>
                ) : null}
              </article>
            })
          )}
        </div>

      </aside>
    </div>,
    document.body
  );
}
