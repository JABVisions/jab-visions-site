import {
  PROFILE_ACTIVITY_WHISPERS,
  createBoardWhisper,
  type BoardWhisper,
} from "@/lib/board/whispers";

export const johnAndyProfileWhispers: BoardWhisper[] = [
  ...PROFILE_ACTIVITY_WHISPERS,
  createBoardWhisper({
    id: "whisper-2026-05-16-board-signup",
    eventType: "board_signup",
    createdAt: "2026-05-16T18:40:00.000Z",
  }),
  createBoardWhisper({
    id: "whisper-2026-05-06-audition-upload",
    eventType: "audition_upload",
    createdAt: "2026-05-06T14:24:00.000Z",
  }),
  createBoardWhisper({
    id: "whisper-2026-05-04-drop-push",
    eventType: "drop_push",
    createdAt: "2026-05-04T18:27:00.000Z",
  }),
  createBoardWhisper({
    id: "whisper-2026-04-29-quiet",
    eventType: "quiet_day",
    createdAt: "2026-04-29T22:02:00.000Z",
  }),
];
