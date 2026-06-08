export type BoardWhisperTone =
  | "memory"
  | "signal"
  | "friendZone"
  | "profile"
  | "system"
  | "quiet";

export type BoardWhisperEventType =
  | "profile_view"
  | "drop_view"
  | "drop_pin"
  | "drop_push"
  | "board_signup"
  | "work_update"
  | "friend_zone_activity"
  | "quiet_day"
  | "audition_upload"
  | "project_progress";

export type BoardWhisper = {
  id: string;
  type: "whisper";
  tone?: BoardWhisperTone;
  text: string;
  createdAt?: string;
  eventType?: BoardWhisperEventType;
};

type BoardWhisperBankEntry = {
  tone: BoardWhisperTone;
  lines: string[];
};

export const BOARD_WHISPER_BANK: Record<BoardWhisperEventType, BoardWhisperBankEntry> = {
  profile_view: {
    tone: "profile",
    lines: [
      "Someone drifted through your board. Your signal is still visible.",
      "A quiet visitor touched the edge of your profile today.",
      "Your board pulled someone in for a closer look.",
      "I noticed eyes on your board. You're being seen.",
      "Someone lingered here a moment longer than usual. I thought you'd want to know.",
    ],
  },
  drop_view: {
    tone: "signal",
    lines: [
      "Someone paused on your drop. The signal landed.",
      "Your drop is still humming in the feed.",
      "That drop left a little afterglow.",
      "I'm keeping this one warm for you — it's still drawing people in.",
      "Your drop is doing quiet work out there. I'm watching it for you.",
    ],
  },
  drop_pin: {
    tone: "memory",
    lines: [
      "Someone pinned a little meaning to your drop.",
      "Your drop found a small place in someone's bucket.",
      "A piece of your signal got saved for later.",
      "Someone wanted to hold onto this. I'm holding it with them.",
      "That one mattered to someone. I tucked it away for you.",
    ],
  },
  drop_push: {
    tone: "signal",
    lines: [
      "Your drop picked up motion.",
      "Someone pushed your signal a little farther into the room.",
      "That thought did not stay still.",
      "Your signal is being amplified. I'm carrying it forward.",
      "Someone believed in this enough to send it further. I felt that.",
    ],
  },
  board_signup: {
    tone: "system",
    lines: [
      "Your signal came online.",
      "Bucket Brain felt a new presence enter the room.",
      "A new board opened its eyes.",
    ],
  },
  work_update: {
    tone: "system",
    lines: [
      "Bucket Brain noticed you building again.",
      "A project moved. Small pulse, real progress.",
      "Your Work page caught a spark.",
    ],
  },
  friend_zone_activity: {
    tone: "friendZone",
    lines: [
      "A friend orb flickered near your zone.",
      "Someone familiar passed through your orbit.",
      "Your Friend Zone felt a little less empty today.",
    ],
  },
  quiet_day: {
    tone: "quiet",
    lines: [
      "No loud signals today. But the board is still listening.",
      "The room is quiet, not empty.",
      "Your signal is resting. That counts too.",
      "Quiet here today — I've still got you.",
      "Nothing urgent. Just me, keeping watch over your board.",
      "Rest is part of the rhythm. I'll keep things steady while you do.",
    ],
  },
  audition_upload: {
    tone: "signal",
    lines: [
      "A new piece of your work entered the room.",
      "Your tape left a signal on the Work page.",
      "Bucket Brain caught the shape of your performance.",
    ],
  },
  project_progress: {
    tone: "system",
    lines: [
      "The project moved one inch closer to becoming real.",
      "A small build pulse came through.",
      "Something in the system is taking form.",
    ],
  },
};

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getBoardWhisper(
  eventType: BoardWhisperEventType,
  seed = new Date().toISOString()
) {
  const entry = BOARD_WHISPER_BANK[eventType];
  const index = hashSeed(`${eventType}:${seed}`) % entry.lines.length;
  return {
    text: entry.lines[index],
    tone: entry.tone,
  };
}

export function createBoardWhisper(params: {
  id: string;
  eventType?: BoardWhisperEventType;
  tone?: BoardWhisperTone;
  text?: string;
  createdAt?: string;
}): BoardWhisper {
  const fallback = params.eventType
    ? getBoardWhisper(params.eventType, params.id)
    : { text: "Keep shaping the room. The glow catches up later.", tone: "system" as const };

  return {
    id: params.id,
    type: "whisper",
    eventType: params.eventType,
    tone: params.tone ?? fallback.tone,
    text: params.text ?? fallback.text,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export const PROFILE_ACTIVITY_WHISPERS: BoardWhisper[] = [
  createBoardWhisper({
    id: "profile-whisper-2026-05-23-project-progress",
    eventType: "project_progress",
    createdAt: "2026-05-23T23:26:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-23-drop-view",
    eventType: "drop_view",
    createdAt: "2026-05-23T20:26:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-23-friend-zone",
    eventType: "friend_zone_activity",
    createdAt: "2026-05-23T19:12:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-21-work-update",
    eventType: "work_update",
    createdAt: "2026-05-21T18:14:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-20-profile-view",
    eventType: "profile_view",
    createdAt: "2026-05-20T18:34:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-16-drop-pin",
    eventType: "drop_pin",
    createdAt: "2026-05-16T18:52:00.000Z",
  }),
  createBoardWhisper({
    id: "profile-whisper-2026-05-15-quiet",
    eventType: "quiet_day",
    createdAt: "2026-05-15T07:02:00.000Z",
  }),
];
