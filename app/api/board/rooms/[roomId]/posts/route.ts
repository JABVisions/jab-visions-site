import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId, getRoomById, roomHref } from "@/lib/board/rooms/catalog";
import { hydrateAuthorRows } from "@/lib/board/rooms/authors";
import { isMissingRoomsTable, json, roomMembershipGate } from "@/lib/board/rooms/server";
import { describeRoomActivity, roomActivityGroupKey } from "@/lib/board/rooms/activity";
import { createBoardNotification } from "@/lib/board/createNotification";
import { isUuid } from "@/lib/board/forumRoomDrop";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";

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
    const { data, error } = await supabase
      .from("room_posts")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error && isMissingRoomsTable(error)) return json({ ok: true, posts: [], setupRequired: true });
    if (error) return json({ ok: true, posts: [], warning: error.message });
    const posts = await hydrateAuthorRows(
      supabase,
      (data || []) as Record<string, unknown>[],
      "author_id"
    );
    return json({ ok: true, posts });
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

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const gate = await roomMembershipGate(supabase, roomId, user.id);
  if (!gate.ok) return json({ ok: false, message: gate.message }, gate.status);

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

  const rawParent = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  const parentId = rawParent && isUuid(rawParent) ? rawParent : null;
  if (kind === "reply" && rawParent && !parentId) {
    return json({
      ok: true,
      persisted: "local",
      post: {
        room_id: roomId,
        author_id: user.id,
        parent_id: rawParent,
        kind: "reply",
        title: title || null,
        body: postBody,
        drop_id: dropId || null,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        id: `local_${Date.now()}`,
      },
    });
  }

  const row: Record<string, unknown> = {
    room_id: roomId,
    author_id: user.id,
    parent_id: parentId,
    kind: ["conversation", "text_post", "reply", "announcement"].includes(kind) ? kind : "text_post",
    title: title || null,
    body: postBody,
    official: body.official === true,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    drop_id: dropId || null,
  };

  let { data, error } = await supabase.from("room_posts").insert(row).select("*").maybeSingle();
  if (error && /drop_id|schema cache/i.test(String(error.message || ""))) {
    const fallback = { ...row };
    delete fallback.drop_id;
    const retry = await supabase.from("room_posts").insert(fallback).select("*").maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", post: { ...row, id: `local_${Date.now()}` } });
  }
  if (error) return json({ ok: false, message: error.message }, 500);

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
