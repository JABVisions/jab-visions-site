"use client";

import styles from "./bucketBrainSpace.module.css";
import type { CreatorEntity, WorkBoardEntity } from "@/lib/board/brain/response";
import WorkBoardPreviewCard from "./WorkBoardPreviewCard";

export default function WorkBoardSearchResults({
  boards,
}: {
  boards: Array<WorkBoardEntity | CreatorEntity>;
}) {
  if (!boards.length) return null;
  return (
    <div className={styles.cards}>
      {boards.map((board) => (
        <WorkBoardPreviewCard key={board.id} board={board} />
      ))}
    </div>
  );
}
