"use client";

import type { ReactNode } from "react";
import { artToolLabel, STUDIO_OBJECT_TOOLS, type StudioObjectTool } from "@/lib/board/artBrush";
import styles from "./DropStudio.module.css";

export type ObjectTool = StudioObjectTool;

export const OBJECT_TOOLS: ObjectTool[] = [...STUDIO_OBJECT_TOOLS];

function objectToolLabel(item: ObjectTool) {
  return artToolLabel(item);
}

export function ObjectToolToolbar({
  tool,
  tools = OBJECT_TOOLS,
  onToolChange,
}: {
  tool: ObjectTool;
  tools?: ObjectTool[];
  onToolChange: (tool: ObjectTool) => void;
}) {
  return (
    <div className={styles.workbenchTools} aria-label="Drop Studio object tools">
      {tools.map((item) => (
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
  tools,
  onToolChange,
  drawer,
  artTools,
}: {
  tool: ObjectTool;
  tools?: ObjectTool[];
  onToolChange: (tool: ObjectTool) => void;
  drawer?: ReactNode;
  artTools?: ReactNode;
}) {
  return (
    <div className={styles.workbenchDock}>
      <div className={styles.workbenchPaletteScroll}>
        <ObjectToolToolbar tool={tool} tools={tools} onToolChange={onToolChange} />
        {drawer ? <div className={styles.workbenchDrawer}>{drawer}</div> : null}
        {artTools ? <div className={styles.workbenchArtTools}>{artTools}</div> : null}
      </div>
    </div>
  );
}
