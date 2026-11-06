export type DropStudioV5Layout = "phone" | "tablet" | "desktop";

/**
 * Phone, tablet, and desktop from the viewport and the pointer.
 * A narrow desktop window uses the phone layout. A wide touch screen stays a tablet.
 */
export function chooseDropStudioV5Layout(input: {
  width: number;
  height: number;
  finePointer: boolean;
}): DropStudioV5Layout {
  const width = Number.isFinite(input.width) ? input.width : 0;
  const height = Number.isFinite(input.height) ? input.height : 0;
  const fine = Boolean(input.finePointer);
  const shortSide = Math.min(width, height);
  // A landscape phone is wide but short. Width alone would call it a tablet.
  if (!fine && shortSide > 0 && shortSide < 700) return "phone";
  if (width < 760) return "phone";
  if (!fine && width < 1280) return "tablet";
  if (fine && height > 0 && height < 700 && width < 1180) return "phone";
  if (fine && width >= 1180 && height >= 700) return "desktop";
  if (width >= 900) return "tablet";
  return "phone";
}
