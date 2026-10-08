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
  const fine = Boolean(input.finePointer);
  if (width < 760) return "phone";
  if (!fine && width < 1280) return "tablet";
  if (fine && width >= 1180) return "desktop";
  if (width >= 900) return "tablet";
  return "phone";
}
