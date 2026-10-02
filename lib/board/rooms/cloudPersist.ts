import { persistableMediaUrl } from "@/lib/board/activity";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { forumRoomFeedCopy } from "@/lib/board/forumRoomFeedCopy";
import { getRoomById, resolveRoomId } from "./catalog";
import {
  activityMatchesRoom,
  activitiesFromProfileBoardStyle,
  forumRoomActivityHref,
  roomActivityOrFilter,
  type RoomActivityLike,
} from "./cloudHydrate";
import { isMissingRoomsTable } from "./server";
import type { RoomShareOrigin } from "@/lib/board/forumRoomDrop";

type SupabaseLike = {
  from: (table: string) => any;
  auth?: { getUser?: () => Promise<{ data: { user: { id: string } | null } }> };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function selectRoomActivities(
  supabase: SupabaseLike,
  roomId: string
): Promise<RoomActivityLike[]> {
  const resolved = resolveRoomId(roomId) || String(roomId || "").trim();
  if (!resolved) return [];
  const orFilter = roomActivityOrFilter(resolved);
  let fromTable: RoomActivityLike[] = [];
  try {
    const { data, error } = await supabase
      .from("board_activity")
      .select("*")
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(80);
    if (!error && Array.isArray(data)) {
      fromTable = data.filter((row) => activityMatchesRoom(row as RoomActivityLike, resolved));
    } else {
      const fallback = await supabase
        .from("board_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(160);
      fromTable = (Array.isArray(fallback.data) ? fallback.data : []).filter((row: RoomActivityLike) =>
        activityMatchesRoom(row, resolved)
      );
    }
  } catch {
    fromTable = [];
  }

  let fromProfiles: RoomActivityLike[] = [];
  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, board_style")
      .limit(500);
    fromProfiles = activitiesFromProfileBoardStyle(
      (profiles || []) as Record<string, unknown>[]
    ).filter((row) => activityMatchesRoom(row, resolved));
  } catch {
    fromProfiles = [];
  }

  const byDrop = new Map<string, RoomActivityLike>();
  for (const row of [...fromProfiles, ...fromTable]) {
    const dropId = text(asRecord(row.meta).dropId) || text(row.id);
    if (!dropId) continue;
    byDrop.set(dropId, row);
  }
  return [...byDrop.values()];
}

export async function findExistingRoomDropActivity(
  supabase: SupabaseLike,
  input: { userId: string; dropId: string; roomId: string }
): Promise<RoomActivityLike | null> {
  const dropId = text(input.dropId);
  const roomId = resolveRoomId(input.roomId) || text(input.roomId);
  if (!dropId || !roomId || !input.userId) return null;
  try {
    const { data, error } = await supabase
      .from("board_activity")
      .select("*")
      .eq("user_id", input.userId)
      .eq("meta->>dropId", dropId)
      .eq("meta->>roomId", roomId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!error && data?.[0]) return data[0] as RoomActivityLike;
  } catch {
    // continue
  }
  return null;
}

export async function ensureRoomShareActivity(
  supabase: SupabaseLike,
  input: {
    userId: string;
    roomId: string;
    dropId: string;
    snapshot?: Record<string, unknown> | null;
    displayName?: string | null;
    origin?: RoomShareOrigin | string | null;
    conversationId?: string | null;
    conversationTitle?: string | null;
    activityId?: string | null;
  }
): Promise<{ ok: true; source: "db" | "existing"; id?: string } | { ok: false; message: string }> {
  const roomId = resolveRoomId(input.roomId) || text(input.roomId);
  const dropId = text(input.dropId);
  const room = roomId ? getRoomById(roomId) : null;
  if (!roomId || !room || !dropId || !input.userId) {
    return { ok: false, message: "Room Drop activity is missing a room or Drop id." };
  }

  const existing = await findExistingRoomDropActivity(supabase, {
    userId: input.userId,
    dropId,
    roomId,
  });
  if (existing?.id) return { ok: true, source: "existing", id: String(existing.id) };

  const snapshot = asRecord(input.snapshot);
  const originRaw = text(input.origin).toLowerCase();
  const origin: RoomShareOrigin =
    originRaw === "create" || originRaw === "share" || originRaw === "conversation"
      ? originRaw
      : "share";
  const conversationId = text(input.conversationId) || text(snapshot.conversationId) || "";
  const actorName =
    pickBoardDisplayName(input.displayName, snapshot.authorName, snapshot.authorUsername) || "Someone";
  const copy = forumRoomFeedCopy({
    kind: origin === "conversation" ? "room_conversation" : "room",
    roomId,
    roomName: room.name,
    roomIcon: room.icon,
    conversationTitle: text(input.conversationTitle) || text(snapshot.conversationTitle),
    actorName,
  });
  const href =
    persistableMediaUrl(snapshot.url) ||
    persistableMediaUrl(snapshot.mediaUrl) ||
    persistableMediaUrl(snapshot.embedUrl) ||
    persistableMediaUrl(snapshot.linkUrl);
  const imageUrl =
    text(snapshot.mediaKind) === "audio"
      ? null
      : persistableMediaUrl(snapshot.previewImage) ||
        persistableMediaUrl(snapshot.mediaUrl) ||
        persistableMediaUrl(snapshot.url);
  const meta = {
    source: origin === "share" ? "forum_room_share" : "forum_room_studio",
    origin,
    destinationType: origin === "conversation" ? "room_conversation" : "room",
    roomId,
    roomName: room.name,
    roomIcon: room.icon,
    conversationId: conversationId || null,
    conversationTitle: text(input.conversationTitle) || text(snapshot.conversationTitle) || null,
    dropId,
    dropType: snapshot.type || snapshot.dropType || "Media",
    mediaKind: snapshot.mediaKind ?? null,
    mediaUrl: persistableMediaUrl(snapshot.mediaUrl) || href,
    bucket: snapshot.bucket ?? null,
    storagePath: snapshot.storagePath ?? null,
    fileName: snapshot.fileName ?? null,
    mime: snapshot.mime ?? null,
    previewImage: persistableMediaUrl(snapshot.previewImage),
    previewImages: snapshot.previewImages ?? null,
    previewTitle: snapshot.previewTitle ?? snapshot.headline ?? null,
    previewDescription: snapshot.previewDescription ?? null,
    embedUrl: persistableMediaUrl(snapshot.embedUrl),
    hostLabel: snapshot.hostLabel ?? null,
    fromDescript: snapshot.fromDescript === true,
    fromDropbook: snapshot.fromDropbook === true,
    visibility: snapshot.visibility === "private" ? "private" : "public",
    customizations: snapshot.customizations ?? null,
    authorName: actorName,
    authorAvatar: snapshot.authorAvatar ?? null,
    authorUsername: snapshot.authorUsername ?? null,
    forumPath: forumRoomActivityHref(roomId, conversationId || null),
  };

  try {
    const { data, error } = await supabase
      .from("board_activity")
      .insert({
        scope: "global",
        user_id: input.userId,
        kind: "board_drop",
        title: copy.title,
        body: copy.body,
        href: href || forumRoomActivityHref(roomId, conversationId || null),
        image_url: imageUrl,
        meta,
      })
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    return { ok: true, source: "db", id: data?.id ? String(data.id) : undefined };
  } catch (error: any) {
    return { ok: false, message: error?.message || "board_activity insert failed" };
  }
}

export async function ensureRoomPostActivity(
  supabase: SupabaseLike,
  input: {
    userId: string;
    roomId: string;
    kind: string;
    title?: string | null;
    body?: string | null;
    displayName?: string | null;
    parentId?: string | null;
    conversationTitle?: string | null;
    dropId?: string | null;
    dropTitle?: string | null;
    snapshot?: Record<string, unknown> | null;
  }
): Promise<{ ok: true; source: "db" | "existing" } | { ok: false; message: string }> {
  const roomId = resolveRoomId(input.roomId) || text(input.roomId);
  const room = roomId ? getRoomById(roomId) : null;
  if (!roomId || !room || !input.userId) {
    return { ok: false, message: "Room conversation activity is missing a room." };
  }
  const dropId = text(input.dropId);
  if (dropId) {
    const existing = await findExistingRoomDropActivity(supabase, {
      userId: input.userId,
      dropId,
      roomId,
    });
    if (existing) return { ok: true, source: "existing" };
    const created = await ensureRoomShareActivity(supabase, {
      userId: input.userId,
      roomId,
      dropId,
      snapshot: input.snapshot,
      displayName: input.displayName,
      origin: "conversation",
      conversationId: input.parentId,
      conversationTitle: input.conversationTitle,
    });
    if (!created.ok) return created;
    return { ok: true, source: created.source === "existing" ? "existing" : "db" };
  }

  const actorName = pickBoardDisplayName(input.displayName) || "Someone";
  const title = text(input.title) || "Conversation";
  const body = text(input.body) || title;
  try {
    const { error } = await supabase.from("board_activity").insert({
      scope: "global",
      user_id: input.userId,
      kind: "forum_post",
      title,
      body,
      href: forumRoomActivityHref(roomId, input.parentId),
      image_url: null,
      meta: {
        source: "forum_room_signal",
        origin: input.kind === "reply" ? "conversation" : "create",
        destinationType: input.kind === "reply" ? "room_conversation" : "room",
        roomId,
        roomName: room.name,
        roomIcon: room.icon,
        conversationId: text(input.parentId) || null,
        conversationTitle: text(input.conversationTitle) || title,
        authorName: actorName,
      },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, source: "db" };
  } catch (error: any) {
    return { ok: false, message: error?.message || "forum_post insert failed" };
  }
}

export async function ensureJoinedRoomMember(
  supabase: SupabaseLike,
  roomId: string,
  userId: string
): Promise<{ ok: true; setupRequired?: boolean } | { ok: false; message: string }> {
  const resolved = resolveRoomId(roomId) || roomId;
  const row = {
    room_id: resolved,
    user_id: userId,
    role: "member",
    status: "joined",
    following: true,
    last_entered_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from("room_members").upsert(row, { onConflict: "room_id,user_id" });
    if (error && isMissingRoomsTable(error)) return { ok: true, setupRequired: true };
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch {
    return { ok: true, setupRequired: true };
  }
}
