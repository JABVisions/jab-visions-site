"use client";

import styles from "./bucketBrainSpace.module.css";
import type { VisionaryEntity } from "@/lib/board/bucketBrain/response";

export default function VisionaryResponse({ entity }: { entity: VisionaryEntity }) {
  return (
    <p className={styles.vision} data-mode={entity.mode}>
      {entity.answer}
    </p>
  );
}
