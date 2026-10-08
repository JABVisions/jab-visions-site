/** Art Mode layer stack. Bottom layer is index 0. Capped so iPad stays off full-frame copies. */

export const MAX_ART_LAYERS = 4;

export type ArtLayer = {
  id: string;
  name: string;
  hidden?: boolean;
};

export function createArtLayer(index = 1, id?: string): ArtLayer {
  return {
    id: id || `layer-${index}-${Math.random().toString(16).slice(2, 6)}`,
    name: `Layer ${index}`,
  };
}

export function initialArtLayers(): ArtLayer[] {
  return [createArtLayer(1, "layer-1")];
}

export function addArtLayer(layers: ArtLayer[]): ArtLayer[] {
  if (layers.length >= MAX_ART_LAYERS) return layers;
  return [...layers, createArtLayer(layers.length + 1)];
}

export function deleteArtLayer(layers: ArtLayer[], id: string): ArtLayer[] {
  if (layers.length <= 1) return layers;
  const next = layers.filter((layer) => layer.id !== id);
  return next.length ? next : layers;
}

export function nextActiveArtLayer(layers: ArtLayer[], removedId: string, activeId: string): string {
  if (removedId !== activeId) return activeId;
  const index = layers.findIndex((layer) => layer.id === removedId);
  const neighbor = layers[index - 1] || layers[index + 1];
  return neighbor?.id || layers[0]?.id || activeId;
}

export function moveArtLayer(layers: ArtLayer[], id: string, direction: -1 | 1): ArtLayer[] {
  const index = layers.findIndex((layer) => layer.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return layers;
  const next = [...layers];
  const [moved] = next.splice(index, 1);
  next.splice(nextIndex, 0, moved);
  return next;
}

/** Paint order after dropping `draggedId` onto `targetId`. Dragged sits above the target. */
export function mergeArtLayerIds(layers: ArtLayer[], draggedId: string, targetId: string): string[] | null {
  if (draggedId === targetId) return null;
  const dragged = layers.find((layer) => layer.id === draggedId);
  const target = layers.find((layer) => layer.id === targetId);
  if (!dragged || !target) return null;
  return [target.id, dragged.id];
}

export function toggleArtLayerHidden(layers: ArtLayer[], id: string): ArtLayer[] {
  return layers.map((layer) => (layer.id === id ? { ...layer, hidden: !layer.hidden } : layer));
}

export type LayerDropAction =
  | { type: "merge"; draggedId: string; targetId: string }
  | { type: "reorder"; draggedId: string; index: number };

export type LayerTileBox = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Drag onto the middle of another tile merges. Drag toward an edge reorders. */
export function resolveLayerDrop(
  draggedId: string,
  tiles: LayerTileBox[],
  x: number,
  y: number
): LayerDropAction | null {
  const hit = tiles.find(
    (tile) => tile.id !== draggedId && x >= tile.left && x <= tile.right && y >= tile.top && y <= tile.bottom
  );
  if (!hit) return null;
  const mid = (hit.left + hit.right) / 2;
  const centerBand = (hit.right - hit.left) * 0.28;
  if (Math.abs(x - mid) <= centerBand) {
    return { type: "merge", draggedId, targetId: hit.id };
  }
  const visible = tiles.filter((tile) => tile.id !== draggedId);
  const index = visible.filter((tile) => (tile.left + tile.right) / 2 < x).length;
  return { type: "reorder", draggedId, index };
}

export function reorderArtLayerToIndex(layers: ArtLayer[], id: string, index: number): ArtLayer[] {
  const current = layers.findIndex((layer) => layer.id === id);
  if (current < 0) return layers;
  const next = layers.filter((layer) => layer.id !== id);
  const clamped = Math.max(0, Math.min(next.length, index));
  next.splice(clamped, 0, layers[current]);
  return next;
}
