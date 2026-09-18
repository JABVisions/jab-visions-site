import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapNotificationRow,
  mergeNotificationLists,
  normalizeActivityType,
  type BoardNotification,
} from "@/lib/board/notifications";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORY_LIMIT = 400;
const DROP_ID_BATCH = 80;

function isUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function metaOf(row: Record<string, any>) {
  return row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? (row.meta as Record<string, unknown>)
    : {};
}

export function historicalReadAt(createdAt: string, knownReadAt?: string | null) {
  if (knownReadAt) return knownReadAt;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return createdAt;
  return Date.now() - created > 48 * 60 * 60 * 1000 ? createdAt : null;
}

type OwnedDrop = {
  id: string;
  title: string;
  href?: string | null;
  imageUrl?: string | null;
};

export function ownedDropsFromBoardStyle(boardStyle: unknown): OwnedDrop[] {
  const style =
    boardStyle && typeof boardStyle === "object" && !Array.isArray(boardStyle)
      ? (boardStyle as Record<string, any>)
      : {};
  const drops = Array.isArray(style.boardDrops) ? style.boardDrops : [];
  const seen = new Set<string>();
  const owned: OwnedDrop[] = [];
  for (const drop of drops) {
    if (!drop || typeof drop !== "object") continue;
    const id = String((drop as any).id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    owned.push({
      id,
      title: String((drop as any).title || "Drop").trim() || "Drop",
      href: (drop as any).href || (drop as any).url || null,
      imageUrl:
        (drop as any).image_url ||
        (drop as any).imageUrl ||
        (drop as any).previewImage ||
        null,
    });
  }
  return owned;
}

export function notificationFromActivityRow(
  row: Record<string, any>,
  recipientUserId: string
): BoardNotification | null {
  const meta = metaOf(row);
  const recipient = String(meta.recipientUserId || "").trim();
  if (recipient !== recipientUserId) return null;
  if (meta.presence === true || meta.source === "board_presence") return null;
  const actorId = row.user_id ? String(row.user_id) : null;
  if (actorId && actorId === recipientUserId) return null;

  const createdAt = String(row.created_at || new Date().toISOString());
  const activityType = normalizeActivityType(meta.activityType || "comment");
  const actorName =
    String(meta.authorName || meta.actorName || "").trim() || "Someone";
  const dropTitle = String(meta.dropTitle || row.title || "Drop").trim() || "Drop";

  return mapNotificationRow({
    id: `legacy-activity:${String(row.id)}`,
    recipient_id: recipientUserId,
    actor_id: isUuid(actorId) ? actorId : null,
    activity_type: activityType,
    entity_type: "drop",
    entity_id: String(meta.referencedDropId || meta.commentDropId || meta.dropId || ""),
    drop_id: String(meta.referencedDropId || meta.commentDropId || meta.dropId || ""),
    comment_id: isUuid(meta.commentId) ? meta.commentId : null,
    message: String(row.title || "").trim() || `${actorName} commented on ${dropTitle}.`,
    preview: String(row.body || "").trim().slice(0, 280) || null,
    href: row.href || null,
    image_url: row.image_url || null,
    metadata: {
      ...meta,
      legacyKey: `activity:${String(row.id)}`,
      legacySource: "board_activity",
      actorName,
      actorUsername: String(meta.authorUsername || meta.actorUsername || ""),
      actorAvatar: String(meta.authorAvatar || meta.actorAvatar || ""),
      dropTitle,
    },
    priority: activityType === "dm" ? "high" : "medium",
    action_required: false,
    created_at: createdAt,
    read_at: historicalReadAt(createdAt),
    seen_at: historicalReadAt(createdAt),
  });
}

export function notificationFromDirectMessage(
  row: Record<string, any>,
  recipientUserId: string,
  actor?: { displayName?: string | null; username?: string | null; avatarUrl?: string | null } | null
): BoardNotification | null {
  if (String(row.recipient_id || "") !== recipientUserId) return null;
  const createdAt = String(row.created_at || new Date().toISOString());
  const actorName = String(actor?.displayName || "").trim() || "Someone";
  return mapNotificationRow({
    id: `legacy-dm:${String(row.id)}`,
    recipient_id: recipientUserId,
    actor_id: isUuid(row.sender_id) ? String(row.sender_id) : null,
    activity_type: "dm",
    entity_type: "conversation",
    entity_id: String(row.sender_id || ""),
    conversation_id: `friend:${String(row.sender_id || "")}`,
    message: `${actorName} sent you a message.`,
    preview: String(row.body || "").trim().slice(0, 280) || null,
    metadata: {
      legacyKey: `dm:${String(row.id)}`,
      legacySource: "board_direct_messages",
      actorName,
      actorUsername: String(actor?.username || ""),
      actorAvatar: String(actor?.avatarUrl || ""),
    },
    priority: "high",
    action_required: false,
    created_at: createdAt,
    read_at: historicalReadAt(createdAt, row.read_at ? String(row.read_at) : null),
    seen_at: historicalReadAt(createdAt, row.read_at ? String(row.read_at) : null),
  });
}

export function notificationFromDropComment(
  row: Record<string, any>,
  recipientUserId: string,
  drop?: OwnedDrop | null
): BoardNotification | null {
  const commentId = String(row.id || "").trim();
  const dropId = String(row.drop_id || drop?.id || "").trim();
  const actorId = row.user_id ? String(row.user_id) : "";
  if (!commentId || !dropId) return null;
  if (actorId && actorId === recipientUserId) return null;
  if (String(row.deleted_at || "").trim()) return null;

  const createdAt = String(row.created_at || new Date().toISOString());
  const actorName =
    String(row.display_name || "").trim() ||
    (row.username ? `@${String(row.username).replace(/^@+/, "")}` : "") ||
    "Someone";
  const dropTitle = String(drop?.title || "Drop").trim() || "Drop";

  return mapNotificationRow({
    id: `legacy-comment:${commentId}`,
    recipient_id: recipientUserId,
    actor_id: isUuid(actorId) ? actorId : null,
    activity_type: "comment",
    entity_type: "drop",
    entity_id: dropId,
    drop_id: dropId,
    comment_id: isUuid(commentId) ? commentId : null,
    message: `${actorName} commented on ${dropTitle}.`,
    preview: String(row.body || "").trim().slice(0, 280) || null,
    href: drop?.href || null,
    image_url: drop?.imageUrl || null,
    metadata: {
      legacyKey: `drop_comment:${commentId}`,
      legacySource: "board_drop_comments",
      actorName,
      actorUsername: String(row.username || "").replace(/^@+/, ""),
      actorAvatar: String(row.avatar_url || row.avatarUrl || ""),
      dropTitle,
      commentId,
      commentDropId: dropId,
    },
    priority: "medium",
    action_required: false,
    created_at: createdAt,
    read_at: historicalReadAt(createdAt),
    seen_at: historicalReadAt(createdAt),
  });
}

function actorFromProfile(actor: any) {
  const style = actor?.board_style && typeof actor.board_style === "object" ? actor.board_style : {};
  return {
    displayName:
      String(actor?.display_name || style.displayName || "").trim() || "Someone",
    username: String(actor?.username || ""),
    avatarUrl: String(actor?.avatar_url || style.avatarUrl || ""),
  };
}

async function loadOwnedDrops(
  supabase: SupabaseClient,
  recipientUserId: string
): Promise<Map<string, OwnedDrop>> {
  const owned = new Map<string, OwnedDrop>();
  const remember = (drop: OwnedDrop) => {
    const id = String(drop.id || "").trim();
    if (!id || owned.has(id)) return;
    owned.set(id, drop);
  };

  const profile = await supabase
    .from("profiles")
    .select("board_style")
    .eq("id", recipientUserId)
    .maybeSingle();
  for (const drop of ownedDropsFromBoardStyle(profile.data?.board_style)) {
    remember(drop);
  }

  const activity = await supabase
    .from("board_activity")
    .select("id, title, href, image_url, meta")
    .eq("user_id", recipientUserId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  for (const row of activity.data || []) {
    const meta = metaOf(row as Record<string, any>);
    if (meta.presence === true || meta.source === "board_presence") continue;
    const title = String(row.title || meta.dropTitle || "Drop").trim() || "Drop";
    const href = row.href || null;
    const imageUrl = row.image_url || null;
    const ids = [
      String(meta.dropId || "").trim(),
      String(row.id || "").trim(),
      String(meta.referencedDropId || "").trim(),
    ].filter(Boolean);
    for (const id of ids) {
      remember({ id, title, href, imageUrl });
    }
  }

  return owned;
}

async function loadCommentsOnOwnedDrops(
  supabase: SupabaseClient,
  recipientUserId: string,
  owned: Map<string, OwnedDrop>
): Promise<BoardNotification[]> {
  const dropIds = Array.from(owned.keys());
  if (!dropIds.length) return [];

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < dropIds.length; i += DROP_ID_BATCH) {
    const batch = dropIds.slice(i, i + DROP_ID_BATCH);
    const { data, error } = await supabase
      .from("board_drop_comments")
      .select("id, drop_id, user_id, username, display_name, avatar_url, body, created_at, deleted_at")
      .in("drop_id", batch)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) continue;
    rows.push(...((data || []) as Record<string, any>[]));
  }

  return rows
    .map((row) =>
      notificationFromDropComment(row, recipientUserId, owned.get(String(row.drop_id || "")))
    )
    .filter((row): row is BoardNotification => Boolean(row));
}

export async function loadLegacyNotifications(
  supabase: SupabaseClient,
  recipientUserId: string
): Promise<BoardNotification[]> {
  const [activity, dms, owned] = await Promise.all([
    supabase
      .from("board_activity")
      .select("id, user_id, kind, title, body, href, image_url, meta, created_at")
      .eq("meta->>recipientUserId", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("board_direct_messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .eq("recipient_id", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    loadOwnedDrops(supabase, recipientUserId),
  ]);

  const activityItems = activity.error
    ? []
    : (activity.data || [])
        .map((row) => notificationFromActivityRow(row as Record<string, any>, recipientUserId))
        .filter((row): row is BoardNotification => Boolean(row));

  const senderIds = Array.from(
    new Set(
      (dms.data || [])
        .map((row: any) => String(row.sender_id || ""))
        .filter((id) => isUuid(id))
    )
  );
  const actors = senderIds.length
    ? (
        await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, board_style")
          .in("id", senderIds)
      ).data || []
    : [];
  const actorById = new Map(
    actors.map((actor: any) => [String(actor.id), actorFromProfile(actor)] as const)
  );

  const dmItems = dms.error
    ? []
    : (dms.data || [])
        .map((row) =>
          notificationFromDirectMessage(
            row as Record<string, any>,
            recipientUserId,
            actorById.get(String((row as any).sender_id || ""))
          )
        )
        .filter((row): row is BoardNotification => Boolean(row));

  let commentItems: BoardNotification[] = [];
  try {
    commentItems = await loadCommentsOnOwnedDrops(supabase, recipientUserId, owned);
  } catch {
    commentItems = [];
  }

  return mergeNotificationLists(activityItems, [...dmItems, ...commentItems]);
}
