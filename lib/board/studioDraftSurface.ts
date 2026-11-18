// Which Drop Studio surface a Drafts pick should land on.
// The mode rail and the center window have to move together: opening an Art
// draft while a vocal is still loaded must not keep the Voice review on screen.

export type StudioCaptureMode = "photo" | "video" | "audio" | "art" | "descript";
export type StudioPhase = "choose" | "capture" | "edit";
export type StudioMediaKind = "image" | "video" | "audio";
export type StudioDraftKind = "image" | "video" | "audio" | "document" | "art-project";

export type StudioDraftSurface = {
  mode: StudioCaptureMode;
  phase: Exclude<StudioPhase, "choose">;
  /** Drop the previous file so a vocal cannot stay mounted under the new mode. */
  clearMedia: boolean;
};

export function studioSurfaceForDraft(kind: StudioDraftKind): StudioDraftSurface {
  switch (kind) {
    case "art-project":
      return { mode: "art", phase: "capture", clearMedia: true };
    case "document":
      return { mode: "descript", phase: "edit", clearMedia: true };
    case "audio":
      return { mode: "audio", phase: "edit", clearMedia: false };
    case "video":
      return { mode: "video", phase: "edit", clearMedia: false };
    case "image":
      return { mode: "photo", phase: "edit", clearMedia: false };
  }
}

/** Voice review belongs to Voice mode only. Leftover audio must not paint over Art, Vision, or Video. */
export function studioEditShowsVoiceReview(
  mode: StudioCaptureMode,
  mediaKind: StudioMediaKind
): boolean {
  return mode === "audio" && mediaKind === "audio";
}

/**
 * Uploading a vocal from Photo or Video should open Voice when that mode is
 * available. Otherwise the file stays on the image editor with no playback.
 */
export function studioModeForUploadedMedia(
  current: StudioCaptureMode,
  kind: StudioMediaKind,
  allowed: readonly StudioCaptureMode[]
): StudioCaptureMode {
  if (kind === "audio" && allowed.includes("audio")) return "audio";
  return current;
}

/**
 * Art's canvas is the drawing surface. Show it whenever Art is selected and
 * there isn't already a picture or video open in the editor. A leftover vocal
 * must not keep the photo editor — and its mix button — on screen.
 */
export function studioShowsArtCanvas(
  mode: StudioCaptureMode,
  phase: StudioPhase,
  mediaKind: StudioMediaKind,
  hasVisualPreview: boolean
): boolean {
  if (mode !== "art") return false;
  if (phase === "edit" && hasVisualPreview && mediaKind !== "audio") return false;
  return true;
}

/** A voice-project card may only replace a vocal draft. Photos and videos keep their own kind. */
export function shouldStampVoiceDraftCard(
  fileKind: StudioMediaKind | null,
  projectSaved: boolean
): boolean {
  if (!projectSaved) return false;
  if (fileKind === "image" || fileKind === "video") return false;
  return true;
}

/** A photo or video saved in the same moment as a song gets its own draft id. */
export function voiceDraftIdForSave(
  mediaDraftId: string,
  fileKind: StudioMediaKind | null
): string {
  if (fileKind === "image" || fileKind === "video") return `voice_${mediaDraftId}`;
  return mediaDraftId;
}
