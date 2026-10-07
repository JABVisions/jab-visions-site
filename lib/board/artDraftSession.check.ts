import assert from "node:assert/strict";
import { ART_CANVAS_DPR_CAP, ART_DRAFT_ID, ART_UNDO_LIMIT, peekArtDraftMeta } from "./artDraftSession";

assert.equal(ART_DRAFT_ID, "active-art");
assert.equal(ART_UNDO_LIMIT, 24);
assert.equal(ART_CANVAS_DPR_CAP, 2);
assert.equal(peekArtDraftMeta(), null);
console.log("art draft session checks passed");
