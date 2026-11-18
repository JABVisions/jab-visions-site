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
 * Art's canvas is the capture surface. If Drafts selected Art while the loaded
 * file is still a vocal, show the canvas anyway — that is the stuck-voice bug.
 */
export function studioArtOverridesVoiceMedia(
  mode: StudioCaptureMode,
  phase: StudioPhase,
  mediaKind: StudioMediaKind
): boolean {
  return mode === "art" && phase !== "capture" && mediaKind === "audio";
}
