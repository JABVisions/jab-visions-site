"use client";

import { useRef, useState, type RefObject } from "react";
import {
  addArtLayer,
  deleteArtLayer,
  initialArtLayers,
  mergeArtLayerIds,
  moveArtLayer,
  nextActiveArtLayer,
  reorderArtLayerToIndex,
  toggleArtLayerHidden,
  type ArtLayer,
} from "@/lib/board/artLayers";

/** One transparent canvas per layer, shared by Art Mode and the Vision/Video overlay. */
export function useArtLayerCanvases(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  ctxRef: RefObject<CanvasRenderingContext2D | null>
) {
  const [layers, setLayers] = useState<ArtLayer[]>(() => initialArtLayers());
  const [activeLayerId, setActiveLayerId] = useState("layer-1");
  const layersRef = useRef(layers);
  const activeLayerRef = useRef(activeLayerId);
  const storesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  layersRef.current = layers;
  activeLayerRef.current = activeLayerId;

  function storeFor(id: string, width: number, height: number) {
    let stored = storesRef.current.get(id);
    if (!stored) {
      stored = document.createElement("canvas");
      stored.width = width;
      stored.height = height;
      storesRef.current.set(id, stored);
    }
    return stored;
  }

  function stashActiveLayer() {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 1) return;
    const stored = storeFor(activeLayerRef.current, canvas.width, canvas.height);
    if (stored.width !== canvas.width || stored.height !== canvas.height) {
      const previous = document.createElement("canvas");
      previous.width = stored.width;
      previous.height = stored.height;
      previous.getContext("2d")?.drawImage(stored, 0, 0);
      stored.width = canvas.width;
      stored.height = canvas.height;
      stored.getContext("2d")?.drawImage(previous, 0, 0, stored.width, stored.height);
    }
    const storedCtx = stored.getContext("2d");
    storedCtx?.clearRect(0, 0, stored.width, stored.height);
    storedCtx?.drawImage(canvas, 0, 0);
  }

  function showLayer(id: string) {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const stored = storesRef.current.get(id);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (stored) ctx.drawImage(stored, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function selectLayer(id: string) {
    if (id === activeLayerRef.current) return;
    stashActiveLayer();
    setActiveLayerId(id);
    showLayer(id);
  }

  function addLayer() {
    const next = addArtLayer(layersRef.current);
    if (next.length === layersRef.current.length) return;
    stashActiveLayer();
    const created = next[next.length - 1];
    const canvas = canvasRef.current;
    if (canvas) {
      const blank = storeFor(created.id, canvas.width, canvas.height);
      blank.getContext("2d")?.clearRect(0, 0, blank.width, blank.height);
    }
    commitLayers(next);
    setActiveLayerId(created.id);
    showLayer(created.id);
  }

  function removeLayer(id: string) {
    const current = layersRef.current;
    const next = deleteArtLayer(current, id);
    if (next.length === current.length) return;
    stashActiveLayer();
    storesRef.current.delete(id);
    const active = nextActiveArtLayer(current, id, activeLayerRef.current);
    commitLayers(next);
    setActiveLayerId(active);
    showLayer(active);
  }

  function commitLayers(next: ArtLayer[]) {
    layersRef.current = next;
    setLayers(next);
  }

  function moveLayer(id: string, direction: -1 | 1) {
    commitLayers(moveArtLayer(layersRef.current, id, direction));
  }

  function reorderLayer(id: string, index: number) {
    commitLayers(reorderArtLayerToIndex(layersRef.current, id, index));
  }

  function mergeLayers(draggedId: string, targetId: string) {
    const current = layersRef.current;
    if (!mergeArtLayerIds(current, draggedId, targetId)) return;
    stashActiveLayer();
    const target = storesRef.current.get(targetId);
    const dragged = storesRef.current.get(draggedId);
    if (target && dragged) target.getContext("2d")?.drawImage(dragged, 0, 0);
    storesRef.current.delete(draggedId);
    commitLayers(deleteArtLayer(current, draggedId));
    setActiveLayerId(targetId);
    showLayer(targetId);
  }

  function mergeLayerDown(id: string) {
    const current = layersRef.current;
    const index = current.findIndex((layer) => layer.id === id);
    if (index <= 0) return;
    mergeLayers(id, current[index - 1].id);
  }

  function hideLayer(id: string) {
    commitLayers(toggleArtLayerHidden(layersRef.current, id));
  }

  /** Layers under the active one, then layers above it. The active canvas stays the drawing surface. */
  function paintLayerChrome(under: CanvasRenderingContext2D, over: CanvasRenderingContext2D) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const list = layersRef.current;
    const activeIndex = list.findIndex((layer) => layer.id === activeLayerRef.current);
    const paint = (ctx: CanvasRenderingContext2D, from: number, to: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let index = from; index < to; index += 1) {
        const layer = list[index];
        if (!layer || layer.hidden) continue;
        const stored = storesRef.current.get(layer.id);
        if (stored) ctx.drawImage(stored, 0, 0, canvas.width, canvas.height);
      }
      ctx.restore();
    };
    paint(under, 0, Math.max(0, activeIndex));
    paint(over, activeIndex + 1, list.length);
  }

  function compositeOnto(target: CanvasRenderingContext2D, width: number, height: number) {
    stashActiveLayer();
    target.clearRect(0, 0, width, height);
    for (const layer of layersRef.current) {
      if (layer.hidden) continue;
      const stored = storesRef.current.get(layer.id);
      if (stored) target.drawImage(stored, 0, 0, width, height);
    }
  }

  return {
    layers,
    activeLayerId,
    selectLayer,
    addLayer,
    removeLayer,
    moveLayer,
    reorderLayer,
    mergeLayers,
    mergeLayerDown,
    hideLayer,
    stashActiveLayer,
    compositeOnto,
    paintLayerChrome,
  };
}
