import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORUMS_HALL_SECTION_ORDER,
  FORUMS_HALL_SECTIONS,
  FORUMS_ROOM_ACTIONS,
  FORUMS_ROOM_INTERIOR_ACTIONS,
  liveOfficialRooms,
} from "./rooms";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const hall = source("app/components/board/rooms/ForumsHall.tsx");
const header = source("app/components/board/rooms/RoomHeader.tsx");
const interior = source("app/components/board/rooms/RoomInterior.tsx");
const conversation = source("app/components/board/rooms/RoomConversation.tsx");
const composer = source("app/components/board/rooms/RoomDropComposer.tsx");
const card = source("app/components/board/rooms/RoomCard.tsx");
const css = source("app/components/board/rooms/forumsLayout.css");
const forumsPage = source("app/board/forums/page.tsx");
const roomPage = source("app/board/forums/[roomId]/page.tsx");
const boardLayout = source("app/board/layout.tsx");

assert(FORUMS_HALL_SECTION_ORDER.join(">") === "live-now>your-rooms>board-rooms>jab-official", "hallway log order is Live Now → Your Rooms → Board Rooms → JAB Official");
assert(
  FORUMS_HALL_SECTIONS.every((section) => section.layout === "rail"),
  "Live Now, Your Rooms, Board Rooms, and JAB Official stay horizontal rails"
);

const hallSectionHits = [...hall.matchAll(/<HallSection[\s\S]*?id="([^"]+)"/g)].map((match) => match[1]);
assert(hallSectionHits.join(">") === FORUMS_HALL_SECTION_ORDER.join(">"), "ForumsHall renders the desktop section log in order");
assert(!/RoomsPanel|ThreadDropPanel|ThreadDropTile/.test(hall + forumsPage + roomPage + interior), "Forums routes do not mount the old Reddit-style thread / sidebar UI");
assert(boardLayout.includes("forumsLayout.css"), "Board layout loads the shared Forums CSS on every Forums route");
assert(/from "@\/app\/components\/board\/rooms\/ForumsHall"/.test(forumsPage), "Forums home shares ForumsHall");
assert(/from "@\/app\/components\/board\/rooms\/RoomInterior"/.test(roomPage), "Room pages share RoomInterior");

for (const action of FORUMS_ROOM_ACTIONS) {
  assert(header.includes(action), `Room header keeps ${action}`);
}
assert(composer.includes("Create Room Drop"), "Room interior keeps Create Room Drop");
assert(conversation.includes("Add Drop"), "conversations keep Add Drop");
assert(interior.includes("DropStudioLauncher"), "Room Drop Studio still launches from the Room");
assert(interior.includes("onGoLive={onGoLive}"), "Go Live is wired on the shared Room header");
assert(card.includes("Open Room"), "Room cards expose Open Room on the hallway rails");
assert(card.includes("room.comingSoon ? undefined : roomHref"), "coming soon rooms stay unlinked; live official rooms use roomHref");

const official = liveOfficialRooms();
assert(official.length >= 5, "official hallway has the live JAB rooms");
assert(
  ["jab-lit", "jab-comics", "music", "those-ryderz", "jab-visions"].every((id) => official.some((room) => room.id === id && !room.comingSoon)),
  "JAB LIT, JAB Comics, Music, Those Ryderz, and JAB Visions are enterable"
);

assert(!/\.forumsHallSection[^{]*\{[^}]*display:\s*none/.test(css), "hallway sections are not display:none");
assert(!/\.forumsRoomActions[^{]*\{[^}]*display:\s*none/.test(css), "Room actions are not hidden");
assert(!/(?:^|[^\w-])order:\s*-?\d+/.test(css), "mobile CSS does not reorder hallway sections");
assert(!/data-layout="stack"/.test(css), "hallway CSS does not stack room cards into a column list");
assert(/\.forumsHallTrack\s*\{[^}]*flex-direction:\s*row/.test(css), "hallway tracks stay a horizontal row");
assert(/\.forumsHallTrack\s*\{[^}]*overflow-x:\s*auto/.test(css), "hallway tracks scroll sideways");
assert(!/\.forumsHallTrack\s*\{[^}]*flex-direction:\s*column/.test(css), "hallway tracks are not a vertical list");
assert(!/width:\s*100%\s*!important/.test(css), "room cards keep carousel widths instead of full-width list cards");

const trackBlocks = [...css.matchAll(/\.forumsHallTrack\s*\{([^}]+)\}/g)].map((match) => match[1]);
assert(trackBlocks.length >= 2, "hallway tracks declare a row rail at the base and phone breakpoints");
for (const block of trackBlocks) {
  assert(/overflow-x:\s*auto/.test(block), "390px and 1280px hallway tracks keep overflow-x auto");
  assert(!/flex-direction:\s*column/.test(block), "390px and 1280px hallway tracks stay a row, not a column list");
  assert(!/overflow:\s*visible/.test(block), "hallway tracks do not drop horizontal scroll");
}
assert(css.includes("@media (max-width: 720px)"), "Forums layout has a phone breakpoint");
assert(css.includes("@media (max-width: 390px)"), "Forums layout has a 390px wrap");
assert(css.includes("@media (max-width: 430px)"), "Forums layout has a 430px wrap");
assert(css.includes("flex-wrap: wrap"), "Room actions wrap instead of overflowing");
assert(css.includes(".forumsConversationPanel"), "conversation uses a shared overlay shell");
assert(css.includes("keyboard-inset-bottom") || conversation.includes("scrollIntoView"), "composer stays reachable with the keyboard");
assert(!/board-dock|BoardDock|\.dock/.test(css), "Forums CSS does not restyle the dock");

for (const action of FORUMS_ROOM_INTERIOR_ACTIONS) {
  const haystack = header + interior + composer + conversation;
  assert(haystack.includes(action), `Room interior still exposes ${action}`);
}

console.log("forumsMobileLayout.check.ts: ok");
