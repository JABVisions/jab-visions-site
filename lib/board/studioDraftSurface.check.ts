import assert from "node:assert/strict";
import {
  shouldStampVoiceDraftCard,
  studioEditShowsVoiceReview,
  studioModeForUploadedMedia,
  studioShowsArtCanvas,
  studioSurfaceForDraft,
  voiceDraftIdForSave,
} from "./studioDraftSurface";

const art = studioSurfaceForDraft("art-project");
assert.deepEqual(art, { mode: "art", phase: "capture", clearMedia: true });

const writing = studioSurfaceForDraft("document");
assert.deepEqual(writing, { mode: "descript", phase: "edit", clearMedia: true });

assert.equal(studioSurfaceForDraft("audio").mode, "audio");
assert.equal(studioSurfaceForDraft("audio").phase, "edit");
assert.equal(studioSurfaceForDraft("audio").clearMedia, false);
assert.equal(studioSurfaceForDraft("video").mode, "video");
assert.equal(studioSurfaceForDraft("image").mode, "photo");

// Art with no picture, or with a leftover vocal, is the drawing canvas.
assert.equal(studioEditShowsVoiceReview("art", "audio"), false);
assert.equal(studioShowsArtCanvas("art", "edit", "audio", true), true);
assert.equal(studioShowsArtCanvas("art", "edit", "image", false), true);
assert.equal(studioShowsArtCanvas("art", "capture", "image", false), true);
assert.equal(studioEditShowsVoiceReview("photo", "audio"), false);
assert.equal(studioEditShowsVoiceReview("video", "audio"), false);
assert.equal(studioEditShowsVoiceReview("descript", "audio"), false);

// A finished picture in Art can use the editor. Voice review stays on Voice.
assert.equal(studioEditShowsVoiceReview("audio", "audio"), true);
assert.equal(studioShowsArtCanvas("art", "edit", "image", true), false);
assert.equal(studioShowsArtCanvas("photo", "edit", "image", false), false);
assert.equal(studioShowsArtCanvas("audio", "edit", "audio", true), false);

assert.equal(shouldStampVoiceDraftCard("image", true), false);
assert.equal(shouldStampVoiceDraftCard("video", true), false);
assert.equal(shouldStampVoiceDraftCard("audio", true), true);
assert.equal(shouldStampVoiceDraftCard("audio", false), false);
assert.equal(shouldStampVoiceDraftCard(null, true), true);
assert.equal(voiceDraftIdForSave("draft_photo", "image"), "voice_draft_photo");
assert.equal(voiceDraftIdForSave("draft_song", "audio"), "draft_song");

const withVoice = ["photo", "video", "audio", "art"] as const;
assert.equal(studioModeForUploadedMedia("photo", "audio", withVoice), "audio");
assert.equal(studioModeForUploadedMedia("video", "audio", withVoice), "audio");
assert.equal(studioModeForUploadedMedia("photo", "image", withVoice), "photo");
assert.equal(studioModeForUploadedMedia("art", "video", withVoice), "art");
assert.equal(studioModeForUploadedMedia("photo", "audio", ["photo", "video"]), "photo");

console.log("studio draft surface checks passed");
