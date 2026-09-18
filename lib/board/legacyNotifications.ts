import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapNotificationRow,
  normalizeActivityType,
  type BoardNotification,
} from "@/lib/board/notifications";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function metaOf(row: Record<string, any>) {
  return row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? (row.meta as Record<string, unknown>)
    : {};
}

function historicalReadAt(createdAt: string, knownReadAt?: string | null) {
  if (knownReadAt) return knownReadAt;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return createdAt;
  return Date.now() - created > 48 * 60 * 60 * 1000 ? createdAt : null;
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

export async function loadLegacyNotifications(
  supabase: SupabaseClient,
  recipientUserId: string
): Promise<BoardNotification[]> {
  const [activity, dms] = await Promise.all([
    supabase
      .from("board_activity")
      .select("id, user_id, kind, title, body, href, image_url, meta, created_at")
      .eq("meta->>recipientUserId", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("board_direct_messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .eq("recipient_id", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(200),
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
    actors.map((actor: any) => {
      const style = actor.board_style && typeof actor.board_style === "object" ? actor.board_style : {};
      return [
        String(actor.id),
        {
          displayName:
            String(actor.display_name || style.displayName || "").trim() || "Someone",
          username: String(actor.username || ""),
          avatarUrl: String(actor.avatar_url || style.avatarUrl || ""),
        },
      ] as const;
    })
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

  return [...activityItems, ...dmItems];
}
