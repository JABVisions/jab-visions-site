"use client";

import styles from "./bucketBrainSpace.module.css";
import type { VisionaryEntity } from "@/lib/board/brain/response";

export default function VisionaryResponse({ entity }: { entity: VisionaryEntity }) {
  const answer = entity.answer?.trim() || "Visionary did not return a note for that.";
  return (
    <p className={styles.vision} data-mode={entity.mode}>
      {answer}
    </p>
  );
}
