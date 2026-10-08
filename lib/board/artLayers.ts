/** Art Mode layer stack. Bottom layer is index 0. Capped so iPad stays off full-frame copies. */

export const MAX_ART_LAYERS = 4;

export type ArtLayer = {
  id: string;
  name: string;
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
