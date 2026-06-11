// File: lib/board/mediaFormat.ts
// The standard Board Drop frame. Drop Studio captures, edits, and the feed all
// use this single portrait ratio so creation is WYSIWYG (camera → edit → feed,
// no resize jump) and the feed stays visually consistent instead of a mess of
// mismatched aspect ratios.

export const BOARD_DROP_ASPECT_W = 4;
export const BOARD_DROP_ASPECT_H = 5;

/** Use directly in CSS `aspect-ratio`. */
export const BOARD_DROP_ASPECT_CSS = `${BOARD_DROP_ASPECT_W} / ${BOARD_DROP_ASPECT_H}`;

/** Numeric ratio (width / height) for canvas crop math. */
export const BOARD_DROP_ASPECT_RATIO = BOARD_DROP_ASPECT_W / BOARD_DROP_ASPECT_H;

// Board photo output targets ≥1080px on the long edge — see lib/board/imageQuality.ts.
