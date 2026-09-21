import type { Room, RoomKind } from "./types";

const now = Date.now();

function room(partial: Omit<Room, "slug" | "state" | "presenceCount"> & Partial<Pick<Room, "slug" | "state" | "presenceCount">>): Room {
  return {
    slug: partial.id,
    state: "ROOM",
    presenceCount: 0,
    ...partial,
  };
}

export const ROOM_ALIASES: Record<string, string> = {
  "music-drops": "music",
  "jab-news": "announcements",
  auditions: "casting",
  general: "lobby",
  "ryderz-lore": "those-ryderz",
  "micro-boards": "lobby",
};

export const BOARD_ROOM_CATALOG: Room[] = [
  room({
    id: "jab-lit",
    name: "JAB LIT",
    icon: "📚",
    description:
      "Writing, storytelling, poetry, screenplays, prose, worldbuilding, and Dropbooks.",
    chips: ["Writing", "Poetry", "Screenwriting", "Worldbuilding", "Dropbooks"],
    kind: "official",
    isOfficial: true,
    comingSoon: false,
    color: "#F5D76E",
    accent: "#FFE9A3",
    memberCount: 24,
    lastActivityAt: now - 1000 * 60 * 18,
  }),
  room({
    id: "jab-comics",
    name: "JAB Comics",
    icon: "💥",
    description:
      "Comics, concept art, illustrated storytelling, character design, pages, and visual development.",
    chips: ["Comics", "Characters", "Concept Art", "Panels", "WIPs"],
    kind: "official",
    isOfficial: true,
    comingSoon: false,
    color: "#FF6B6B",
    accent: "#FFD166",
    memberCount: 31,
    lastActivityAt: now - 1000 * 60 * 7,
  }),
  room({
    id: "music",
    name: "Music",
    icon: "🎧",
    description:
      "Songs, demos, instrumentals, vocals, beats, WIPs, audio Drops, and collabs. The social counterpart to Voice Studio.",
    chips: ["Songs", "Beats", "Vocals", "WIPs", "Collabs"],
    kind: "official",
    isOfficial: true,
    comingSoon: false,
    color: "#7C5CFF",
    accent: "#C4B5FD",
    memberCount: 48,
    lastActivityAt: now - 1000 * 60 * 4,
    aliases: ["music-drops"],
  }),
  room({
    id: "those-ryderz",
    name: "Those Ryderz",
    icon: "🎬",
    description:
      "The JAB Visions project room for THAT RYDERZ — auditions, self-tapes, production, crew, and Drops. Invite collaborators, post updates, and keep the film moving.",
    chips: ["Auditions", "Production", "Crew", "Drops"],
    kind: "official",
    isOfficial: true,
    comingSoon: false,
    color: "#5EEAD4",
    accent: "#99F6E4",
    memberCount: 29,
    lastActivityAt: now - 1000 * 60 * 11,
    aliases: ["ryderz-lore"],
  }),
  room({
    id: "jab-visions",
    name: "JAB Visions",
    icon: "✦",
    description:
      "The official JAB Visions studio room — Board, studio, announcements, and official Drops.",
    chips: ["Board", "Studio", "Announcements", "Drops"],
    kind: "official",
    isOfficial: true,
    comingSoon: false,
    color: "#F0ABFC",
    accent: "#E9D5FF",
    memberCount: 52,
    lastActivityAt: now - 1000 * 60 * 6,
  }),
  room({
    id: "lobby",
    name: "Lobby",
    icon: "🏁",
    description: "Start here. Intros, links, and first signals.",
    chips: ["Intros", "Links", "Welcome"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#A78BFA",
    accent: "#DDD6FE",
    memberCount: 64,
    lastActivityAt: now - 1000 * 60 * 9,
    aliases: ["general", "micro-boards"],
  }),
  room({
    id: "announcements",
    name: "Announcements",
    icon: "📌",
    description: "Updates, releases, and notices from the Board community.",
    chips: ["Updates", "Releases"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#F472B6",
    accent: "#FBCFE8",
    memberCount: 41,
    lastActivityAt: now - 1000 * 60 * 60 * 12,
    aliases: ["jab-news"],
  }),
  room({
    id: "casting",
    name: "Casting Corner",
    icon: "🎭",
    description: "Auditions, recasts, self-tapes, and submissions.",
    chips: ["Auditions", "Self-tapes"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#60A5FA",
    accent: "#BFDBFE",
    memberCount: 22,
    lastActivityAt: now - 1000 * 60 * 2,
    aliases: ["auditions"],
  }),
  room({
    id: "crew",
    name: "Crew Calls",
    icon: "🎬",
    description: "Gigs, collaborators, and production rates.",
    chips: ["Gigs", "Crew"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#34D399",
    accent: "#A7F3D0",
    memberCount: 18,
    lastActivityAt: now - 1000 * 60 * 35,
  }),
  room({
    id: "projects",
    name: "Projects",
    icon: "🧩",
    description: "Build logs, collab threads, and project rooms adjacent to Work Board.",
    chips: ["Build logs", "Collabs"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#FBBF24",
    accent: "#FDE68A",
    memberCount: 27,
    lastActivityAt: now - 1000 * 60 * 60 * 4,
  }),
  room({
    id: "offtopic",
    name: "Off Topic",
    icon: "🍿",
    description: "Memes, life, and random drops.",
    chips: ["Lounge"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#FB7185",
    accent: "#FECDD3",
    memberCount: 15,
    lastActivityAt: now - 1000 * 60 * 60 * 24 * 2,
  }),
  room({
    id: "vfx-lab",
    name: "VFX Lab",
    icon: "✨",
    description: "Auras, glows, roto, compositing tricks.",
    chips: ["VFX", "Glow"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#22D3EE",
    accent: "#A5F3FC",
    memberCount: 19,
    lastActivityAt: now - 1000 * 60 * 60 * 20,
  }),
  room({
    id: "editing-room",
    name: "Editing Room",
    icon: "✂️",
    description: "Pacing, templates, and editorial craft.",
    chips: ["Edit", "Pacing"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#FB923C",
    accent: "#FED7AA",
    memberCount: 11,
    lastActivityAt: now - 1000 * 60 * 60 * 8,
  }),
  room({
    id: "gear-talk",
    name: "Gear Talk",
    icon: "📷",
    description: "Cameras, lenses, lighting, sound.",
    chips: ["Cameras", "Sound"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#94A3B8",
    accent: "#CBD5E1",
    memberCount: 9,
    lastActivityAt: now - 1000 * 60 * 60 * 30,
  }),
  room({
    id: "nyc-locations",
    name: "NYC Locations",
    icon: "🗽",
    description: "Permits, parks, rooftops, hidden gems.",
    chips: ["NYC", "Locations"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#38BDF8",
    accent: "#BAE6FD",
    memberCount: 8,
    lastActivityAt: now - 1000 * 60 * 60 * 40,
  }),
  room({
    id: "modeling",
    name: "Modeling & Photography",
    icon: "📷",
    description: "Poses, edits, reels, confidence craft.",
    chips: ["Photo", "Reels"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#E879F9",
    accent: "#F5D0FE",
    memberCount: 13,
    lastActivityAt: now - 1000 * 60 * 60 * 16,
  }),
  room({
    id: "collabs",
    name: "Collabs",
    icon: "🤝",
    description: "Find creators to build with.",
    chips: ["Collabs"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#4ADE80",
    accent: "#BBF7D0",
    memberCount: 21,
    lastActivityAt: now - 1000 * 60 * 50,
  }),
  room({
    id: "showcase",
    name: "Showcase",
    icon: "🌟",
    description: "Share wins, progress, glow-ups.",
    chips: ["Wins"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#FACC15",
    accent: "#FEF08A",
    memberCount: 16,
    lastActivityAt: now - 1000 * 60 * 70,
  }),
  room({
    id: "board-bugs",
    name: "Bugs & Fixes",
    icon: "🪲",
    description: "Report issues. Track improvements.",
    chips: ["Bugs"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#A3E635",
    accent: "#D9F99D",
    memberCount: 7,
    lastActivityAt: now - 1000 * 60 * 60 * 6,
  }),
  room({
    id: "feature-requests",
    name: "Feature Requests",
    icon: "💡",
    description: "Vote on what we build next.",
    chips: ["Ideas"],
    kind: "board",
    isOfficial: false,
    comingSoon: false,
    color: "#818CF8",
    accent: "#C7D2FE",
    memberCount: 14,
    lastActivityAt: now - 1000 * 60 * 60 * 26,
  }),
];

export function resolveRoomId(value: unknown): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/^board\/forums\//, "");
  if (!raw) return null;
  const aliased = ROOM_ALIASES[raw] || raw;
  const found = BOARD_ROOM_CATALOG.find(
    (item) => item.id === aliased || item.slug === aliased || item.aliases?.includes(raw)
  );
  return found?.id ?? null;
}

export function getRoomById(id: unknown): Room | null {
  const resolved = resolveRoomId(id);
  if (!resolved) return null;
  return BOARD_ROOM_CATALOG.find((item) => item.id === resolved) ?? null;
}

export function roomsByKind(kind: RoomKind) {
  return BOARD_ROOM_CATALOG.filter((item) => item.kind === kind);
}

export function officialRooms() {
  return BOARD_ROOM_CATALOG.filter((item) => item.isOfficial);
}

export function liveOfficialRooms() {
  return officialRooms().filter((item) => !item.comingSoon);
}

export function boardCommunityRooms() {
  return BOARD_ROOM_CATALOG.filter((item) => item.kind === "board");
}

export function forumPickerRooms() {
  return BOARD_ROOM_CATALOG.filter((item) => !item.comingSoon).map((item) => ({
    id: item.id,
    title: item.isOfficial ? `${item.icon} ${item.name}` : item.name,
  }));
}

export function roomHref(roomId: string, extra?: { conversation?: string }) {
  const id = resolveRoomId(roomId) || roomId;
  const path = `/board/forums/${encodeURIComponent(id)}`;
  if (extra?.conversation) {
    return `${path}?conversation=${encodeURIComponent(extra.conversation)}`;
  }
  return path;
}
