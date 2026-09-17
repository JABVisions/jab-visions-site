"use client";

import styles from "./bucketBrainSpace.module.css";
import type { BucketBrainEntity } from "@/lib/board/brain/response";
import BucketBrainResponse from "./BucketBrainResponse";

export default function BucketBrainResults({
  entities,
  emptyTitle,
  emptyBody,
}: {
  entities: BucketBrainEntity[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (!entities.length) {
    return (
      <div className={styles.empty}>
        <strong>{emptyTitle || "No Work Boards found yet."}</strong>
        {emptyBody || "Try searching by role, skill, creator, or project."}
      </div>
    );
  }

  return <BucketBrainResponse entities={entities} />;
}
