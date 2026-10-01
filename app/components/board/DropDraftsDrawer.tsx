"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DROP_DRAFTS_UPDATED_EVENT,
  readDropDrafts,
  removeDropDraft,
  renameDropDraft,
  setDropDraftStatus,
  duplicateDropDraft,
  type DropDraft,
  type DropDraftKind,
  type DropDraftStatus,
} from "@/lib/board/dropDrafts";
import {
  listCloudDropDrafts,
  hydrateCloudDropDraft,
  renameCloudDropDraft,
  setCloudDropDraftStatus,
  deleteCloudDropDraft,
  duplicateCloudDropDraft,
  type CloudDropDraft,
} from "@/lib/board/dropDraftsCloud";

type FilterKey = "all" | DropDraftKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Photos / Art" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Voice" },
];

const STATUS_CYCLE: DropDraftStatus[] = ["sketching", "editing", "ready"];
const STATUS_LABEL: Record<DropDraftStatus, string> = {
  sketching: "Sketching",
  editing: "Editing",
  ready: "Ready",
};

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

/** A card in the deck — either a local draft, a cloud-only draft from another device, or both merged. */
type DeckCard = {
  id: string;
  kind: DropDraftKind;
  title: string;
  status: DropDraftStatus;
  createdAt: number;
  count?: number;
  previewUrl?: string;
  local?: DropDraft;
  cloud?: CloudDropDraft;
  cloudOnly: boolean;
};

function kindForCloud(dropType: CloudDropDraft["dropType"]): DropDraftKind {
  if (dropType === "voice") return "audio";
  if (dropType === "video") return "video";
  return "image";
}

function mergeDecks(local: DropDraft[], cloud: CloudDropDraft[]): DeckCard[] {
  const byId = new Map<string, DeckCard>();
  for (const d of local) {
    byId.set(d.id, {
      id: d.id,
      kind: d.kind,
      title: d.title || "",
      status: d.status || "editing",
      createdAt: d.createdAt,
      count: d.count,
      previewUrl: d.dataUrl,
      local: d,
      cloudOnly: false,
    });
  }
  for (const c of cloud) {
    const existing = byId.get(c.id);
    if (existing) {
      existing.cloud = c;
      if (!existing.title) existing.title = c.title;
      continue;
    }
    const status: DropDraftStatus =
      c.status === "converted" || c.status === "archived" ? "ready" : c.status;
    byId.set(c.id, {
      id: c.id,
      kind: kindForCloud(c.dropType),
      title: c.title || "",
      status,
      createdAt: Date.parse(c.createdAt) || Date.now(),
      previewUrl: c.previewDataUrl,
      cloud: c,
      cloudOnly: true,
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
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
  const [cloudDrafts, setCloudDrafts] = useState<CloudDropDraft[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);

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
    let cancelled = false;
    void listCloudDropDrafts().then((rows) => {
      if (!cancelled) setCloudDrafts(rows);
    });
    return () => {
      cancelled = true;
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

  const deck = useMemo(() => mergeDecks(drafts, cloudDrafts), [drafts, cloudDrafts]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = { all: deck.length, image: 0, video: 0, audio: 0 };
    for (const d of deck) base[d.kind] += 1;
    return base;
  }, [deck]);

  const visible = useMemo(
    () => (filter === "all" ? deck : deck.filter((d) => d.kind === filter)),
    [deck, filter]
  );

  const handleOpen = useCallback(
    async (card: DeckCard) => {
      if (card.local) {
        onOpenDraft?.(card.local);
        return;
      }
      if (!card.cloud) return;
      setOpeningId(card.id);
      const hydrated = await hydrateCloudDropDraft(card.cloud);
      setOpeningId(null);
      if (hydrated) onOpenDraft?.(hydrated);
    },
    [onOpenDraft]
  );

  const handleRename = useCallback((card: DeckCard) => {
    const next = window.prompt("Rename draft", card.title || "")?.trim();
    if (next === undefined || next === "") return;
    if (card.local) renameDropDraft(card.id, next);
    void renameCloudDropDraft(card.id, next);
    setCloudDrafts((prev) => prev.map((c) => (c.id === card.id ? { ...c, title: next } : c)));
  }, []);

  const handleStatusCycle = useCallback((card: DeckCard) => {
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(card.status) + 1) % STATUS_CYCLE.length];
    if (card.local) setDropDraftStatus(card.id, nextStatus);
    void setCloudDropDraftStatus(card.id, nextStatus);
    setCloudDrafts((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: nextStatus } : c)));
  }, []);

  const handleDuplicate = useCallback(async (card: DeckCard) => {
    if (card.cloud) {
      const copy = await duplicateCloudDropDraft(card.id);
      if (copy) {
        await hydrateCloudDropDraft(copy);
        setCloudDrafts((prev) => [copy, ...prev]);
      }
      return;
    }
    duplicateDropDraft(card.id);
  }, []);

  const handleDelete = useCallback((card: DeckCard) => {
    if (!window.confirm(`Delete "${card.title || "this draft"}"? This can't be undone.`)) return;
    if (card.local) removeDropDraft(card.id);
    void deleteCloudDropDraft(card.id);
    setCloudDrafts((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="draftsOverlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="draftsDrawer" role="dialog" aria-modal="true" aria-label="Drop Studio Drafts Deck">
        <header className="draftsHead">
          <div>
            <p className="draftsEyebrow">Drop Studio</p>
            <h2 className="draftsTitle">Drafts Deck</h2>
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

        <div className="draftsDeck">
          {visible.length === 0 ? (
            <div className="draftsEmpty">
              {deck.length === 0
                ? "No drafts yet. Captures in Drop Studio auto-save here."
                : "No drafts of this type."}
            </div>
          ) : (
            visible.map((card) => (
              <article className="draftCard" key={card.id}>
                <div className="draftPreview">
                  {card.kind === "audio" ? (
                    card.previewUrl ? (
                      <audio src={card.previewUrl} controls preload="metadata" />
                    ) : (
                      <div className="draftFallback">🎙️</div>
                    )
                  ) : card.kind === "video" ? (
                    card.previewUrl ? (
                      <video src={card.previewUrl} controls playsInline preload="metadata" />
                    ) : (
                      <div className="draftFallback">🎬</div>
                    )
                  ) : card.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.previewUrl} alt={card.title || "Draft preview"} />
                  ) : (
                    <div className="draftFallback">🎨</div>
                  )}
                </div>
                <div className="draftMeta">
                  <span className="draftKind">{kindLabel(card.kind)}</span>
                  {card.count && card.count > 1 ? (
                    <span className="draftCount" title="Times this draft was saved">
                      🗂 {card.count}×
                    </span>
                  ) : null}
                  <span className="draftWhen">{formatWhen(card.createdAt)}</span>
                </div>
                <button
                  type="button"
                  className="draftNameBtn"
                  onClick={() => handleRename(card)}
                  title="Rename draft"
                >
                  {card.title || "Untitled draft"}
                </button>
                <button
                  type="button"
                  className={`draftStatus status-${card.status}`}
                  onClick={() => handleStatusCycle(card)}
                  title="Cycle draft status"
                >
                  {STATUS_LABEL[card.status]}
                </button>
                <div className="draftActions">
                  <button
                    type="button"
                    className="draftBtn open"
                    disabled={openingId === card.id}
                    onClick={() => void handleOpen(card)}
                  >
                    {openingId === card.id ? "Opening…" : "Open"}
                  </button>
                  <button type="button" className="draftBtn" onClick={() => void handleDuplicate(card)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="draftBtn danger"
                    onClick={() => handleDelete(card)}
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
            width: min(640px, 100vw);
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
          .draftsDeck {
            flex: 1 1 auto;
            min-height: 0;
            overflow-x: auto;
            overflow-y: hidden;
            display: flex;
            gap: 14px;
            padding: 2px 2px 10px;
            scroll-snap-type: x proximity;
            -webkit-overflow-scrolling: touch;
          }
          .draftsEmpty {
            margin-top: 24px;
            text-align: center;
            font-size: 13px;
            color: rgba(220, 255, 248, 0.55);
            width: 100%;
          }
          .draftCard {
            flex: 0 0 auto;
            width: min(240px, 72vw);
            scroll-snap-align: start;
            border-radius: 18px;
            border: 1px solid rgba(167, 244, 232, 0.16);
            background: rgba(255, 255, 255, 0.04);
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .draftPreview {
            background: #02070a;
            display: grid;
            place-items: center;
            height: 150px;
          }
          .draftPreview img,
          .draftPreview video {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .draftPreview audio {
            width: 100%;
            padding: 14px;
          }
          .draftFallback {
            font-size: 34px;
            opacity: 0.6;
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
          .draftNameBtn {
            margin: 8px 12px 0;
            text-align: left;
            background: none;
            border: none;
            padding: 0;
            color: #e8fff8;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .draftStatus {
            align-self: flex-start;
            margin: 6px 12px 0;
            border-radius: 999px;
            padding: 3px 10px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            border: 1px solid rgba(167, 244, 232, 0.25);
            background: rgba(255, 255, 255, 0.06);
            color: rgba(232, 255, 248, 0.75);
            cursor: pointer;
          }
          .draftStatus.status-ready {
            color: #06121a;
            background: radial-gradient(circle at 30% 20%, #d9ffb0, #7ee28a);
            border-color: rgba(255, 255, 255, 0.5);
          }
          .draftStatus.status-sketching {
            color: #ffe9b0;
            border-color: rgba(255, 201, 102, 0.4);
          }
          .draftActions {
            margin-top: auto;
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
