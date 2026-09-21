import { resolveRoomId } from "./catalog";
import type { RoomConversation } from "./types";

function isoFromOffset(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

const DEFAULT_SEED: RoomConversation[] = [
  {
    id: "d1",
    roomId: "lobby",
    title: "Introduce yourself: what's your Board vibe?",
    body: "Drop a sentence, your favorite link, and what kind of signal you want to leave in the room.",
    authorName: "System",
    createdAt: isoFromOffset(1000 * 60 * 60 * 22),
    replies: [
      {
        id: "r_d1_1",
        threadId: "d1",
        authorName: "John Andy",
        body: "Keep it short, honest, and useful. A good room starts with a clear signal.",
        createdAt: isoFromOffset(1000 * 60 * 11),
      },
    ],
  },
  {
    id: "d2",
    roomId: "lobby",
    title: "Rooms vs Channels: naming discussion",
    body: "We're using Rooms now to prep for Room Drops later. The structure should feel more like entering a space than scrolling a message board.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 5),
    replies: [
      {
        id: "r_d2_1",
        threadId: "d2",
        authorName: "Board",
        body: "Room language keeps the door open for private chambers, project rooms, and invite-only drops later.",
        createdAt: isoFromOffset(1000 * 60 * 9),
      },
    ],
  },
  {
    id: "a1",
    roomId: "announcements",
    title: "Update: Forums navigation is now Room-based",
    body: "Rooms are the primary unit. Thread Drops still live here — as one component of the space, not the whole purpose.",
    authorName: "Admin",
    createdAt: isoFromOffset(1000 * 60 * 60 * 26),
    replies: [],
    isPinned: true,
  },
  {
    id: "c1",
    roomId: "casting",
    title: "Open call: extras for NYC street scene",
    body: "Looking for featured extras for a stylized NYC street sequence. Wardrobe notes, availability, and headshots can be dropped into this room.",
    authorName: "Casting",
    createdAt: isoFromOffset(1000 * 60 * 80),
    privacy: "work",
    mood: "urgent",
    replies: [
      {
        id: "r_c1_1",
        threadId: "c1",
        authorName: "Prod Team",
        body: "Signals needed: availability, preferred contact, and one current photo.",
        createdAt: isoFromOffset(1000 * 60 * 7),
      },
    ],
  },
  {
    id: "c2",
    roomId: "casting",
    title: "Self-tape format: slate + takes + file naming",
    body: "Keeping submissions consistent. Use the same slate order, label your files cleanly, and drop your upload link once.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 3),
    replies: [],
  },
  {
    id: "cr1",
    roomId: "crew",
    title: "Looking for a PA for a one-day interior shoot",
    body: "Paid, food provided, Manhattan. Drop a signal with your availability and whether you can help with lockups.",
    authorName: "Prod Team",
    createdAt: isoFromOffset(1000 * 60 * 60 * 9),
    privacy: "work",
    replies: [],
  },
  {
    id: "p1",
    roomId: "projects",
    title: "Work Desk -> Projects page: UI layout brainstorm",
    body: "Tile-based table, project rooms, drop creator column, and a clean way to move project signals into the feed.",
    authorName: "John Andy",
    createdAt: isoFromOffset(1000 * 60 * 60 * 30),
    privacy: "private",
    mood: "dreaming",
    replies: [],
  },
  {
    id: "o1",
    roomId: "offtopic",
    title: "What's everyone building this week?",
    body: "Anything counts. Even half-finished ideas. Drop the thing you keep circling back to.",
    authorName: "Community",
    createdAt: isoFromOffset(1000 * 60 * 60 * 50),
    replies: [],
  },
  {
    id: "lit1",
    roomId: "jab-lit",
    title: "Drop a page: first lines that refuse to leave",
    body: "Poetry, prose, screenplay, worldbuilding notes, Dropbook chapters. Put the line on the table.",
    authorName: "JAB LIT",
    createdAt: isoFromOffset(1000 * 60 * 40),
    replies: [],
  },
  {
    id: "com1",
    roomId: "jab-comics",
    title: "Character sheets and panel WIPs",
    body: "Share a page, a turnaround, or the frame you cannot stop redrawing.",
    authorName: "JAB Comics",
    createdAt: isoFromOffset(1000 * 60 * 55),
    replies: [],
  },
  {
    id: "mus1",
    roomId: "music",
    title: "Drop your theme song",
    body: "If someone watched your week like a 2000s movie, what track plays? Voice Studio mixes, beats, vocals, and WIPs all belong here.",
    authorName: "Music",
    createdAt: isoFromOffset(1000 * 60 * 60 * 14),
    replies: [
      {
        id: "mus1_r1",
        threadId: "mus1",
        authorName: "JAB Creator",
        body: "Opening-credits energy only. Link the demo or share an audio Drop.",
        createdAt: isoFromOffset(1000 * 60 * 60 * 9),
      },
    ],
  },
  {
    id: "tr1",
    roomId: "those-ryderz",
    title: "Auditions, tapes, and production signals",
    body: "Open calls, self-tapes, crew notes, and Drops for THAT RYDERZ live here. Invite collaborators, post updates, and keep the film moving.",
    authorName: "Those Ryderz",
    createdAt: isoFromOffset(1000 * 60 * 32),
    replies: [
      {
        id: "tr1_r1",
        threadId: "tr1",
        authorName: "Casting",
        body: "Signals needed: availability, a current photo, and the tape. Casting Corner still holds extras calls — this room is the project.",
        createdAt: isoFromOffset(1000 * 60 * 14),
      },
    ],
  },
  {
    id: "jv1",
    roomId: "jab-visions",
    title: "Studio signal from JAB Visions",
    body: "Board releases, studio notes, announcements, and official Drops. This is the ecosystem room.",
    authorName: "JAB Visions",
    createdAt: isoFromOffset(1000 * 60 * 21),
    replies: [],
    isPinned: true,
  },
];

export function seedConversations(existing: RoomConversation[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const seed of DEFAULT_SEED) {
    if (!byId.has(seed.id)) byId.set(seed.id, seed);
  }
  return [...byId.values()];
}

export function conversationsForRoom(all: RoomConversation[], roomId: string) {
  return all.filter((item) => resolveRoomId(item.roomId) === roomId);
}
