"use client";

import styles from "./bucketBrainSpace.module.css";
import type { BucketBrainPhase } from "@/lib/board/bucketBrain/response";

export default function BucketBrainOrb({
  phase,
  reducedMotion,
}: {
  phase: BucketBrainPhase;
  reducedMotion?: boolean;
}) {
  return (
    <div className={styles.orbWrap} aria-hidden>
      <div className={styles.orb} data-state={reducedMotion ? "idle" : phase}>
        <span className={styles.ring} />
        <span className={`${styles.ring} ${styles.ring2}`} />
        <span className={`${styles.ring} ${styles.ring3}`} />
        <span className={styles.core} />
      </div>
    </div>
  );
}
