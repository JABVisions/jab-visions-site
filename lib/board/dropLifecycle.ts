// Drop lifecycle.
//
// A Drop Studio creation is framed first, then sent to the Board, and can later
// be kept as a reusable Asset Drop or a Portfolio Drop. The stage is advisory
// metadata carried alongside a drop — nothing gates on it, so stamping it can
// never block publishing.

export type DropLifecycleStage = "framed" | "sent" | "asset" | "portfolio";

export const DROP_LIFECYCLE_ORDER: DropLifecycleStage[] = ["framed", "sent", "asset", "portfolio"];

export function dropStageLabel(stage: DropLifecycleStage) {
  switch (stage) {
    case "framed":
      return "Framed";
    case "sent":
      return "Sent";
    case "asset":
      return "Asset Drop";
    case "portfolio":
      return "Portfolio Drop";
  }
}

export function dropStageGlyph(stage: DropLifecycleStage) {
  switch (stage) {
    case "framed":
      return "🖼";
    case "sent":
      return "📤";
    case "asset":
      return "🗂";
    case "portfolio":
      return "🎞";
  }
}

export function isDropLifecycleStage(value: unknown): value is DropLifecycleStage {
  return (
    value === "framed" || value === "sent" || value === "asset" || value === "portfolio"
  );
}

export function coerceDropStage(value: unknown): DropLifecycleStage | undefined {
  return isDropLifecycleStage(value) ? value : undefined;
}

/**
 * Move a drop forward. Asset and Portfolio are siblings, so a drop can be moved
 * between them freely; nothing ever regresses to Framed once it has been sent.
 */
export function advanceDropStage(
  current: DropLifecycleStage | undefined,
  next: DropLifecycleStage
): DropLifecycleStage {
  if (!current) return next;
  if (next === "framed" && current !== "framed") return current;
  if (next === "sent" && (current === "asset" || current === "portfolio")) return current;
  return next;
}

export function stageForDestination(destination: "assets" | "portfolio" | "projects") {
  if (destination === "portfolio") return "portfolio" as const;
  if (destination === "assets") return "asset" as const;
  return "sent" as const;
}
