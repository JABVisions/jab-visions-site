"use client";

import styles from "./BoardWhispers.module.css";
import {
  createBoardWhisper,
  type BoardWhisper,
  type BoardWhisperTone,
} from "@/lib/board/whispers";

export type { BoardWhisper, BoardWhisperTone } from "@/lib/board/whispers";

type BoardWhispersProps = {
  whisper: BoardWhisper;
  align?: "left" | "center" | "right";
};

const toneFallback: BoardWhisperTone = "system";

export default function BoardWhispers({
  whisper,
  align = "center",
}: BoardWhispersProps) {
  const tone = whisper.tone ?? toneFallback;

  return (
    <div
      className={[
        styles.whisperRow,
        styles[tone],
        styles[align],
      ].join(" ")}
      aria-label="Board Whisper"
    >
      <p className={styles.whisperText}>{whisper.text}</p>
    </div>
  );
}

export const sampleBoardWhispers: BoardWhisper[] = [
  createBoardWhisper({
    id: "whisper-profile-001",
    eventType: "profile_view",
  }),
  createBoardWhisper({
    id: "whisper-signal-001",
    eventType: "drop_view",
  }),
  createBoardWhisper({
    id: "whisper-memory-001",
    eventType: "drop_pin",
  }),
  createBoardWhisper({
    id: "whisper-friendzone-001",
    eventType: "friend_zone_activity",
  }),
  createBoardWhisper({
    id: "whisper-system-001",
    eventType: "work_update",
  }),
  createBoardWhisper({
    id: "whisper-quiet-001",
    eventType: "quiet_day",
  }),
];
