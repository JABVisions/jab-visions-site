"use client";

import { useRef, useState } from "react";
import { resolveLayerDrop, type ArtLayer, type LayerDropAction } from "@/lib/board/artLayers";
import styles from "./boardArtCanvas.module.css";

export default function ArtLayerStrip({
  layers,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onHide,
  onDrop,
}: {
  layers: ArtLayer[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onHide: (id: string) => void;
  onDrop: (action: LayerDropAction) => void;
}) {
  const tilesRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  function boxes() {
    return layers.flatMap((layer) => {
      const el = tilesRef.current.get(layer.id);
      if (!el) return [];
      const rect = el.getBoundingClientRect();
      return [{ id: layer.id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }];
    });
  }

  return (
    <div className={styles.layerStrip} aria-label="Art layers">
      <div className={styles.layerStripScroll}>
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            ref={(node) => {
              if (node) tilesRef.current.set(layer.id, node);
              else tilesRef.current.delete(layer.id);
            }}
            className={[
              styles.layerTile,
              layer.id === activeId ? styles.layerTileActive : styles.layerTileInactive,
              draggingId === layer.id ? styles.layerTileDragging : "",
              mergeTargetId === layer.id ? styles.layerTileMerge : "",
              layer.hidden ? styles.layerTileHidden : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={layer.id === activeId}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).dataset.layerAction) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { id: layer.id, x: event.clientX, y: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.id !== layer.id) return;
              if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
              drag.moved = true;
              setDraggingId(drag.id);
              const action = resolveLayerDrop(drag.id, boxes(), event.clientX, event.clientY);
              setMergeTargetId(action?.type === "merge" ? action.targetId : null);
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              dragRef.current = null;
              setDraggingId(null);
              setMergeTargetId(null);
              if (!drag) return;
              if (!drag.moved) {
                onSelect(drag.id);
                return;
              }
              const action = resolveLayerDrop(drag.id, boxes(), event.clientX, event.clientY);
              if (action) onDrop(action);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDraggingId(null);
              setMergeTargetId(null);
            }}
          >
            <span>{layer.name}</span>
            <span className={styles.layerTileTools}>
              <span
                data-layer-action="hide"
                role="presentation"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onHide(layer.id);
                }}
              >
                {layer.hidden ? "Show" : "Hide"}
              </span>
              {layers.length > 1 ? (
                <span
                  data-layer-action="delete"
                  role="presentation"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(layer.id);
                  }}
                >
                  ×
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={styles.addLayer} onClick={onAdd} disabled={layers.length >= 4}>
        Add layer
      </button>
    </div>
  );
}
