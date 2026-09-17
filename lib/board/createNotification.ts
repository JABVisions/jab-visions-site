import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actionRequiredForType,
  normalizeActivityType,
  priorityForActivityType,
  type ActivityType,
} from "@/lib/board/notifications";

export type CreateNotificationInput = {
  recipientId: string;
  activityType: ActivityType | string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dropId?: string | null;
  commentId?: string | null;
  conversationId?: string | null;
  friendzoneRequestId?: string | null;
  signalId?: string | null;
  message?: string | null;
  preview?: string | null;
  href?: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  priority?: "high" | "medium" | "normal";
  actionRequired?: boolean;
  groupKey?: string | null;
};

export function isMissingNotificationsError(
  error: { code?: string; message?: string } | null | undefined
) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "PGRST205" ||
    error?.code === "42883" ||
    error?.code === "42P01" ||
    message.includes("board_notifications") ||
    message.includes("create_board_notification") ||
    message.includes("schema cache")
  );
}

function cleanUuid(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function cleanText(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function createBoardNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
) {
  const recipientId = cleanUuid(input.recipientId);
  const actorId = cleanUuid(input.actorId);
  const activityType = normalizeActivityType(input.activityType);
  if (!recipientId || !activityType) return { id: null as string | null, skipped: true };

  const { data, error } = await supabase.rpc("create_board_notification", {
    p_recipient_id: recipientId,
    p_activity_type: activityType,
    p_actor_id: actorId || null,
    p_entity_type: cleanText(input.entityType, 80) || null,
    p_entity_id: cleanText(input.entityId, 240) || null,
    p_drop_id: cleanText(input.dropId, 240) || null,
    p_comment_id: cleanUuid(input.commentId) || null,
    p_conversation_id: cleanText(input.conversationId, 240) || null,
    p_friendzone_request_id: cleanText(input.friendzoneRequestId, 240) || null,
    p_signal_id: cleanText(input.signalId, 240) || null,
    p_message: cleanText(input.message, 400) || null,
    p_preview: cleanText(input.preview, 280) || null,
    p_href: cleanText(input.href, 2000) || null,
    p_image_url: cleanText(input.imageUrl, 2000) || null,
    p_metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    p_priority: input.priority || priorityForActivityType(activityType),
    p_action_required:
      typeof input.actionRequired === "boolean"
        ? input.actionRequired
        : actionRequiredForType(activityType),
    p_group_key: cleanText(input.groupKey, 240) || null,
  });

  if (error) {
    return { id: null as string | null, skipped: false, error };
  }

  return { id: data ? String(data) : null, skipped: !data };
}
