import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById, roomHref } from "@/lib/board/rooms/catalog";
import { hydrateAuthorRows } from "@/lib/board/rooms/authors";
import { isMissingRoomsTable, json, roomMembershipGate } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";
import { isUuid } from "@/lib/board/forumRoomDrop";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { conversationsFromPostRows } from "@/lib/board/rooms/roomPostsSource";
import { mergeConversationSources } from "@/lib/board/rooms/roomPostsSource";
import { postRowsFromActivity } from "@/lib/board/rooms/cloudHydrate";
import {
  ensureJoinedRoomMember,
  ensureRoomPostActivity,
  selectRoomActivities,
} from "@/lib/board/rooms/cloudPersist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);
  try {
    const supabase = supabaseServer();
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    const [{ data, error }, activities] = await Promise.all([
      supabase
        .from("room_posts")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(120),
      selectRoomActivities(supabase, roomId),
    ]);
    const setupRequired = Boolean(error && isMissingRoomsTable(error));
    const sqlPosts = error && !setupRequired ? [] : ((data || []) as Record<string, unknown>[]);
    const sqlHydrated = sqlPosts.length
      ? await hydrateAuthorRows(supabase, sqlPosts, "author_id")
      : [];
    const activityPosts = postRowsFromActivity(roomId, activities, viewer?.id || null);
    const mergedConversations = mergeConversationSources({
      roomId,
      local: conversationsFromPostRows(roomId, activityPosts),
      remote: conversationsFromPostRows(roomId, sqlHydrated),
    });
    const posts: Array<Record<string, unknown>> = [];
    for (const conversation of mergedConversations) {
      posts.push({
        id: conversation.id,
        room_id: conversation.roomId,
        kind: "conversation",
        title: conversation.title,
        body: conversation.body,
        author_name: conversation.authorName,
        avatar_url: conversation.authorAvatar,
        created_at: conversation.createdAt,
        pinned: conversation.isPinned === true,
      });
      for (const reply of conversation.replies || []) {
        posts.push({
          id: reply.id,
          room_id: conversation.roomId,
          kind: "reply",
          parent_id: conversation.id,
          body: reply.body,
          author_name: reply.authorName,
          avatar_url: reply.authorAvatar,
          created_at: reply.createdAt,
          drop_id: reply.dropId || null,
          metadata: reply.dropSnapshot ? { dropSnapshot: reply.dropSnapshot } : {},
        });
      }
    }
    return json({
      ok: true,
      posts,
      setupRequired: setupRequired || undefined,
      source: setupRequired ? "activity" : "union",
    });
  } catch {
    return json({ ok: true, posts: [] });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  const room = roomId ? getRoomById(roomId) : null;
  if (!roomId || !room) return json({ ok: false, message: "Room not found" }, 404);
  const resolvedRoomId = roomId;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);
  const userId = user.id;

  let gate = await roomMembershipGate(supabase, resolvedRoomId, userId);
  if (!gate.ok) {
    const joined = await ensureJoinedRoomMember(supabase, resolvedRoomId, userId);
    if (joined.ok) gate = { ok: true, setupRequired: joined.setupRequired };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const kind = String(body.kind || "conversation");
  const title = String(body.title || "").trim();
  const dropId = String(body.dropId || "").trim();
  const postBody = String(body.body || "").trim() || (dropId ? "Replied with a Drop" : "");
  if (!postBody && !dropId) return json({ ok: false, message: "body is required" }, 400);

  const snapshot =
    body.metadata && typeof body.metadata === "object"
      ? (((body.metadata as { dropSnapshot?: Record<string, unknown> }).dropSnapshot as
          | Record<string, unknown>
          | undefined) || {})
      : {};
  const rawParent = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  const parentId = rawParent && isUuid(rawParent) ? rawParent : null;

  async function persistActivityCloud() {
    return ensureRoomPostActivity(supabase, {
      userId,
      roomId: resolvedRoomId,
      kind,
      title,
      body: postBody,
      displayName: typeof body.displayName === "string" ? body.displayName : null,
      parentId: rawParent,
      conversationTitle: typeof body.conversationTitle === "string" ? body.conversationTitle : title,
      dropId,
      dropTitle: typeof body.dropTitle === "string" ? body.dropTitle : null,
      snapshot,
    });
  }

  if (kind === "reply" && rawParent && !parentId) {
    const activity = await persistActivityCloud();
    return json({
      ok: true,
      persisted: activity.ok ? "activity" : "local",
      post: {
        room_id: roomId,
        author_id: userId,
        parent_id: rawParent,
        kind: "reply",
        title: title || null,
        body: postBody,
        drop_id: dropId || null,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        id: `activity_${Date.now()}`,
      },
    });
  }

  const row: Record<string, unknown> = {
    room_id: roomId,
    author_id: userId,
    parent_id: parentId,
    kind: ["conversation", "text_post", "reply", "announcement"].includes(kind) ? kind : "text_post",
    title: title || null,
    body: postBody,
    official: body.official === true,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    drop_id: dropId || null,
  };

  if (!gate.ok) {
    const activity = await persistActivityCloud();
    return json({
      ok: true,
      persisted: activity.ok ? "activity" : "local",
      post: { ...row, id: `activity_${Date.now()}` },
    });
  }

  let { data, error } = await supabase.from("room_posts").insert(row).select("*").maybeSingle();
  if (error && /drop_id|schema cache/i.test(String(error.message || ""))) {
    const fallback = { ...row };
    delete fallback.drop_id;
    const retry = await supabase.from("room_posts").insert(fallback).select("*").maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error && isMissingRoomsTable(error)) {
    const activity = await persistActivityCloud();
    return json({
      ok: true,
      persisted: activity.ok ? "activity" : "local",
      post: { ...row, id: `activity_${Date.now()}` },
    });
  }
  if (error) {
    const activity = await persistActivityCloud();
    if (activity.ok) {
      return json({ ok: true, persisted: "activity", post: { ...row, id: `activity_${Date.now()}` }, warning: error.message });
    }
    return json({ ok: false, message: error.message }, 500);
  }
  void persistActivityCloud();

  if (kind === "reply" || kind === "announcement") {
    const activityType = kind === "announcement" ? "room_announcement" : "room_reply";
    const actorName = pickBoardDisplayName(body.displayName) || "Someone";
    const conversationTitle = String(body.conversationTitle || "").trim();
    const dropTitle = String(body.dropTitle || "").trim();
    const mentionIds = Array.isArray(body.mentionUserIds) ? body.mentionUserIds.map(String) : [];
    const recipientIds = new Set<string>(mentionIds);
    if (typeof body.notifyUserId === "string") recipientIds.add(body.notifyUserId);
    if (dropId) {
      const { data: followers } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("following", true);
      for (const follower of followers || []) {
        const recipientId = String((follower as { user_id?: string }).user_id || "");
        if (recipientId) recipientIds.add(recipientId);
      }
    }

    for (const recipientId of recipientIds) {
      if (!recipientId || recipientId === user.id) continue;
      await createBoardNotification(supabase, {
        recipientId,
        actorId: user.id,
        activityType: mentionIds.includes(recipientId) ? "room_mention" : activityType,
        entityType: "room",
        entityId: roomId,
        dropId: dropId || undefined,
        href: roomHref(roomId, parentId ? { conversation: parentId } : undefined),
        message: describeRoomActivity(
          mentionIds.includes(recipientId) ? "room_mention" : activityType,
          actorName,
          room.name,
          { conversationTitle, dropTitle }
        ),
        metadata: { roomId, roomName: room.name, actorName, conversationTitle, dropTitle },
        groupKey: roomActivityGroupKey(
          mentionIds.includes(recipientId) ? "room_mention" : activityType,
          roomId
        ),
      }).catch(() => undefined);
    }
  }

  return json({ ok: true, persisted: "db", post: data || row });
}
