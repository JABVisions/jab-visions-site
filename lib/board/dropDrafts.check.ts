import assert from "node:assert/strict";
import {
  DROP_DRAFTS_STORAGE_KEY,
  ensureVoiceStudioDraftCard,
  readDropDrafts,
} from "./dropDrafts";

const store = new Map<string, string>();
(globalThis as { window?: Window }).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  },
  dispatchEvent: () => true,
} as unknown as Window;

const photoUrl = "data:image/png;base64,iVBORw0KGgo=";
store.set(
  DROP_DRAFTS_STORAGE_KEY,
  JSON.stringify([
    {
      id: "draft_photo",
      kind: "image",
      dataUrl: photoUrl,
      fileName: "vision.png",
      mimeType: "image/png",
      createdAt: 1,
      count: 1,
    },
  ])
);

const card = ensureVoiceStudioDraftCard("draft_photo", "Voice Studio project");
assert.ok(card);
assert.equal(card.id, "draft_photo_voice");
assert.equal(card.kind, "audio");

const drafts = readDropDrafts();
const kept = drafts.find((draft) => draft.id === "draft_photo");
assert.equal(kept?.kind, "image");
assert.equal(kept?.dataUrl, photoUrl);
assert.equal(kept?.mimeType, "image/png");
assert.ok(drafts.some((draft) => draft.id === "draft_photo_voice" && draft.kind === "audio"));

const vocal = ensureVoiceStudioDraftCard("draft_song", "take.wav");
assert.equal(vocal?.id, "draft_song");
assert.equal(vocal?.kind, "audio");

console.log("drop draft kind checks passed");
