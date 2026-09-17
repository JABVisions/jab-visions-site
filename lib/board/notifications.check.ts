import {
  describeActivity,
  groupNotifications,
  matchesActivityFilter,
  type BoardNotification,
} from "./notifications";

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

console.log("activity channel grouping checks passed");
