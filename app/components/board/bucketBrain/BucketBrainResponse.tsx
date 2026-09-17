"use client";

import styles from "./bucketBrainSpace.module.css";
import type {
  BoardContentEntity,
  BucketBrainEntity,
  NoticeEntity,
  VisionaryEntity,
  WorkBoardEntity,
  CreatorEntity,
} from "@/lib/board/brain/response";
import VisionaryResponse from "./VisionaryResponse";
import WorkBoardSearchResults from "./WorkBoardSearchResults";

function isWorkBoard(entity: BucketBrainEntity): entity is WorkBoardEntity {
  return entity.kind === "work_board";
}

function isCreator(entity: BucketBrainEntity): entity is CreatorEntity {
  return entity.kind === "creator";
}

function isVisionary(entity: BucketBrainEntity): entity is VisionaryEntity {
  return entity.kind === "visionary";
}

function isNotice(entity: BucketBrainEntity): entity is NoticeEntity {
  return entity.kind === "notice";
}

function isBoardContent(entity: BucketBrainEntity): entity is BoardContentEntity {
  return entity.kind === "board_content";
}

/** Mixed Bucket Brain response: Visionary text + Board entities in one stream. */
export default function BucketBrainResponse({ entities }: { entities: BucketBrainEntity[] }) {
  const visionary = entities.find(isVisionary);
  const notices = entities.filter(isNotice);
  const boards = [...entities.filter(isWorkBoard), ...entities.filter(isCreator)];
  const content = entities.filter(isBoardContent);

  return (
    <div className={styles.results}>
      {visionary ? <VisionaryResponse entity={visionary} /> : null}
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice}>
          <strong>{notice.title}</strong>
          {notice.body}
        </div>
      ))}
      <WorkBoardSearchResults boards={boards} />
      {content.length ? (
        <div className={styles.cards}>
          {content.map((item) => (
            <a key={item.id} className={styles.card} href={item.href}>
              <div className={styles.name}>{item.title}</div>
              {item.subtitle ? <div className={styles.role}>{item.subtitle}</div> : null}
              <span className={styles.open}>Open</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
