"use client";

import styles from "./bucketBrainSpace.module.css";
import type { BucketBrainEntity, NoticeEntity, VisionaryEntity, WorkBoardEntity } from "@/lib/board/bucketBrain/response";
import VisionaryResponse from "./VisionaryResponse";
import WorkBoardPreviewCard from "./WorkBoardPreviewCard";

function isWorkBoard(entity: BucketBrainEntity): entity is WorkBoardEntity {
  return entity.kind === "work_board";
}

function isVisionary(entity: BucketBrainEntity): entity is VisionaryEntity {
  return entity.kind === "visionary";
}

function isNotice(entity: BucketBrainEntity): entity is NoticeEntity {
  return entity.kind === "notice";
}

export default function BucketBrainResults({
  entities,
  emptyTitle,
  emptyBody,
}: {
  entities: BucketBrainEntity[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const visionary = entities.find(isVisionary);
  const notices = entities.filter(isNotice);
  const boards = entities.filter(isWorkBoard);

  if (!entities.length) {
    return (
      <div className={styles.empty}>
        <strong>{emptyTitle || "No Work Boards found yet."}</strong>
        {emptyBody || "Try searching by role, skill, creator, or project."}
      </div>
    );
  }

  return (
    <div className={styles.results}>
      {visionary ? <VisionaryResponse entity={visionary} /> : null}
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice}>
          <strong>{notice.title}</strong>
          {notice.body}
        </div>
      ))}
      {boards.length ? (
        <div className={styles.cards}>
          {boards.map((board) => (
            <WorkBoardPreviewCard key={board.id} board={board} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
