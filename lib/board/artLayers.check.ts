import assert from "node:assert/strict";
import {
  MAX_ART_LAYERS,
  addArtLayer,
  deleteArtLayer,
  initialArtLayers,
  mergeArtLayerIds,
  moveArtLayer,
  nextActiveArtLayer,
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

console.log("art layer checks passed");
