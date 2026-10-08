import assert from "node:assert/strict";
import {
  MAX_ART_LAYERS,
  addArtLayer,
  deleteArtLayer,
  initialArtLayers,
  mergeArtLayerIds,
  moveArtLayer,
  nextActiveArtLayer,
  reorderArtLayerToIndex,
  resolveLayerDrop,
  toggleArtLayerHidden,
} from "./artLayers";

let layers = initialArtLayers();
assert.equal(layers.length, 1);
assert.equal(deleteArtLayer(layers, layers[0].id).length, 1, "the last layer stays");

layers = addArtLayer(layers);
layers = addArtLayer(layers);
layers = addArtLayer(layers);
const capped = addArtLayer(layers);
assert.equal(capped.length, MAX_ART_LAYERS);

const moved = moveArtLayer(layers, layers[0].id, 1);
assert.equal(moved[1].id, layers[0].id);
assert.equal(moveArtLayer(layers, layers[0].id, -1).length, layers.length);

const removed = deleteArtLayer(layers, layers[1].id);
assert.equal(removed.some((layer) => layer.id === layers[1].id), false);
assert.equal(nextActiveArtLayer(layers, layers[1].id, layers[1].id), layers[0].id);

assert.deepEqual(mergeArtLayerIds(layers, layers[2].id, layers[0].id), [layers[0].id, layers[2].id]);
assert.equal(mergeArtLayerIds(layers, layers[0].id, layers[0].id), null);

const tiles = layers.map((layer, index) => ({
  id: layer.id,
  left: index * 80,
  right: index * 80 + 76,
  top: 0,
  bottom: 42,
}));
assert.equal(resolveLayerDrop(layers[0].id, tiles, 80 + 38, 20)?.type, "merge");
assert.equal(resolveLayerDrop(layers[2].id, tiles, 10, 20)?.type, "reorder");
const reordered = reorderArtLayerToIndex(layers, layers[2].id, 0);
assert.equal(reordered[0].id, layers[2].id);
const hidden = toggleArtLayerHidden(layers, layers[0].id);
assert.equal(hidden[0].hidden, true);
assert.equal(toggleArtLayerHidden(hidden, layers[0].id)[0].hidden, false);

console.log("art layer checks passed");
