"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hostedOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { presenceFromApiRow, pickBoardDisplayName, BOARD_OPEN_FORUM_ROOM_EVENT, type ForumOpenDetail } from "@/lib/board/boardAuthor";
import { resolveCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { PROFILE_STORAGE_KEY } from "@/lib/board/dropItem";
import type { DropItem } from "@/lib/board/dropItem";
import {
  addCallParticipant,
  applyLiveVisibilityToReply,
  applyLiveVisibilityToShare,
  buildCallSession,
  buildLiveSession,
  conversationsFromPostRows,
  endCallSession,
  endLiveSession,
  getRoomById,
  goLiveBlockedReason,
  isCallHost,
  isCallParticipant,
  isLiveHost,
  joinCallBlockedReason,
  removeCallParticipant,
  startCallBlockedReason,
  mergeConversationSources,
  mergeShareSources,
  overlaySharesWithVisibilityMap,
  permissionsForRole,
  resolveRoomId,
  roomFeedFromSources,
  sharesFromApiRows,
  sharesFromActivityRows,
  conversationsFromActivityRows,
  type Room,
  type RoomCallSession,
  type RoomConversation as RoomConversationRecord,
  type RoomDropShare,
  type RoomLiveSession,
  type RoomPresence as RoomPresencePerson,
  type RoomRole,
  ROOM_PRESENCE_HEARTBEAT_MS,
} from "@/lib/board/rooms";
import { findLocalDropByAnyId } from "@/lib/board/boardDropEditStore";
import { activityMatchesDropId, getLocalActivity } from "@/lib/board/activity";
import { normalizeDropVisibility, type DropVisibility } from "@/lib/board/rooms/livePrivacy";
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
import "./forumsLayout.css";
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

function liveVisibilityForDrop(dropId: string): DropVisibility | null {
  const local = findLocalDropByAnyId(dropId);
  const fromDrop = normalizeDropVisibility(local?.visibility);
  if (fromDrop) return fromDrop;
  const activity = getLocalActivity().find((row) => activityMatchesDropId(row, dropId));
  return normalizeDropVisibility(activity?.meta?.visibility);
}

function overlayLocalLivePrivacy(shares: RoomDropShare[]): RoomDropShare[] {
  const map = new Map<string, DropVisibility>();
  for (const share of shares) {
    const live = liveVisibilityForDrop(share.dropId);
    if (live) map.set(share.dropId, live);
  }
  return overlaySharesWithVisibilityMap(shares, map);
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

export default function RoomInterior({
  roomId,
  conversationId,
}: {
  roomId: string;
  conversationId?: string | null;
}) {
  const router = useRouter();
  const resolved = resolveRoomId(roomId);
  const [room, setRoom] = useState<Room | null>(resolved ? getRoomById(resolved) : null);
  const [conversations, setConversations] = useState<RoomConversationRecord[]>(() =>
    resolved ? mergeConversationSources({ roomId: resolved, local: [], remote: [] }) : []
  );
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
  const remoteConversationsRef = useRef<RoomConversationRecord[]>([]);
  const remoteSharesRef = useRef<RoomDropShare[]>([]);

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

  const readLocalConversations = useCallback(() => {
    let local: RoomConversationRecord[] = [];
    try {
      local = readConversations();
    } catch {
      local = [];
    }
    try {
      const db = readForums();
      for (const thread of db.threads || []) {
        const mappedRoom = resolveRoomId(thread.forumId) || thread.forumId;
        if (local.some((item) => item.id === thread.id)) continue;
        local.push({
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
      // boardStore is optional — catalog seeds still stand
    }
    return local;
  }, []);

  const applyRoomSources = useCallback(
    (id: string) => {
      const local = readLocalConversations();
      const merged = mergeConversationSources({
        roomId: id,
        local,
        remote: remoteConversationsRef.current,
      });
      setConversations(merged);
      let localShares: RoomDropShare[] = [];
      try {
        localShares = readShares();
      } catch {
        localShares = [];
      }
      setShares(
        overlayLocalLivePrivacy(
          mergeShareSources({
            roomId: id,
            local: localShares,
            remote: remoteSharesRef.current,
          })
        )
      );
      try {
        setPeople(readPresence().filter((row) => resolveRoomId(row.roomId) === id));
      } catch {
        setPeople([]);
      }
      const sessions = activeSessionsFor(id);
      setCall(
        (current) =>
          current || (sessions.find((row) => row.kind === "call") as RoomCallSession | undefined) || null
      );
      setLive(
        (current) =>
          current || (sessions.find((row) => row.kind === "live") as RoomLiveSession | undefined) || null
      );
      const mine = membershipFor(id, userId);
      setJoined(mine?.status === "joined");
      setFollowing(Boolean(mine?.following));
      setRole(mine?.role || "viewer");
    },
    [readLocalConversations, userId]
  );

  useEffect(() => {
    function onDropUpdated(event: Event) {
      const detail = (event as CustomEvent).detail;
      const dropId = String(detail?.dropId || detail?.drop?.id || "");
      const visibility = normalizeDropVisibility(detail?.drop?.visibility);
      if (!dropId || !visibility) return;
      setShares((current) =>
        current.map((share) =>
          share.dropId === dropId ? applyLiveVisibilityToShare(share, visibility) : share
        )
      );
      setConversations((current) =>
        current.map((thread) => ({
          ...thread,
          replies: thread.replies.map((reply) =>
            reply.dropId === dropId ? applyLiveVisibilityToReply(reply, visibility) : reply
          ),
        }))
      );
    }
    window.addEventListener("board:drop:updated", onDropUpdated as EventListener);
    return () => window.removeEventListener("board:drop:updated", onDropUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!resolved || !room) return;
    rememberRecentRoom(resolved);
    applyRoomSources(resolved);
    const fromUrl =
      conversationId ||
      new URLSearchParams(window.location.search).get("conversation") ||
      new URLSearchParams(window.location.search).get("thread");
    if (fromUrl) setOpenThreadId(fromUrl);
  }, [resolved, room, applyRoomSources, conversationId]);

  useEffect(() => {
    const onOpenForum = (event: Event) => {
      const detail = (event as CustomEvent<ForumOpenDetail>).detail;
      if (!detail?.roomId || !resolved) return;
      if (resolveRoomId(detail.roomId) !== resolved && detail.roomId !== resolved) {
        router.push(detail.href);
        return;
      }
      setOpenThreadId(detail.conversationId || null);
    };
    window.addEventListener(BOARD_OPEN_FORUM_ROOM_EVENT, onOpenForum as EventListener);
    return () => window.removeEventListener(BOARD_OPEN_FORUM_ROOM_EVENT, onOpenForum as EventListener);
  }, [resolved, router]);

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
    fetch(`/api/board/rooms/${resolved}/sessions`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.sessions)) return;
        const remoteLive = payload.sessions.find(
          (row: Record<string, unknown>) =>
            row.kind === "live" && (row.status === "live" || row.status === "starting")
        );
        const remoteCall = payload.sessions.find(
          (row: Record<string, unknown>) =>
            row.kind === "call" && (row.status === "live" || row.status === "starting")
        );
        if (remoteCall) {
          const startedBy = remoteCall.started_by ? String(remoteCall.started_by) : "";
          const metadata =
            remoteCall.metadata && typeof remoteCall.metadata === "object"
              ? (remoteCall.metadata as { participantIds?: unknown })
              : {};
          const fromMeta = Array.isArray(metadata.participantIds)
            ? metadata.participantIds.map((id) => String(id || "")).filter(Boolean)
            : [];
          setCall({
            id: String(remoteCall.id),
            roomId: resolved,
            kind: "call",
            provider: "webrtc",
            status: "live",
            startedBy: startedBy || null,
            startedAt: String(remoteCall.started_at || new Date().toISOString()),
            endedAt: null,
            participantIds: fromMeta.length ? fromMeta : startedBy ? [startedBy] : [],
          });
        }
        if (!remoteLive) return;
        setLive({
          id: String(remoteLive.id),
          roomId: resolved,
          kind: "live",
          provider: remoteLive.provider === "webrtc" ? "webrtc" : "webrtc",
          status: "live",
          mode: "LIVE",
          startedBy: remoteLive.started_by ? String(remoteLive.started_by) : null,
          startedAt: String(remoteLive.started_at || new Date().toISOString()),
          endedAt: null,
          speakerIds: remoteLive.started_by ? [String(remoteLive.started_by)] : [],
          viewerCount: Math.max(1, people.length),
        });
        setRoom((current) => (current ? { ...current, state: "LIVE" } : current));
      })
      .catch(() => undefined);
    fetch(`/api/board/rooms/${resolved}/shares`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.shares)) return;
        remoteSharesRef.current = mergeShareSources({
          roomId: resolved,
          local: remoteSharesRef.current,
          remote: sharesFromApiRows(resolved, payload.shares),
        });
        applyRoomSources(resolved);
      })
      .catch(() => undefined);
    fetch(`/api/board/rooms/${resolved}/posts`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.posts)) return;
        remoteConversationsRef.current = mergeConversationSources({
          roomId: resolved,
          local: remoteConversationsRef.current,
          remote: conversationsFromPostRows(resolved, payload.posts).map((thread) => ({
            ...thread,
            replies: thread.replies.map((reply) => {
              const live = reply.dropId ? liveVisibilityForDrop(reply.dropId) : null;
              if (!live || !reply.dropSnapshot) return reply;
              return { ...reply, dropSnapshot: { ...reply.dropSnapshot, visibility: live } };
            }),
          })),
        });
        applyRoomSources(resolved);
      })
      .catch(() => undefined);
    fetch(`/api/board/activity?roomId=${encodeURIComponent(resolved)}&limit=80`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.items)) return;
        remoteSharesRef.current = mergeShareSources({
          roomId: resolved,
          local: sharesFromActivityRows(resolved, payload.items),
          remote: remoteSharesRef.current,
        });
        remoteConversationsRef.current = mergeConversationSources({
          roomId: resolved,
          local: conversationsFromActivityRows(resolved, payload.items),
          remote: remoteConversationsRef.current,
        });
        applyRoomSources(resolved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resolved, applyRoomSources]);

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
      roomFeedFromSources({
        roomId: resolved || roomId,
        localConversations: conversations,
        remoteConversations: remoteConversationsRef.current,
        localShares: shares,
        remoteShares: remoteSharesRef.current,
        sessions: [call, live].filter(Boolean) as Array<RoomCallSession | RoomLiveSession>,
      }),
    [conversations, shares, call, live, resolved, roomId]
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
    setConversations(
      mergeConversationSources({
        roomId: currentRoom.id,
        local: readConversations(),
        remote: remoteConversationsRef.current,
      })
    );
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
    setConversations(
      mergeConversationSources({
        roomId: currentRoom.id,
        local: next,
        remote: remoteConversationsRef.current,
      })
    );
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
    remoteSharesRef.current = mergeShareSources({
      roomId: currentRoom.id,
      local: remoteSharesRef.current,
      remote: [share],
    });
    setShares(
      overlayLocalLivePrivacy(
        mergeShareSources({
          roomId: currentRoom.id,
          local: readShares(),
          remote: remoteSharesRef.current,
        })
      )
    );
    setShareOpen(false);
    void fetch(`/api/board/rooms/${currentRoom.id}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dropId: drop.id,
        snapshot: share.snapshot,
        displayName: identity.displayName,
        origin,
        conversationId: share.conversationId,
      }),
    })
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.share) return;
        const remote = sharesFromApiRows(currentRoom.id, [payload.share]);
        remoteSharesRef.current = mergeShareSources({
          roomId: currentRoom.id,
          local: remoteSharesRef.current,
          remote,
        });
        applyRoomSources(currentRoom.id);
      })
      .catch(() => undefined);
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
    setConversations(
      mergeConversationSources({
        roomId: currentRoom.id,
        local: next,
        remote: remoteConversationsRef.current,
      })
    );
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
    setShares(overlayLocalLivePrivacy(next.filter((row) => resolveRoomId(row.roomId) === currentRoom.id)));
    flashSuccess("Removed from Room");
    void fetch(`/api/board/rooms/${currentRoom.id}/shares?dropId=${encodeURIComponent(dropId)}`, {
      method: "DELETE",
    });
  }

  function persistCallSession(session: RoomCallSession | null) {
    const others = readSessions().filter((row) => row.roomId !== currentRoom.id || row.kind !== "call");
    writeSessions(session ? [session, ...others] : others);
    setCall(session);
  }

  async function startCall() {
    const blocked = startCallBlockedReason(role, currentRoom, permissions);
    if (blocked) {
      flashSuccess(blocked);
      return;
    }
    if (!ensureJoined()) {
      flashSuccess("Join this Room to start a Call.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      flashSuccess("This browser cannot open a camera or microphone.");
      return;
    }
    const session = buildCallSession({
      id: uid("call"),
      roomId: currentRoom.id,
      startedBy: userId,
    });
    persistCallSession({ ...session, status: "starting" });
    try {
      const response = await fetch(`/api/board/rooms/${currentRoom.id}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "call",
          provider: "webrtc",
          displayName: identity.displayName,
        }),
      });
      const payload = await response.json().catch(() => null);
      const remoteId = payload?.session?.id;
      persistCallSession(remoteId && typeof remoteId === "string" ? { ...session, id: remoteId } : session);
    } catch {
      persistCallSession(session);
    }
  }

  function joinCall() {
    if (!call) return;
    const blocked = joinCallBlockedReason(call, userId);
    if (blocked) {
      flashSuccess(blocked);
      return;
    }
    if (!ensureJoined()) {
      flashSuccess("Join this Room to enter the Call.");
      return;
    }
    persistCallSession(addCallParticipant(call, userId));
  }

  function leaveCall() {
    if (!call) return;
    if (isCallHost(call, userId)) {
      stopCall();
      return;
    }
    const next = removeCallParticipant(call, userId);
    persistCallSession(next.participantIds.length ? next : endCallSession(next));
    if (!next.participantIds.length) persistCallSession(null);
  }

  function stopCall() {
    if (!call) return;
    persistCallSession(endCallSession(call));
    persistCallSession(null);
    void fetch(`/api/board/rooms/${currentRoom.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end", sessionId: call.id, kind: "call" }),
    });
  }

  function onStartCall() {
    if (call && isCallHost(call, userId)) {
      stopCall();
      return;
    }
    if (call && isCallParticipant(call, userId)) {
      leaveCall();
      return;
    }
    if (call) {
      joinCall();
      return;
    }
    void startCall();
  }

  function persistLiveSession(session: RoomLiveSession | null) {
    const others = readSessions().filter((row) => row.roomId !== currentRoom.id || row.kind !== "live");
    writeSessions(session ? [session, ...others] : others);
    setLive(session);
  }

  async function startLive() {
    const blocked = goLiveBlockedReason(role, currentRoom, permissions);
    if (blocked) {
      flashSuccess(blocked);
      return;
    }
    if (!ensureJoined()) {
      flashSuccess("Join this Room to Go Live.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      flashSuccess("This browser cannot open a camera or microphone.");
      return;
    }
    const session = buildLiveSession({
      id: uid("live"),
      roomId: currentRoom.id,
      startedBy: userId,
      viewerCount: Math.max(1, people.length),
    });
    persistLiveSession(session);
    setRoom({ ...currentRoom, state: "LIVE" });
    try {
      const response = await fetch(`/api/board/rooms/${currentRoom.id}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "live",
          provider: "webrtc",
          displayName: identity.displayName,
        }),
      });
      const payload = await response.json().catch(() => null);
      const remoteId = payload?.session?.id;
      if (remoteId && typeof remoteId === "string") {
        const next = { ...session, id: remoteId };
        persistLiveSession(next);
      }
    } catch {
      // local webrtc session still stands
    }
  }

  function stopLive() {
    if (!live) return;
    persistLiveSession(endLiveSession(live));
    persistLiveSession(null);
    setRoom({ ...currentRoom, state: "ROOM" });
    void fetch(`/api/board/rooms/${currentRoom.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end", sessionId: live.id, kind: "live" }),
    });
  }

  function onGoLive() {
    if (live && isLiveHost(live, userId)) {
      stopLive();
      return;
    }
    void startLive();
  }

  return (
    <div className="forumsRoomInterior mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
      <RoomHeader
        room={room}
        people={people}
        joined={joined}
        following={following}
        permissions={permissions}
        role={role}
        liveActive={Boolean(live)}
        canEndLive={Boolean(live && isLiveHost(live, userId))}
        callActive={Boolean(call)}
        callAction={
          call && isCallHost(call, userId)
            ? "end"
            : call && isCallParticipant(call, userId)
              ? "leave"
              : call
                ? "join"
                : "start"
        }
        onJoin={() => persistMembership(joined ? "leave" : "join")}
        onFollow={() => persistMembership(following ? "leave" : "follow")}
        onStartCall={onStartCall}
        onGoLive={onGoLive}
      />

      <RoomLivePreview
        room={room}
        session={live}
        userId={userId}
        displayName={identity.displayName}
        onSessionChange={(next) => persistLiveSession(next)}
        onFailed={(message) => {
          flashSuccess(message);
          stopLive();
        }}
        onEnded={stopLive}
      />
      <RoomCallPreview
        room={room}
        session={call}
        userId={userId}
        displayName={identity.displayName}
        onJoin={joinCall}
        onSessionChange={(next) => persistCallSession(next)}
        onFailed={(message) => {
          flashSuccess(message);
          leaveCall();
        }}
        onEnded={stopCall}
      />

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
      <style>{`
        .forumsHall,
        .forumsRoomInterior,
        .forumsRoomFeed,
        .forumsRoomCard {
          display: block;
          visibility: visible;
        }
        @media (min-width: 721px) {
          .forumsRoomFeed {
            display: block;
            visibility: visible;
            height: auto;
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}
