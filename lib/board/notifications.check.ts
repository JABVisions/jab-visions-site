import {
  describeActivity,
  groupNotifications,
  matchesActivityFilter,
  mergeNotificationLists,
  type BoardNotification,
} from "./notifications";
import { notificationFromActivityRow, notificationFromDropComment } from "./legacyNotifications";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function item(partial: Partial<BoardNotification> & Pick<BoardNotification, "id" | "activityType">): BoardNotification {
  return {
    recipientUserId: "me",
    actorUserId: "them",
    entityType: "drop",
    entityId: "drop-1",
    dropId: "drop-1",
    commentId: null,
    conversationId: null,
    friendzoneRequestId: null,
    signalId: null,
    message: null,
    preview: null,
    href: "/board/feed",
    imageUrl: null,
    metadata: { actorName: "Alex", actorUsername: "alex", dropTitle: "Vision Drop" },
    priority: "normal",
    actionRequired: false,
    groupKey: null,
    createdAt: "2026-09-17T20:00:00.000Z",
    readAt: null,
    seenAt: null,
    ...partial,
  };
}

const reactions = [
  item({
    id: "r1",
    activityType: "reaction",
    groupKey: "reaction:drop-1",
    metadata: { actorName: "Alex", actorUsername: "alex", dropTitle: "Vision Drop", reaction: "pass" },
  }),
  item({
    id: "r2",
    activityType: "reaction",
    actorUserId: "maya",
    groupKey: "reaction:drop-1",
    createdAt: "2026-09-17T19:00:00.000Z",
    metadata: { actorName: "Maya", actorUsername: "maya", dropTitle: "Vision Drop", reaction: "pass" },
  }),
  item({
    id: "r3",
    activityType: "reaction",
    actorUserId: "chris",
    groupKey: "reaction:drop-1",
    createdAt: "2026-09-17T18:00:00.000Z",
    metadata: { actorName: "Chris", actorUsername: "chris", dropTitle: "Vision Drop", reaction: "pass" },
  }),
];

const grouped = groupNotifications(reactions);
assert(grouped.length === 1, "reactions on the same drop group together");
assert(grouped[0].count === 3, "grouped reaction count includes every actor");
assert(
  describeActivity(grouped[0].latest, {
    names: grouped[0].items.map((entry) => String(entry.metadata.actorName)),
    count: grouped[0].count,
  }).includes("Alex") &&
    describeActivity(grouped[0].latest, {
      names: grouped[0].items.map((entry) => String(entry.metadata.actorName)),
      count: grouped[0].count,
    }).includes("Chris"),
  "grouped reaction copy names the actors"
);

const requests = [
  item({
    id: "f1",
    activityType: "friendzone_request",
    actionRequired: true,
    groupKey: "friendzone:jordan",
    metadata: { actorName: "Jordan", actorUsername: "jordan" },
  }),
  item({
    id: "f2",
    activityType: "friendzone_request",
    actorUserId: "maya",
    actionRequired: true,
    groupKey: "friendzone:jordan",
    metadata: { actorName: "Maya", actorUsername: "maya" },
  }),
];
assert(groupNotifications(requests).length === 2, "Friendzone requests stay ungrouped");

const dms = [
  item({ id: "d1", activityType: "dm", actionRequired: true, groupKey: "dm:maya", conversationId: "maya" }),
  item({ id: "d2", activityType: "dm", actionRequired: true, groupKey: "dm:maya", conversationId: "maya" }),
];
assert(groupNotifications(dms).length === 2, "DMs stay ungrouped");

assert(
  matchesActivityFilter(item({ id: "c1", activityType: "comment" }), "comments"),
  "comments filter includes comments"
);
assert(
  matchesActivityFilter(item({ id: "s1", activityType: "signal" }), "signals"),
  "signals filter includes Board Signals"
);
assert(
  describeActivity(
    item({
      id: "w1",
      activityType: "wave",
      metadata: { actorName: "Maya", actorUsername: "maya" },
    })
  ) === "Maya waved at you.",
  "wave copy uses Board vocabulary"
);
assert(
  describeActivity(
    item({
      id: "room-share",
      activityType: "room_drop_shared",
      href: "/board/forums/music",
      entityType: "room",
      metadata: { actorName: "Maya", dropTitle: "Night Tape", roomName: "Music" },
      message: "Maya shared Night Tape in Music.",
    })
  ) === "Maya shared Night Tape in Music.",
  "room drop shares use Activity Channel copy"
);
assert(
  describeActivity(
    item({
      id: "room-share-file",
      activityType: "room_drop_shared",
      href: "/board/forums/music",
      entityType: "room",
      metadata: {
        actorName: "Maya",
        dropTitle: "IMG_1234.MOV",
        roomId: "music",
        roomName: "Music",
      },
    })
  ) === "Maya added a Drop to 🎧 Music.",
  "Activity Channel fallback names the Forum Room instead of the filename"
);
assert(
  describeActivity(
    item({
      id: "room-reply-file",
      activityType: "room_reply",
      href: "/board/forums/jab-comics",
      entityType: "room",
      metadata: {
        actorName: "John",
        dropTitle: "audio.m4a",
        roomId: "jab-comics",
        roomName: "JAB Comics",
        conversationTitle: "Comic Character Design",
      },
    })
  ) === "John replied with a Drop in Comic Character Design in JAB Comics.",
  "conversation Activity Channel fallback names the thread and Forum Room"
);
assert(
  describeActivity(
    item({
      id: "room-live",
      activityType: "room_live_started",
      message: "Music went Live.",
    })
  ) === "Music went Live.",
  "live room starts can notify followers"
);

const persistedComment = item({
  id: "uuid-1",
  activityType: "comment",
  metadata: { legacyKey: "activity:old-1", actorName: "Alex", dropTitle: "Vision Drop" },
});
const legacyComment = item({
  id: "legacy-activity:old-1",
  activityType: "comment",
  metadata: { legacyKey: "activity:old-1", actorName: "Alex", dropTitle: "Vision Drop" },
});
const mergedHistory = mergeNotificationLists([legacyComment], [persistedComment]);
assert(mergedHistory.length === 1, "legacy and persisted copies of the same comment collapse");
assert(mergedHistory[0].id === "uuid-1", "persisted notification wins over the legacy copy");

const activityCopy = item({
  id: "legacy-activity:act-9",
  activityType: "comment",
  commentId: "33333333-3333-4333-8333-333333333333",
  metadata: { legacyKey: "activity:act-9", actorName: "Alex", dropTitle: "Vision Drop" },
});
const commentCopy = item({
  id: "legacy-comment:33333333-3333-4333-8333-333333333333",
  activityType: "comment",
  commentId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-08-01T12:00:00.000Z",
  metadata: { legacyKey: "drop_comment:33333333-3333-4333-8333-333333333333", actorName: "Alex" },
});
assert(
  mergeNotificationLists([activityCopy], [commentCopy]).length === 1,
  "the same historic comment from activity and the comments table collapses"
);

const historic = notificationFromActivityRow(
  {
    id: "act-77",
    user_id: "11111111-1111-4111-8111-111111111111",
    title: "Rina commented on Vision Drop",
    body: "this is beautiful",
    created_at: "2026-08-01T12:00:00.000Z",
    meta: {
      activityType: "drop_comment_received",
      recipientUserId: "22222222-2222-4222-8222-222222222222",
      authorName: "Rina",
      dropTitle: "Vision Drop",
      commentId: "33333333-3333-4333-8333-333333333333",
    },
  },
  "22222222-2222-4222-8222-222222222222"
);
assert(historic?.activityType === "comment", "historic comment activity becomes a comment notification");
assert(historic?.preview === "this is beautiful", "historic comment preview is preserved");
assert(Boolean(historic?.readAt), "weeks-old historic items are marked read");

const ownedComment = notificationFromDropComment(
  {
    id: "44444444-4444-4444-8444-444444444444",
    drop_id: "drop-77",
    user_id: "11111111-1111-4111-8111-111111111111",
    username: "rina",
    display_name: "Rina",
    body: "still thinking about this",
    created_at: "2026-08-02T12:00:00.000Z",
  },
  "22222222-2222-4222-8222-222222222222",
  { id: "drop-77", title: "Vision Drop" }
);
assert(ownedComment?.activityType === "comment", "owned-drop comments become comment notifications");
assert(ownedComment?.preview === "still thinking about this", "owned-drop comment preview is preserved");
assert(Boolean(ownedComment?.readAt), "weeks-old owned-drop comments are marked read");
assert(
  notificationFromDropComment(
    {
      id: "self-comment",
      drop_id: "drop-77",
      user_id: "22222222-2222-4222-8222-222222222222",
      body: "note to self",
      created_at: "2026-08-02T12:00:00.000Z",
    },
    "22222222-2222-4222-8222-222222222222",
    { id: "drop-77", title: "Vision Drop" }
  ) === null,
  "own comments on owned drops stay out of the inbox"
);

const older = item({ id: "old", activityType: "comment", createdAt: "2026-08-01T12:00:00.000Z" });
const newer = item({ id: "new", activityType: "comment", createdAt: "2026-09-18T12:00:00.000Z" });
const chronological = [newer, older].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
assert(chronological[0].id === "old" && chronological[1].id === "new", "rising stack is oldest-to-newest so column-reverse can place the latest at the top");

console.log("activity channel grouping checks passed");
