export const FORUMS_HALL_SECTIONS = [
  { id: "live-now", title: "Live Now", layout: "rail" },
  { id: "your-rooms", title: "Your Rooms", layout: "rail" },
  { id: "board-rooms", title: "Board Rooms", layout: "rail" },
  { id: "jab-official", title: "JAB Official", layout: "rail" },
] as const;

export const FORUMS_HALL_SECTION_ORDER = FORUMS_HALL_SECTIONS.map((section) => section.id);

export const FORUMS_ROOM_ACTIONS = [
  "Follow",
  "Join",
  "Start Call",
  "Go Live",
  "Ask Visionary",
] as const;

export const FORUMS_ROOM_INTERIOR_ACTIONS = [
  "Create Room Drop",
  "Go Live",
  "Ask Visionary",
  "Add Drop",
] as const;

export type ForumsHallSectionId = (typeof FORUMS_HALL_SECTIONS)[number]["id"];
