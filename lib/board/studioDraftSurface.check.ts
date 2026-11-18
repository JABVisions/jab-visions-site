import assert from "node:assert/strict";
import {
  studioArtOverridesVoiceMedia,
  studioEditShowsVoiceReview,
  studioModeForUploadedMedia,
  studioSurfaceForDraft,
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

// Reported bug: Art is selected, the file is still a vocal, phase is still edit.
assert.equal(studioEditShowsVoiceReview("art", "audio"), false);
assert.equal(studioArtOverridesVoiceMedia("art", "edit", "audio"), true);
assert.equal(studioEditShowsVoiceReview("photo", "audio"), false);
assert.equal(studioEditShowsVoiceReview("video", "audio"), false);
assert.equal(studioEditShowsVoiceReview("descript", "audio"), false);

// A real vocal review, and an Art canvas that already has a picture, stay put.
assert.equal(studioEditShowsVoiceReview("audio", "audio"), true);
assert.equal(studioArtOverridesVoiceMedia("art", "edit", "image"), false);
assert.equal(studioArtOverridesVoiceMedia("art", "capture", "audio"), false);
assert.equal(studioArtOverridesVoiceMedia("audio", "edit", "audio"), false);

const withVoice = ["photo", "video", "audio", "art"] as const;
assert.equal(studioModeForUploadedMedia("photo", "audio", withVoice), "audio");
assert.equal(studioModeForUploadedMedia("video", "audio", withVoice), "audio");
assert.equal(studioModeForUploadedMedia("photo", "image", withVoice), "photo");
assert.equal(studioModeForUploadedMedia("art", "video", withVoice), "art");
assert.equal(studioModeForUploadedMedia("photo", "audio", ["photo", "video"]), "photo");

console.log("studio draft surface checks passed");
