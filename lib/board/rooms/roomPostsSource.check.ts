import { conversationsForRoom, seedConversations } from "./conversations";
import {
  conversationsFromPostRows,
  mergeConversationSources,
  mergeShareSources,
  roomFeedFromSources,
  sharesFromApiRows,
} from "./roomPostsSource";
import { sharesFromActivityRows } from "./cloudHydrate";
import type { RoomConversation, RoomDropShare } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const emptyLocal = mergeConversationSources({ roomId: "music", local: [], remote: [] });
assert(emptyLocal.length >= 1, "Music still has seed conversations with empty localStorage");
assert(
  emptyLocal.some((item) => item.title.includes("theme song")),
  "catalog seed conversations do not require a cached store"
);

const remoteOnly: RoomConversation[] = [
  {
    id: "sql_music_1",
    roomId: "music",
    title: "Night Tape conversation",
    body: "Posted from a phone.",
    authorName: "Maya",
    createdAt: new Date().toISOString(),
    replies: [
      {
        id: "sql_music_1_r",
        threadId: "sql_music_1",
        authorName: "Maya",
        body: "Replied with a Drop",
        createdAt: new Date().toISOString(),
        dropId: "drop_phone",
      },
    ],
  },
];

const desktop = roomFeedFromSources({
  roomId: "music",
  localConversations: [],
  remoteConversations: remoteOnly,
  localShares: [],
  remoteShares: [
    {
      id: "share_sql",
      roomId: "music",
      dropId: "drop_room",
      sharedBy: "user-1",
      sharedByName: "Maya",
      snapshot: { title: "Room tape", type: "Media", mediaKind: "audio" },
      createdAt: new Date().toISOString(),
      origin: "create",
    },
  ],
});
const mobile = roomFeedFromSources({
  roomId: "music",
  localConversations: remoteOnly,
  remoteConversations: remoteOnly,
  localShares: [
    {
      id: "share_local",
      roomId: "music",
      dropId: "drop_room",
      sharedBy: "user-1",
      sharedByName: "Maya",
      snapshot: { title: "Room tape", type: "Media", mediaKind: "audio" },
      createdAt: new Date().toISOString(),
      origin: "create",
    },
  ],
  remoteShares: [
    {
      id: "share_sql",
      roomId: "music",
      dropId: "drop_room",
      sharedBy: "user-1",
      sharedByName: "Maya",
      snapshot: { title: "Room tape", type: "Media", mediaKind: "audio" },
      createdAt: new Date().toISOString(),
      origin: "create",
    },
  ],
});

assert(desktop.some((item) => item.kind === "conversation" && item.title === "Night Tape conversation"), "desktop sees SQL conversations");
assert(desktop.some((item) => item.kind === "drop_share"), "desktop sees Room Drops from the shared source");
assert(desktop.some((item) => item.kind === "reply"), "desktop sees Conversation Drops from the shared source");
assert(
  desktop.filter((item) => item.kind === "conversation" || item.kind === "drop_share" || item.kind === "reply").length ===
    mobile.filter((item) => item.kind === "conversation" || item.kind === "drop_share" || item.kind === "reply").length,
  "desktop and mobile use the same room posts source"
);

const wipedLocal = mergeConversationSources({
  roomId: "music",
  local: seedConversations([]),
  remote: remoteOnly,
});
assert(
  wipedLocal.some((item) => item.id === "sql_music_1"),
  "re-hydrate from localStorage does not drop SQL conversations"
);

const mapped = conversationsFromPostRows("jab-comics", [
  {
    id: "sql_com",
    kind: "conversation",
    title: "Panel notes",
    body: "From SQL",
    author_name: "Rina",
    created_at: new Date().toISOString(),
  },
  {
    id: "sql_com_r",
    kind: "reply",
    parent_id: "sql_com",
    body: "Replied with a Drop",
    drop_id: "drop_panel",
    author_name: "Rina",
    created_at: new Date().toISOString(),
    metadata: { dropSnapshot: { title: "Panel 03" } },
  },
]);
assert(mapped[0]?.replies[0]?.dropId === "drop_panel", "SQL conversation drops map on every viewport");

const shares = mergeShareSources({
  roomId: "jab-comics",
  local: [],
  remote: sharesFromApiRows("jab-comics", [
    {
      id: "share_1",
      drop_id: "drop_art",
      shared_by: "user-1",
      shared_by_name: "Rina",
      snapshot: { title: "Panel 03" },
      origin: "create",
      created_at: new Date().toISOString(),
    },
  ]),
});
assert(shares.length === 1, "Room Drops hydrate from SQL without localStorage");

const activityPhone = sharesFromActivityRows("jab-comics", [
  {
    id: "act_phone",
    created_at: new Date().toISOString(),
    user_id: "user-phone",
    kind: "board_drop",
    title: "Added a Drop to JAB Comics",
    body: "Maya added a Drop to JAB Comics.",
    href: "https://example.com/phone.png",
    meta: {
      dropId: "drop_phone_incognito",
      roomId: "jab-comics",
      destinationType: "room",
      origin: "create",
      visibility: "public",
    },
  },
]);
const incognito = roomFeedFromSources({
  roomId: "jab-comics",
  localConversations: [],
  remoteConversations: [],
  localShares: [],
  remoteShares: activityPhone,
});
assert(
  incognito.some((item) => item.kind === "drop_share" && item.share?.dropId === "drop_phone_incognito"),
  "incognito desktop sees phone Room Drops from board_activity"
);
assert(
  incognito.some((item) => item.kind === "conversation" && /Character sheets/.test(String(item.title || ""))),
  "incognito desktop still shows the JAB Comics seed conversation"
);

assert(
  conversationsForRoom(seedConversations([]), "lobby").length >= 2,
  "Lobby seeds remain available when the cached thread store is empty"
);

console.log("forums room posts source checks passed");
