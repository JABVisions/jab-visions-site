"use client";

import type { ArtLayer } from "@/lib/board/artLayers";
import styles from "./boardArtCanvas.module.css";

export default function ArtLayerStrip({
  layers,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  onMerge,
}: {
  layers: ArtLayer[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onMerge: (id: string) => void;
}) {
  return (
    <div className={styles.layerStrip} aria-label="Art layers">
      <div className={styles.layerStripScroll}>
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`${styles.layerTile} ${layer.id === activeId ? styles.layerTileActive : ""}`}
          >
            <button type="button" onClick={() => onSelect(layer.id)} aria-pressed={layer.id === activeId}>
              {layer.name}
            </button>
            <div className={styles.layerTileActions}>
              <button type="button" disabled={index === 0} onClick={() => onMove(layer.id, -1)} aria-label={`Move ${layer.name} down`}>
                ↓
              </button>
              <button
                type="button"
                disabled={index === layers.length - 1}
                onClick={() => onMove(layer.id, 1)}
                aria-label={`Move ${layer.name} up`}
              >
                ↑
              </button>
              <button type="button" disabled={index === 0} onClick={() => onMerge(layer.id)} aria-label={`Merge ${layer.name} down`}>
                Merge
              </button>
              <button type="button" disabled={layers.length < 2} onClick={() => onDelete(layer.id)} aria-label={`Delete ${layer.name}`}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className={styles.addLayer} onClick={onAdd} disabled={layers.length >= 4}>
        Add layer
      </button>
    </div>
  );
}
