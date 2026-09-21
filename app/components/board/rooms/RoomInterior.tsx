"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
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
  type RoomConversation,
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
  readSessions,
  upsertPresence,
} from "@/lib/board/rooms/storage";
import { shouldEmitRoomActivity } from "@/lib/board/rooms/activity";
import { readForums } from "@/lib/boardStore";
import RoomHeader from "./RoomHeader";
import RoomLivePreview from "./RoomLivePreview";
import RoomCallPreview from "./RoomCallPreview";
import RoomActivityFeed from "./RoomActivityFeed";
import RoomShareDrop from "./RoomShareDrop";
import RoomConversation from "./RoomConversation";

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
      displayName: String(profile.displayName || profile.name || "You"),
      username: String(profile.handle || profile.username || ""),
      avatarUrl: publicOrbAvatarUrl(profile.avatarUrl, profile.avatarDataUrl),
    };
  } catch {
    return { userId: "local", displayName: "You", username: "", avatarUrl: "" };
  }
}

export default function RoomInterior({ roomId }: { roomId: string }) {
  const router = useRouter();
  const resolved = resolveRoomId(roomId);
  const [room, setRoom] = useState<Room | null>(resolved ? getRoomById(resolved) : null);
  const [conversations, setConversations] = useState<RoomConversation[]>([]);
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

  const identity = useMemo(() => readLocalIdentity(), []);
  const userId = authUserId || identity.userId;

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
            payload.presence.map((row: any) => ({
              userId: String(row.user_id || row.userId),
              roomId: resolved,
              displayName: String(row.display_name || row.displayName || "Board"),
              username: row.username,
              avatarUrl: row.avatar_url || row.avatarUrl,
              lastSeenAt: String(row.last_seen_at || row.lastSeenAt || new Date().toISOString()),
            }))
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
            snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {},
            createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
          }));
          const byKey = new Map<string, RoomDropShare>();
          for (const share of [...remote, ...local]) byKey.set(`${share.dropId}:${share.sharedBy}`, share);
          return [...byKey.values()];
        });
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
                    payload.presence.map((row: any) => ({
                      userId: String(row.user_id || row.userId),
                      roomId: resolved,
                      displayName: String(row.display_name || row.displayName || "Board"),
                      username: row.username,
                      avatarUrl: row.avatar_url || row.avatarUrl,
                      lastSeenAt: String(row.last_seen_at || row.lastSeenAt || new Date().toISOString()),
                    }))
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

  function persistMembership(action: "join" | "follow" | "leave") {
    const nextRole: RoomRole = action === "follow" ? "viewer" : "member";
    upsertMembership({
      roomId: room.id,
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
    void fetch(`/api/board/rooms/${room.id}/membership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, displayName: identity.displayName }),
    });
    if (action === "join" && !hasEmittedJoinActivity(room.id, userId) && shouldEmitRoomActivity("room_joined")) {
      markJoinActivity(room.id, userId);
    }
  }

  function createConversation() {
    const title = composeTitle.trim();
    const body = composeBody.trim();
    if (!title || !body || room.comingSoon) return;
    const next: RoomConversation = {
      id: uid("th"),
      roomId: room.id,
      title,
      body,
      authorName: identity.displayName,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    upsertConversation(next);
    setConversations(conversationsForRoom(readConversations(), room.id));
    setComposeTitle("");
    setComposeBody("");
    setOpenThreadId(next.id);
    void fetch(`/api/board/rooms/${room.id}/posts`, {
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
                body,
                createdAt: new Date().toISOString(),
              },
              ...thread.replies,
            ],
          }
        : thread
    );
    writeConversations(next);
    setConversations(conversationsForRoom(next, room.id));
    void fetch(`/api/board/rooms/${room.id}/posts`, {
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

  function shareDrop(drop: DropItem) {
    const share: RoomDropShare = {
      id: uid("share"),
      roomId: room.id,
      dropId: drop.id,
      sharedBy: userId,
      sharedByName: identity.displayName,
      snapshot: { ...drop },
      createdAt: new Date().toISOString(),
    };
    upsertShare(share);
    setShares(readShares().filter((row) => resolveRoomId(row.roomId) === room.id));
    setShareOpen(false);
    void fetch(`/api/board/rooms/${room.id}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dropId: drop.id,
        snapshot: drop,
        displayName: identity.displayName,
      }),
    });
  }

  function startPlaceholder(kind: "call" | "live") {
    const startedAt = new Date().toISOString();
    if (kind === "call") {
      const session: RoomCallSession = {
        id: uid("call"),
        roomId: room.id,
        kind: "call",
        provider: "none",
        status: "live",
        startedBy: userId,
        startedAt,
        endedAt: null,
        participantIds: [userId],
      };
      writeSessions([session, ...readSessions().filter((row) => row.roomId !== room.id || row.kind !== "call")]);
      setCall(session);
      setRoom({ ...room, state: "ROOM" });
    } else {
      const session: RoomLiveSession = {
        id: uid("live"),
        roomId: room.id,
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
      writeSessions([session, ...readSessions().filter((row) => row.roomId !== room.id || row.kind !== "live")]);
      setLive(session);
      setRoom({ ...room, state: "LIVE" });
    }
    void fetch(`/api/board/rooms/${room.id}/sessions`, {
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
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
              >
                Share a Drop
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
          This Official room is reserved. The doorway is here so Those Ryderz / JAB Visions can open without a rewrite.
        </div>
      )}

      <RoomActivityFeed items={feed} color={room.color} onOpenConversation={setOpenThreadId} />

      <RoomShareDrop open={shareOpen} onClose={() => setShareOpen(false)} onShare={shareDrop} />
      {openThread ? (
        <RoomConversation
          room={room}
          thread={openThread}
          onClose={() => setOpenThreadId(null)}
          onSend={sendReply}
        />
      ) : null}
    </div>
  );
}
