"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hostedOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { presenceFromApiRow, pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { resolveCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { PROFILE_STORAGE_KEY } from "@/lib/board/dropItem";
import type { DropItem } from "@/lib/board/dropItem";
import {
  getRoomById,
  mergeRoomFeed,
  permissionsForRole,
  resolveRoomId,
  seedConversations,
  conversationsForRoom,
  type Room,
  type RoomCallSession,
  type RoomConversation as RoomConversationRecord,
  type RoomDropShare,
  type RoomLiveSession,
  type RoomPresence as RoomPresencePerson,
  type RoomRole,
  ROOM_PRESENCE_HEARTBEAT_MS,
} from "@/lib/board/rooms";
import {
  activeSessionsFor,
  hasEmittedJoinActivity,
  markJoinActivity,
  membershipFor,
  readConversations,
  readPresence,
  readShares,
  rememberRecentRoom,
  upsertConversation,
  upsertMembership,
  upsertShare,
  writeConversations,
  writePresence,
  writeSessions,
  writeShares,
  readSessions,
} from "@/lib/board/rooms/storage";
import { upsertPresence } from "@/lib/board/rooms/presence";
import { shouldEmitRoomActivity } from "@/lib/board/rooms/activity";
import { readForums } from "@/lib/boardStore";
import RoomHeader from "./RoomHeader";
import RoomLivePreview from "./RoomLivePreview";
import RoomCallPreview from "./RoomCallPreview";
import RoomActivityFeed from "./RoomActivityFeed";
import RoomShareDrop from "./RoomShareDrop";
import RoomConversation from "./RoomConversation";
import RoomDropComposer from "./RoomDropComposer";
import DropStudioLauncher from "@/app/components/board/DropStudioLauncher";
import type { DropDestination } from "@/lib/board/dropDestination";
import { suggestedStudioModeForRoom } from "@/lib/board/dropDestination";
import type { StudioCaptureMode } from "@/lib/board/dropItem";
import {
  canCreateConversationDrop,
  canCreateRoomDrop,
  canRemoveFromRoom,
  conversationReplyFromDrop,
  dropSnapshotFromItem,
  removeShareFromRoom,
  shareFromCreatedDrop,
} from "@/lib/board/forumRoomDrop";

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalIdentity() {
  if (typeof window === "undefined") {
    return { userId: "local", displayName: "You", username: "", avatarUrl: "" };
  }
  try {
    const profile = JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return {
      userId: String(profile.id || profile.userId || "local"),
      displayName: pickBoardDisplayName(profile.displayName, profile.name, profile.username) || "You",
      username: String(profile.handle || profile.username || ""),
      avatarUrl: hostedOrbAvatarUrl(profile.avatarUrl, profile.avatarDataUrl),
    };
  } catch {
    return { userId: "local", displayName: "You", username: "", avatarUrl: "" };
  }
}

export default function RoomInterior({ roomId }: { roomId: string }) {
  const router = useRouter();
  const resolved = resolveRoomId(roomId);
  const [room, setRoom] = useState<Room | null>(resolved ? getRoomById(resolved) : null);
  const [conversations, setConversations] = useState<RoomConversationRecord[]>([]);
  const [shares, setShares] = useState<RoomDropShare[]>([]);
  const [people, setPeople] = useState<RoomPresencePerson[]>([]);
  const [call, setCall] = useState<RoomCallSession | null>(null);
  const [live, setLive] = useState<RoomLiveSession | null>(null);
  const [role, setRole] = useState<RoomRole>("viewer");
  const [joined, setJoined] = useState(false);
  const [following, setFollowing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<StudioCaptureMode>("photo");
  const [studioDestination, setStudioDestination] = useState<DropDestination | null>(null);
  const [successNote, setSuccessNote] = useState("");

  const [identity, setIdentity] = useState(readLocalIdentity);
  const userId = authUserId || identity.userId;

  useEffect(() => {
    let cancelled = false;
    void resolveCurrentBoardIdentity().then((next) => {
      if (cancelled) return;
      if (next.id && next.id !== "board-user") setAuthUserId(next.id);
      setIdentity({
        userId: next.id || "local",
        displayName: pickBoardDisplayName(next.displayName, next.username) || next.displayName,
        username: next.username,
        avatarUrl: hostedOrbAvatarUrl(next.avatar),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hydrateLocal = useCallback((id: string) => {
    const seeded = seedConversations(readConversations());
    try {
      const db = readForums();
      for (const thread of db.threads || []) {
        const mappedRoom = resolveRoomId(thread.forumId) || thread.forumId;
        if (seeded.some((item) => item.id === thread.id)) continue;
        seeded.push({
          id: thread.id,
          roomId: mappedRoom,
          title: thread.title,
          body: thread.body,
          authorName: thread.authorName,
          createdAt: new Date(thread.createdAt).toISOString(),
          replies: (db.replies || [])
            .filter((reply) => reply.threadId === thread.id)
            .map((reply) => ({
              id: reply.id,
              threadId: thread.id,
              authorName: reply.authorName,
              body: reply.body,
              createdAt: new Date(reply.createdAt).toISOString(),
            })),
        });
      }
    } catch {
      // boardStore is optional during first paint
    }
    writeConversations(seeded);
    setConversations(conversationsForRoom(seeded, id));
    setShares(readShares().filter((row) => resolveRoomId(row.roomId) === id));
    setPeople(readPresence().filter((row) => resolveRoomId(row.roomId) === id));
    const sessions = activeSessionsFor(id);
    setCall((sessions.find((row) => row.kind === "call") as RoomCallSession | undefined) || null);
    setLive((sessions.find((row) => row.kind === "live") as RoomLiveSession | undefined) || null);
    const mine = membershipFor(id, userId);
    setJoined(mine?.status === "joined");
    setFollowing(Boolean(mine?.following));
    setRole(mine?.role || "viewer");
  }, [userId]);

  useEffect(() => {
    if (!resolved || !room) return;
    rememberRecentRoom(resolved);
    hydrateLocal(resolved);
    const params = new URLSearchParams(window.location.search);
    setOpenThreadId(params.get("conversation") || params.get("thread"));
  }, [resolved, room, hydrateLocal]);

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    fetch(`/api/board/rooms/${resolved}`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !payload?.room) return;
        setRoom(payload.room);
        if (Array.isArray(payload.presence)) {
          setPeople(
            payload.presence
              .map((row: Record<string, unknown>) => presenceFromApiRow(row, resolved))
              .filter((row: ReturnType<typeof presenceFromApiRow>): row is NonNullable<typeof row> => Boolean(row))
          );
        }
      })
      .catch(() => undefined);
    fetch(`/api/board/rooms/${resolved}/shares`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.shares) || !payload.shares.length) return;
        setShares((current) => {
          const local = readShares().filter((row) => resolveRoomId(row.roomId) === resolved);
          const remote: RoomDropShare[] = payload.shares.map((row: any) => ({
            id: String(row.id),
            roomId: resolved,
            dropId: String(row.drop_id || row.dropId),
            sharedBy: String(row.shared_by || row.sharedBy || ""),
            sharedByName: pickBoardDisplayName(
              row.shared_by_name,
              row.display_name,
              row.snapshot?.authorName
            ),
            snapshot: {
              ...(row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {}),
              authorName: pickBoardDisplayName(
                row.shared_by_name,
                row.display_name,
                row.snapshot?.authorName
              ),
              authorAvatar: row.avatar_url || row.snapshot?.authorAvatar,
              authorUsername: row.username || row.snapshot?.authorUsername,
            },
            createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
            origin:
              row.origin === "create" || row.origin === "conversation" || row.origin === "share"
                ? row.origin
                : "share",
            conversationId: typeof row.conversation_id === "string" ? row.conversation_id : row.conversationId || null,
          }));
          const byKey = new Map<string, RoomDropShare>();
          for (const share of [...remote, ...local]) byKey.set(`${share.dropId}:${share.sharedBy}`, share);
          return [...byKey.values()];
        });
      })
      .catch(() => undefined);
    fetch(`/api/board/rooms/${resolved}/posts`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.posts) || !payload.posts.length) return;
        const remoteConversations = new Map<string, RoomConversationRecord>();
        const replies: Array<{ parentId: string; reply: RoomConversationRecord["replies"][number] }> = [];
        for (const row of payload.posts) {
          const id = String(row.id || "");
          const kind = String(row.kind || "conversation");
          const parentId = typeof row.parent_id === "string" ? row.parent_id : "";
          if (kind === "reply" && parentId) {
            replies.push({
              parentId,
              reply: {
                id,
                threadId: parentId,
                authorName: pickBoardDisplayName(row.author_name, row.display_name, row.username) || "Board",
                authorAvatar: String(row.avatar_url || row.author_avatar || ""),
                body: String(row.body || ""),
                createdAt: String(row.created_at || new Date().toISOString()),
                dropId: typeof row.drop_id === "string" && row.drop_id ? row.drop_id : undefined,
                dropSnapshot:
                  row.metadata && typeof row.metadata === "object"
                    ? (row.metadata.dropSnapshot as Record<string, unknown> | undefined)
                    : undefined,
              },
            });
            continue;
          }
          if (kind === "conversation" || kind === "text_post" || kind === "announcement") {
            remoteConversations.set(id, {
              id,
              roomId: resolved,
              title: String(row.title || "Conversation"),
              body: String(row.body || ""),
              authorName: pickBoardDisplayName(row.author_name, row.display_name, row.username) || "Board",
              authorAvatar: String(row.avatar_url || ""),
              createdAt: String(row.created_at || new Date().toISOString()),
              replies: [],
              isPinned: row.pinned === true,
            });
          }
        }
        for (const item of replies) {
          const thread = remoteConversations.get(item.parentId);
          if (thread) thread.replies = [item.reply, ...thread.replies];
        }
        if (!remoteConversations.size) return;
        const seeded = seedConversations(readConversations());
        const byId = new Map(seeded.map((item) => [item.id, item]));
        for (const remote of remoteConversations.values()) {
          const current = byId.get(remote.id);
          byId.set(remote.id, current ? { ...current, ...remote, replies: remote.replies.length ? remote.replies : current.replies } : remote);
        }
        const merged = [...byId.values()];
        writeConversations(merged);
        setConversations(conversationsForRoom(merged, resolved));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  useEffect(() => {
    if (!resolved || !room || room.comingSoon) return;
    let cancelled = false;
    const beat = async () => {
      const now = new Date().toISOString();
      const next = {
        userId,
        roomId: resolved,
        displayName: identity.displayName,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        lastSeenAt: now,
      };
      writePresence(upsertPresence(readPresence(), next));
      setPeople(readPresence().filter((row) => resolveRoomId(row.roomId) === resolved));
      try {
        await fetch(`/api/board/rooms/${resolved}/presence`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: identity.displayName,
            username: identity.username,
            avatarUrl: identity.avatarUrl,
          }),
        });
      } catch {
        // local presence still stands; never emit Activity Channel
      }
    };

    void beat();
    const timer = window.setInterval(() => {
      if (!cancelled) void beat();
    }, ROOM_PRESENCE_HEARTBEAT_MS);

    try {
      const sb = supabaseBrowser();
      sb.auth.getUser().then(({ data }) => {
        if (data?.user?.id) setAuthUserId(data.user.id);
      });
      const channel = sb.channel?.(`room_presence:${resolved}`);
      if (channel?.on) {
        channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "room_presence", filter: `room_id=eq.${resolved}` },
            () => {
              fetch(`/api/board/rooms/${resolved}/presence`)
                .then((res) => res.json())
                .then((payload) => {
                  if (!Array.isArray(payload?.presence)) return;
                  setPeople(
                    payload.presence
                      .map((row: Record<string, unknown>) => presenceFromApiRow(row, resolved))
                      .filter((row: ReturnType<typeof presenceFromApiRow>): row is NonNullable<typeof row> => Boolean(row))
                  );
                })
                .catch(() => undefined);
            }
          )
          .subscribe();
        return () => {
          cancelled = true;
          window.clearInterval(timer);
          void fetch(`/api/board/rooms/${resolved}/presence`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leave: true }),
          });
          try {
            sb.removeChannel(channel);
          } catch {
            // ignore
          }
        };
      }
    } catch {
      // no realtime — heartbeat is enough
    }

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [resolved, room, userId, identity.avatarUrl, identity.displayName, identity.username]);

  const permissions = permissionsForRole(role, room);
  const feed = useMemo(
    () =>
      mergeRoomFeed({
        conversations,
        shares,
        sessions: [call, live].filter(Boolean) as Array<RoomCallSession | RoomLiveSession>,
      }),
    [conversations, shares, call, live]
  );
  const openThread = conversations.find((item) => item.id === openThreadId) || null;

  if (!resolved || !room) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-xl font-semibold">That Room is not on the hallway yet.</div>
          <button type="button" onClick={() => router.push("/board/forums")} className="mt-4 text-sm text-emerald-200">
            Back to Forums
          </button>
        </div>
      </div>
    );
  }

  const currentRoom = room;

  function persistMembership(action: "join" | "follow" | "leave") {
    const nextRole: RoomRole = action === "follow" ? "viewer" : "member";
    upsertMembership({
      roomId: currentRoom.id,
      userId,
      role: nextRole,
      status: action === "leave" ? "left" : action === "follow" ? "following" : "joined",
      following: action !== "leave",
      joinedAt: new Date().toISOString(),
      lastEnteredAt: new Date().toISOString(),
      displayName: identity.displayName,
    });
    setJoined(action === "join");
    setFollowing(action !== "leave");
    setRole(action === "join" ? "member" : role);
    void fetch(`/api/board/rooms/${currentRoom.id}/membership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, displayName: identity.displayName }),
    });
    if (action === "join" && !hasEmittedJoinActivity(currentRoom.id, userId) && shouldEmitRoomActivity("room_joined")) {
      markJoinActivity(currentRoom.id, userId);
    }
  }

  function createConversation() {
    const title = composeTitle.trim();
    const body = composeBody.trim();
    if (!title || !body || currentRoom.comingSoon) return;
    const next: RoomConversationRecord = {
      id: uid("th"),
      roomId: currentRoom.id,
      title,
      body,
      authorName: identity.displayName,
      authorAvatar: identity.avatarUrl,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    upsertConversation(next);
    setConversations(conversationsForRoom(readConversations(), currentRoom.id));
    setComposeTitle("");
    setComposeBody("");
    setOpenThreadId(next.id);
    void fetch(`/api/board/rooms/${currentRoom.id}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "conversation", title, body, displayName: identity.displayName }),
    });
  }

  function sendReply(threadId: string, body: string) {
    const current = readConversations();
    const next = current.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            replies: [
              {
                id: uid("sig"),
                threadId,
                authorName: identity.displayName,
                authorAvatar: identity.avatarUrl,
                body,
                createdAt: new Date().toISOString(),
              },
              ...thread.replies,
            ],
          }
        : thread
    );
    writeConversations(next);
    setConversations(conversationsForRoom(next, currentRoom.id));
    void fetch(`/api/board/rooms/${currentRoom.id}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "reply",
        body,
        parentId: threadId,
        displayName: identity.displayName,
      }),
    });
  }

  function flashSuccess(text: string) {
    setSuccessNote(text);
    window.setTimeout(() => setSuccessNote(""), 1800);
  }

  function ensureJoined() {
    if (joined && (role === "member" || role === "moderator" || role === "host" || role === "owner")) return true;
    if (!permissions.join && !permissions.post) return false;
    persistMembership("join");
    return true;
  }

  function openRoomStudio(mode: StudioCaptureMode = suggestedStudioModeForRoom(currentRoom.id)) {
    if (!ensureJoined()) return;
    setStudioDestination({
      type: "room",
      roomId: currentRoom.id,
      roomName: currentRoom.name,
      roomIcon: currentRoom.icon,
    });
    setStudioMode(mode);
    setStudioOpen(true);
  }

  function openConversationStudio() {
    if (!openThread) return;
    if (!canCreateConversationDrop(permissions, openThread, currentRoom)) return;
    if (!ensureJoined()) return;
    setStudioDestination({
      type: "room_conversation",
      roomId: currentRoom.id,
      conversationId: openThread.id,
      roomName: currentRoom.name,
      roomIcon: currentRoom.icon,
      conversationTitle: openThread.title,
    });
    setStudioMode(suggestedStudioModeForRoom(currentRoom.id));
    setStudioOpen(true);
  }

  function shareDrop(drop: DropItem, origin: "create" | "share" = "share") {
    const share = shareFromCreatedDrop({
      id: uid("share"),
      roomId: currentRoom.id,
      drop,
      sharedBy: userId,
      sharedByName: identity.displayName,
      origin,
    });
    share.snapshot = {
      ...dropSnapshotFromItem(drop, {
        name: identity.displayName,
        avatar: identity.avatarUrl,
        username: identity.username,
      }),
      roomId: currentRoom.id,
      roomName: currentRoom.name,
      roomIcon: currentRoom.icon,
    };
    upsertShare(share);
    setShares(readShares().filter((row) => resolveRoomId(row.roomId) === currentRoom.id));
    setShareOpen(false);
    void fetch(`/api/board/rooms/${currentRoom.id}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dropId: drop.id,
        snapshot: share.snapshot,
        displayName: identity.displayName,
        origin,
      }),
    });
  }

  function replyWithDrop(drop: DropItem, threadId: string) {
    const current = readConversations();
    const thread = current.find((item) => item.id === threadId);
    const reply = conversationReplyFromDrop({
      id: uid("sig"),
      threadId,
      drop,
      authorName: identity.displayName,
      authorAvatar: identity.avatarUrl,
    });
    reply.dropSnapshot = {
      ...(reply.dropSnapshot ||
        dropSnapshotFromItem(drop, {
          name: identity.displayName,
          avatar: identity.avatarUrl,
          username: identity.username,
        })),
      authorName: identity.displayName,
      authorAvatar: identity.avatarUrl,
      roomId: currentRoom.id,
      roomName: currentRoom.name,
      roomIcon: currentRoom.icon,
      conversationTitle: thread?.title || "",
    };
    const next = current.map((item) =>
      item.id === threadId ? { ...item, replies: [reply, ...item.replies] } : item
    );
    writeConversations(next);
    setConversations(conversationsForRoom(next, currentRoom.id));
    void fetch(`/api/board/rooms/${currentRoom.id}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "reply",
        body: reply.body,
        parentId: threadId,
        displayName: identity.displayName,
        dropId: drop.id,
        dropTitle: drop.title,
        conversationTitle: thread?.title || "",
        metadata: { dropSnapshot: reply.dropSnapshot },
      }),
    });
  }

  async function onStudioPublished(drop: DropItem) {
    const destination = studioDestination;
    if (destination?.type === "room_conversation") {
      replyWithDrop(drop, destination.conversationId);
      flashSuccess("Replied with Drop");
    } else {
      shareDrop(drop, "create");
      flashSuccess("Posted to Room");
    }
    setStudioOpen(false);
    setStudioDestination(null);
  }

  function removeDropShare(dropId: string) {
    const share =
      shares.find((row) => row.dropId === dropId) ||
      readShares().find((row) => row.roomId === currentRoom.id && row.dropId === dropId);
    if (share && !canRemoveFromRoom({ share, userId, moderate: permissions.moderate })) return;
    const next = removeShareFromRoom(readShares(), { roomId: currentRoom.id, dropId });
    writeShares(next);
    setShares(next.filter((row) => resolveRoomId(row.roomId) === currentRoom.id));
    flashSuccess("Removed from Room");
    void fetch(`/api/board/rooms/${currentRoom.id}/shares?dropId=${encodeURIComponent(dropId)}`, {
      method: "DELETE",
    });
  }

  function startPlaceholder(kind: "call" | "live") {
    const startedAt = new Date().toISOString();
    if (kind === "call") {
      const session: RoomCallSession = {
        id: uid("call"),
        roomId: currentRoom.id,
        kind: "call",
        provider: "none",
        status: "live",
        startedBy: userId,
        startedAt,
        endedAt: null,
        participantIds: [userId],
      };
      writeSessions([session, ...readSessions().filter((row) => row.roomId !== currentRoom.id || row.kind !== "call")]);
      setCall(session);
      setRoom({ ...currentRoom, state: "ROOM" });
    } else {
      const session: RoomLiveSession = {
        id: uid("live"),
        roomId: currentRoom.id,
        kind: "live",
        provider: "none",
        status: "live",
        mode: "LIVE",
        startedBy: userId,
        startedAt,
        endedAt: null,
        speakerIds: [userId],
        viewerCount: Math.max(1, people.length),
      };
      writeSessions([session, ...readSessions().filter((row) => row.roomId !== currentRoom.id || row.kind !== "live")]);
      setLive(session);
      setRoom({ ...currentRoom, state: "LIVE" });
    }
    void fetch(`/api/board/rooms/${currentRoom.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, displayName: identity.displayName }),
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
      <RoomHeader
        room={room}
        people={people}
        joined={joined}
        following={following}
        permissions={permissions}
        onJoin={() => persistMembership(joined ? "leave" : "join")}
        onFollow={() => persistMembership(following ? "leave" : "follow")}
        onStartCall={() => startPlaceholder("call")}
        onGoLive={() => startPlaceholder("live")}
      />

      <RoomLivePreview room={room} session={live} />
      <RoomCallPreview room={room} session={call} />

      {!room.comingSoon ? (
        <>
          <RoomDropComposer
            room={room}
            canCreate={canCreateRoomDrop(permissions, room) || permissions.join}
            canShare={permissions.shareDrop || permissions.join}
            disabledReason={permissions.join ? undefined : "You cannot post in this Room."}
            onCreateDrop={(mode) => openRoomStudio(mode)}
            onShareExisting={() => {
              if (!ensureJoined()) return;
              setShareOpen(true);
            }}
          />
          <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">Leave a signal</div>
            <div className="mt-3 grid gap-3">
              <input
                value={composeTitle}
                onChange={(e) => setComposeTitle(e.target.value)}
                placeholder="Conversation title"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none"
              />
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="What should people know when they step in?"
                rows={3}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={createConversation}
                  disabled={!composeTitle.trim() || !composeBody.trim()}
                  className="rounded-full border border-emerald-200/25 bg-emerald-300/14 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-50 disabled:opacity-40"
                >
                  Open conversation
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
          This Official room is reserved. The doorway is here so more JAB rooms can open without a rewrite.
        </div>
      )}

      {successNote ? (
        <div className="rounded-2xl border border-emerald-200/20 bg-emerald-300/12 px-4 py-2 text-sm text-emerald-50">
          {successNote}
        </div>
      ) : null}

      <RoomActivityFeed
        items={feed}
        color={room.color}
        onOpenConversation={setOpenThreadId}
        onRemoveShare={removeDropShare}
        userId={userId}
        canModerate={permissions.moderate}
      />

      <RoomShareDrop open={shareOpen} onClose={() => setShareOpen(false)} onShare={(drop) => shareDrop(drop, "share")} />
      {openThread ? (
        <RoomConversation
          room={room}
          thread={openThread}
          onClose={() => setOpenThreadId(null)}
          onSend={sendReply}
          onAddDrop={openConversationStudio}
          canAddDrop={canCreateConversationDrop(permissions, openThread, room) || permissions.join}
        />
      ) : null}
      {studioDestination ? (
        <DropStudioLauncher
          open={studioOpen}
          destination={studioDestination}
          initialMode={studioMode}
          onClose={() => {
            setStudioOpen(false);
            setStudioDestination(null);
          }}
          onPublished={onStudioPublished}
        />
      ) : null}
    </div>
  );
}
