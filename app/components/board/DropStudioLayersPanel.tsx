"use client";

// Drop Studio — unified Layers panel. One ordered stack (bottom → top) across
// every Art Mode drawing layer, text label, and sticker on the drop: rename,
// reorder (drag the handle), duplicate, delete, show/hide, lock, and set
// opacity — a compact chip list, not a Photoshop sidebar.

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, GripVertical, Lock, LockOpen, Plus } from "lucide-react";
import styles from "./DropStudio.module.css";

export type LayerRowKind = "art" | "text" | "sticker";

export type LayerRowThumb =
  | { type: "image"; src: string }
  | { type: "emoji"; value: string }
  | { type: "text"; value: string }
  | { type: "empty" };

export type LayerRow = {
  id: string;
  kind: LayerRowKind;
  name: string;
  visible: boolean;
  locked: boolean;
  thumb: LayerRowThumb;
  isActive: boolean;
};

function kindLabel(kind: LayerRowKind) {
  if (kind === "art") return "Drawing";
  if (kind === "text") return "Text";
  return "Sticker";
}

function LayerThumb({ thumb }: { thumb: LayerRowThumb }) {
  if (thumb.type === "image") {
    return <img className={styles.layerThumbImg} src={thumb.src} alt="" draggable={false} />;
  }
  if (thumb.type === "emoji") {
    return <span className={styles.layerThumbEmoji}>{thumb.value}</span>;
  }
  if (thumb.type === "text") {
    return <span className={styles.layerThumbText}>{thumb.value.slice(0, 2).toUpperCase()}</span>;
  }
  return <span className={styles.layerThumbEmpty} aria-hidden />;
}

export default function DropStudioLayersPanel({
  rows,
  onSelect,
  onRename,
  onToggleVisible,
  onToggleLock,
  onReorder,
  onNewArtLayer,
}: {
  /** Bottom → top. */
  rows: LayerRow[];
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  /** Final commit only — a full id order, bottom → top. */
  onReorder: (orderedIds: string[]) => void;
  onNewArtLayer: () => void;
}) {
  const [order, setOrder] = useState<string[]>(() => rows.map((r) => r.id));
  const orderRef = useRef(order);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const draggingIdRef = useRef<string | null>(null);
  const rowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (draggingIdRef.current) return; // don't fight an in-flight drag
    const nextOrder = rows.map((r) => r.id);
    orderRef.current = nextOrder;
    setOrder(nextOrder);
  }, [rows]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Render top → bottom (most-on-top first) so the list visually matches the stack.
  const displayOrder = [...order].reverse();
  function startDrag(id: string) {
    draggingIdRef.current = id;
    setDragId(id);
  }

  function endDrag() {
    draggingIdRef.current = null;
    setDragId(null);
  }

  function updateOrder(nextOrder: string[]) {
    orderRef.current = nextOrder;
    setOrder(nextOrder);
    onReorder(nextOrder);
  }

  function pointerMoveWhileDragging(clientY: number) {
    const id = draggingIdRef.current;
    if (!id) return;
    const entries = displayOrder
      .map((rowId) => ({ rowId, el: rowElsRef.current.get(rowId) }))
      .filter((e): e is { rowId: string; el: HTMLDivElement } => Boolean(e.el));
    if (!entries.length) return;

    let targetTopToBottomIndex = entries.length - 1;
    for (let i = 0; i < entries.length; i++) {
      const rect = entries[i].el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetTopToBottomIndex = i;
        break;
      }
    }
    const targetId = entries[targetTopToBottomIndex].rowId;
    if (targetId === id) return;

    const current = orderRef.current;
    const from = current.indexOf(id);
    // displayOrder is reversed (top-first); convert to bottom-up index.
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, id);
    updateOrder(next);
  }

  return (
    <div className={styles.layersPanel}>
      <div className={styles.layersPanelHead}>
        <span>Top layers appear first. Drag to restack your artwork.</span>
        <div className={styles.layersPanelHeadActions}>
          <button type="button" onClick={onNewArtLayer} aria-label="Add a new drawing layer">
            <Plus aria-hidden size={14} strokeWidth={2.5} />
            Layer
          </button>
        </div>
      </div>

      <div
        className={styles.layersList}
        ref={listRef}
        onPointerMove={(e) => draggingIdRef.current && pointerMoveWhileDragging(e.clientY)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {displayOrder.map((id) => {
          const row = byId.get(id);
          if (!row) return null;
          const isRenaming = renamingId === row.id;
          return (
            <div
              key={row.id}
              ref={(el) => {
                if (el) rowElsRef.current.set(row.id, el);
                else rowElsRef.current.delete(row.id);
              }}
              className={[
                styles.layerCard,
                row.isActive ? styles.layerCardActive : "",
                !row.visible ? styles.layerCardHidden : "",
                dragId === row.id ? styles.layerCardDragging : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(row.id)}
            >
              <button
                type="button"
                className={styles.dragHandle}
                aria-label={`Reorder ${row.name}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startDrag(row.id);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical aria-hidden size={15} />
              </button>

              <div className={styles.layerThumbWrap}>
                <LayerThumb thumb={row.thumb} />
              </div>

              <div className={styles.layerMeta}>
                {isRenaming ? (
                  <input
                    autoFocus
                    className={styles.layerNameInput}
                    value={draftName}
                    maxLength={40}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => {
                      onRename(row.id, draftName.trim() || row.name);
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.layerName}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftName(row.name);
                      setRenamingId(row.id);
                    }}
                    title="Rename layer"
                  >
                    {row.name}
                  </button>
                )}
                <span className={styles.layerKind}>{kindLabel(row.kind)}</span>
              </div>

              <div className={styles.layerControls} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={[styles.iconToggle, row.visible ? styles.iconToggleOn : ""].join(" ")}
                  aria-pressed={row.visible}
                  aria-label={row.visible ? "Hide layer" : "Show layer"}
                  onClick={() => onToggleVisible(row.id)}
                >
                  {row.visible ? <Eye aria-hidden size={14} /> : <EyeOff aria-hidden size={14} />}
                </button>
                <button
                  type="button"
                  className={[styles.iconToggle, row.locked ? styles.iconToggleOn : ""].join(" ")}
                  aria-pressed={row.locked}
                  aria-label={row.locked ? "Unlock layer" : "Lock layer"}
                  onClick={() => onToggleLock(row.id)}
                >
                  {row.locked ? <Lock aria-hidden size={14} /> : <LockOpen aria-hidden size={14} />}
                </button>
              </div>
            </div>
          );
        })}
        {!displayOrder.length ? (
          <div className={styles.layersEmpty}>
            No layers yet — draw something, add text, or drop in a sticker to start the stack.
          </div>
        ) : null}
      </div>
    </div>
  );
}
