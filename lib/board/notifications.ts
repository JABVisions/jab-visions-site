export const BOARD_NOTIFICATIONS_UPDATED_EVENT = "board:notifications:updated";
export const BOARD_ACTIVITY_NAV_EVENT = "board:activity:navigate";
export const BOARD_OPEN_FRIENDZONE_CHAT_EVENT = "board:open-friendzone-chat";
export const BOARD_OPEN_DROP_COMMENTS_EVENT = "board:open-drop-comments";

export type ActivityType =
  | "signal"
  | "reaction"
  | "wave"
  | "friendzone_request"
  | "friendzone_connected"
  | "comment"
  | "comment_reply"
  | "mention"
  | "dm"
  | "work_board"
  | "drop"
  | "system";

export type ActivityPriority = "high" | "medium" | "normal";

export type ActivityFilter =
  | "all"
  | "signals"
  | "social"
  | "messages"
  | "comments"
  | "requests";

export type ActivityEntityType =
  | "drop"
  | "comment"
  | "conversation"
  | "profile"
  | "work_board"
  | "signal"
  | "system";

export type BoardNotification = {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  activityType: ActivityType;
  entityType: ActivityEntityType | null;
  entityId: string | null;
  dropId: string | null;
  commentId: string | null;
  conversationId: string | null;
  friendzoneRequestId: string | null;
  signalId: string | null;
  message: string | null;
  preview: string | null;
  href: string | null;
  imageUrl: string | null;
  metadata: Record<string, unknown>;
  priority: ActivityPriority;
  actionRequired: boolean;
  groupKey: string | null;
  createdAt: string;
  readAt: string | null;
  seenAt: string | null;
};

export type GroupedActivity = {
  id: string;
  key: string;
  items: BoardNotification[];
  latest: BoardNotification;
  count: number;
  unread: boolean;
  actionRequired: boolean;
};

export type ActivityDestination =
  | { kind: "drop"; dropId: string; href?: string | null; commentId?: string | null }
  | { kind: "conversation"; conversationId?: string | null; actorUserId?: string | null; actorUsername?: string | null }
  | { kind: "profile"; username?: string | null; userId?: string | null }
  | { kind: "href"; href: string }
  | { kind: "none" };

export const ACTIVITY_FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "signals", label: "Signals" },
  { id: "social", label: "Social" },
  { id: "messages", label: "Messages" },
  { id: "comments", label: "Comments" },
  { id: "requests", label: "Requests" },
];

const TYPE_ALIASES: Record<string, ActivityType> = {
  drop_comment_received: "comment",
  comment_received: "comment",
  reply: "comment_reply",
  reaction_pass: "reaction",
  reaction_pin: "reaction",
  reaction_push: "reaction",
  pass: "reaction",
  pin: "reaction",
  push: "reaction",
  friend_request: "friendzone_request",
  friendzone: "friendzone_request",
  message: "dm",
  direct_message: "dm",
  board_signal: "signal",
};

const HIGH_TYPES: ActivityType[] = ["friendzone_request", "dm", "comment_reply", "system"];
const MEDIUM_TYPES: ActivityType[] = ["comment", "wave", "mention", "work_board"];
const UNGROUPABLE: ActivityType[] = [
  "friendzone_request",
  "dm",
  "comment_reply",
  "system",
  "mention",
];

export function normalizeActivityType(value: unknown): ActivityType {
  const raw = String(value || "").trim();
  if (raw && TYPE_ALIASES[raw]) return TYPE_ALIASES[raw];
  if (
    raw === "signal" ||
    raw === "reaction" ||
    raw === "wave" ||
    raw === "friendzone_request" ||
    raw === "friendzone_connected" ||
    raw === "comment" ||
    raw === "comment_reply" ||
    raw === "mention" ||
    raw === "dm" ||
    raw === "work_board" ||
    raw === "drop" ||
    raw === "system"
  ) {
    return raw;
  }
  return "system";
}

export function priorityForActivityType(type: ActivityType): ActivityPriority {
  if (HIGH_TYPES.includes(type)) return "high";
  if (MEDIUM_TYPES.includes(type)) return "medium";
  return "normal";
}

export function actionRequiredForType(type: ActivityType) {
  return type === "friendzone_request" || type === "dm" || type === "system";
}

export function filterForActivityType(type: ActivityType): Exclude<ActivityFilter, "all"> {
  if (type === "signal" || type === "drop" || type === "work_board") return "signals";
  if (type === "dm") return "messages";
  if (type === "comment" || type === "comment_reply" || type === "mention") return "comments";
  if (type === "friendzone_request") return "requests";
  return "social";
}

export function matchesActivityFilter(item: BoardNotification, filter: ActivityFilter) {
  if (filter === "all") return true;
  return filterForActivityType(item.activityType) === filter;
}

export function metaString(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function actorName(item: BoardNotification) {
  const meta = item.metadata || {};
  return (
    metaString(meta, "actorName") ||
    metaString(meta, "authorName") ||
    (metaString(meta, "actorUsername") ? `@${metaString(meta, "actorUsername")}` : "") ||
    (metaString(meta, "authorUsername") ? `@${metaString(meta, "authorUsername")}` : "") ||
    "Someone"
  );
}

export function actorUsername(item: BoardNotification) {
  const meta = item.metadata || {};
  return (
    metaString(meta, "actorUsername") ||
    metaString(meta, "authorUsername") ||
    ""
  ).replace(/^@+/, "").toLowerCase();
}

export function actorAvatar(item: BoardNotification) {
  const meta = item.metadata || {};
  return (
    metaString(meta, "actorAvatar") ||
    metaString(meta, "authorAvatar") ||
    ""
  );
}

export function dropTitle(item: BoardNotification) {
  const meta = item.metadata || {};
  return metaString(meta, "dropTitle") || metaString(meta, "title") || "Drop";
}

export function reactionKind(item: BoardNotification) {
  const meta = item.metadata || {};
  const value = metaString(meta, "reaction") || metaString(meta, "signal") || "pass";
  if (value === "pin" || value === "push" || value === "pass") return value;
  return "pass";
}

export function typeLabel(type: ActivityType) {
  if (type === "signal") return "SIGNAL";
  if (type === "reaction") return "REACTION RAIL";
  if (type === "wave") return "WAVE";
  if (type === "friendzone_request") return "FRIENDZONE";
  if (type === "friendzone_connected") return "FRIENDZONE";
  if (type === "comment" || type === "comment_reply" || type === "mention") return "COMMENT";
  if (type === "dm") return "MESSAGE";
  if (type === "work_board") return "WORK BOARD";
  if (type === "drop") return "DROP";
  return "BOARD";
}

export function describeActivity(item: BoardNotification, extras?: { names?: string[]; count?: number }) {
  const name = actorName(item);
  const title = dropTitle(item);
  const reaction = reactionKind(item);
  const names = extras?.names?.filter(Boolean) ?? [];
  const count = extras?.count ?? 1;

  if (item.message && names.length <= 1 && count <= 1) return item.message;

  if (item.activityType === "reaction") {
    const verb =
      reaction === "pin" ? "pinned" : reaction === "push" ? "pushed" : "signaled";
    if (count > 1) {
      const shown = names.slice(0, 3);
      const rest = count - shown.length;
      const list =
        rest > 0
          ? `${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`
          : shown.length === 2
            ? `${shown[0]} and ${shown[1]}`
            : shown.join(", ");
      return `${list} ${verb} ${title}.`;
    }
    if (reaction === "push") return `${name} pushed ${title}.`;
    if (reaction === "pin") return `${name} pinned ${title}.`;
    return `${name} signaled ${title}.`;
  }

  if (item.activityType === "comment") {
    if (count > 1) return `${count} people commented on ${title}.`;
    return `${name} commented on ${title}.`;
  }
  if (item.activityType === "comment_reply") return `${name} replied to your comment.`;
  if (item.activityType === "mention") return `${name} mentioned you in a comment.`;
  if (item.activityType === "wave") return `${name} waved at you.`;
  if (item.activityType === "friendzone_request") {
    return `${name} wants to enter your Friendzone.`;
  }
  if (item.activityType === "friendzone_connected") {
    return `You and ${name} are now in each other's Friendzone.`;
  }
  if (item.activityType === "dm") return `${name} sent you a message.`;
  if (item.activityType === "signal") {
    return item.message || `A Signal moved around ${title}.`;
  }
  if (item.activityType === "work_board") {
    return item.message || `${name} interacted with your Work Board.`;
  }
  if (item.activityType === "drop") {
    return item.message || `${name} published a new Drop.`;
  }
  return item.message || `${name} moved through Board.`;
}

export function destinationForActivity(item: BoardNotification): ActivityDestination {
  const meta = item.metadata || {};
  const username = actorUsername(item);
  const dropId = item.dropId || metaString(meta, "referencedDropId") || metaString(meta, "commentDropId");

  if (item.activityType === "dm") {
    return {
      kind: "conversation",
      conversationId: item.conversationId,
      actorUserId: item.actorUserId,
      actorUsername: username || null,
    };
  }

  if (
    item.activityType === "wave" ||
    item.activityType === "friendzone_request" ||
    item.activityType === "friendzone_connected"
  ) {
    return {
      kind: "profile",
      username: username || null,
      userId: item.actorUserId,
    };
  }

  if (dropId || item.commentId) {
    return {
      kind: "drop",
      dropId: dropId || item.entityId || "",
      href: item.href,
      commentId: item.commentId,
    };
  }

  if (item.href) return { kind: "href", href: item.href };
  if (username) return { kind: "profile", username, userId: item.actorUserId };
  return { kind: "none" };
}

export function canGroupActivity(item: BoardNotification) {
  if (item.actionRequired) return false;
  if (UNGROUPABLE.includes(item.activityType)) return false;
  return Boolean(item.groupKey);
}

export function groupNotifications(items: BoardNotification[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const key = canGroupActivity(item) ? `group:${item.groupKey}` : `item:${item.id}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex != null) {
      const existing = groups[existingIndex];
      existing.items.push(item);
      existing.count += 1;
      existing.unread = existing.unread || !item.readAt;
      existing.actionRequired = existing.actionRequired || item.actionRequired;
      if (item.createdAt > existing.latest.createdAt) existing.latest = item;
      continue;
    }
    indexByKey.set(key, groups.length);
    groups.push({
      id: item.id,
      key,
      items: [item],
      latest: item,
      count: 1,
      unread: !item.readAt,
      actionRequired: item.actionRequired,
    });
  }

  return groups;
}

export function unreadCount(items: BoardNotification[]) {
  return items.filter((item) => !item.readAt).length;
}

export function mapNotificationRow(row: Record<string, any>): BoardNotification | null {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id || "").trim();
  const recipientUserId = String(row.recipient_id || row.recipientUserId || "").trim();
  if (!id || !recipientUserId) return null;
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id,
    recipientUserId,
    actorUserId: row.actor_id ? String(row.actor_id) : row.actorUserId ? String(row.actorUserId) : null,
    activityType: normalizeActivityType(row.activity_type || row.activityType),
    entityType: (row.entity_type || row.entityType || null) as ActivityEntityType | null,
    entityId: row.entity_id ? String(row.entity_id) : row.entityId ? String(row.entityId) : null,
    dropId: row.drop_id ? String(row.drop_id) : row.dropId ? String(row.dropId) : null,
    commentId: row.comment_id ? String(row.comment_id) : row.commentId ? String(row.commentId) : null,
    conversationId: row.conversation_id
      ? String(row.conversation_id)
      : row.conversationId
        ? String(row.conversationId)
        : null,
    friendzoneRequestId: row.friendzone_request_id
      ? String(row.friendzone_request_id)
      : row.friendzoneRequestId
        ? String(row.friendzoneRequestId)
        : null,
    signalId: row.signal_id ? String(row.signal_id) : row.signalId ? String(row.signalId) : null,
    message: row.message ? String(row.message) : null,
    preview: row.preview ? String(row.preview) : null,
    href: row.href ? String(row.href) : null,
    imageUrl: row.image_url ? String(row.image_url) : row.imageUrl ? String(row.imageUrl) : null,
    metadata,
    priority:
      row.priority === "high" || row.priority === "medium" || row.priority === "normal"
        ? row.priority
        : "normal",
    actionRequired: Boolean(row.action_required ?? row.actionRequired),
    groupKey: row.group_key ? String(row.group_key) : row.groupKey ? String(row.groupKey) : null,
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    readAt: row.read_at ? String(row.read_at) : row.readAt ? String(row.readAt) : null,
    seenAt: row.seen_at ? String(row.seen_at) : row.seenAt ? String(row.seenAt) : null,
  };
}

export function mergeNotificationLists(
  current: BoardNotification[],
  incoming: BoardNotification[]
) {
  const seenIds = new Set<string>();
  const seenLegacy = new Set<string>();
  const merged: BoardNotification[] = [];

  for (const item of [...incoming, ...current]) {
    const legacy = String(item.metadata?.legacyKey || "").trim();
    if (seenIds.has(item.id)) continue;
    if (legacy && seenLegacy.has(legacy)) continue;
    seenIds.add(item.id);
    if (legacy) seenLegacy.add(legacy);
    merged.push(item);
  }

  return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function relativeActivityTime(iso: string) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const delta = Date.now() - time;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(time);
}
