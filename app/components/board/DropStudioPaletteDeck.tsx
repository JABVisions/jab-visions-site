"use client";

import type { ReactNode } from "react";
import styles from "./DropStudio.module.css";

export type ObjectTool = "text" | "stickers" | "button" | "effects" | "filters" | "enhance";

export const OBJECT_TOOLS: ObjectTool[] = [
  "text",
  "stickers",
  "button",
  "effects",
  "filters",
  "enhance",
];

function objectToolLabel(item: ObjectTool) {
  switch (item) {
    case "text":
      return "Text";
    case "stickers":
      return "Stickers";
    case "button":
      return "Button";
    case "effects":
      return "Effects";
    case "filters":
      return "Filters";
    case "enhance":
      return "Enhance";
    default:
      return item;
  }
}

export function ObjectToolToolbar({
  tool,
  onToolChange,
}: {
  tool: ObjectTool;
  onToolChange: (tool: ObjectTool) => void;
}) {
  return (
    <div className={styles.workbenchTools} aria-label="Drop Studio object tools">
      {OBJECT_TOOLS.map((item) => (
        <button
          key={item}
          type="button"
          className={tool === item ? styles.workbenchToolActive : undefined}
          onClick={() => onToolChange(item)}
          title={objectToolLabel(item)}
        >
          {objectToolLabel(item)}
        </button>
      ))}
    </div>
  );
}

/** Palette drawer — object toolbar on top, scrollable body with tool panels + art tools. */
export default function DropStudioPaletteDeck({
  tool,
  onToolChange,
  drawer,
  artTools,
}: {
  tool: ObjectTool;
  onToolChange: (tool: ObjectTool) => void;
  drawer?: ReactNode;
  artTools?: ReactNode;
}) {
  return (
    <div className={styles.workbenchDock}>
      <div className={styles.workbenchPaletteScroll}>
        <div className={styles.workbenchHead}>Palette</div>
        <ObjectToolToolbar tool={tool} onToolChange={onToolChange} />
        {drawer ? <div className={styles.workbenchDrawer}>{drawer}</div> : null}
        {artTools ? <div className={styles.workbenchArtTools}>{artTools}</div> : null}
      </div>
    </div>
  );
}
