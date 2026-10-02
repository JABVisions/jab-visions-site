import type { Room, RoomLiveSession, RoomPermissions, RoomRole } from "./types";
import { permissionsForRole } from "./permissions";

export const ROOM_LIVE_CHANNEL_PREFIX = "room-live";
export const DEFAULT_LIVE_STUN = "stun:stun.l.google.com:19302";

export type LivePeerRole = "host" | "viewer";

export type LiveSignalKind = "hello" | "goodbye" | "offer" | "answer" | "ice" | "ended" | "state";

export type LiveSignal = {
  kind: LiveSignalKind;
  sessionId: string;
  roomId: string;
  from: string;
  to?: string | null;
  role: LivePeerRole;
  sdp?: string;
  candidate?: unknown;
  viewerCount?: number;
  ts: number;
};

export function roomLiveChannelName(roomId: string) {
  return `${ROOM_LIVE_CHANNEL_PREFIX}:${String(roomId || "").trim()}`;
}

export function liveIceServers(stunUrl?: string | null): Array<{ urls: string }> {
  const url = String(stunUrl || process.env.NEXT_PUBLIC_LIVE_STUN_URL || DEFAULT_LIVE_STUN).trim();
  return [{ urls: url || DEFAULT_LIVE_STUN }];
}

export function goLiveBlockedReason(
  role: RoomRole,
  room?: Pick<Room, "comingSoon" | "isOfficial"> | null,
  permissions?: Pick<RoomPermissions, "goLive"> | null
): string | null {
  if (room?.comingSoon) return "This Room is reserved.";
  const allowed = permissions ? permissions.goLive : permissionsForRole(role, room).goLive;
  if (allowed) return null;
  if (role === "viewer") return "Join this Room to Go Live.";
  return "Only members and hosts can Go Live in this Room.";
}

export function buildLiveSession(input: {
  id: string;
  roomId: string;
  startedBy: string;
  startedAt?: string;
  viewerCount?: number;
  provider?: RoomLiveSession["provider"];
}): RoomLiveSession {
  return {
    id: input.id,
    roomId: input.roomId,
    kind: "live",
    provider: input.provider || "webrtc",
    status: "live",
    mode: "LIVE",
    startedBy: input.startedBy,
    startedAt: input.startedAt || new Date().toISOString(),
    endedAt: null,
    speakerIds: [input.startedBy],
    viewerCount: Math.max(1, input.viewerCount ?? 1),
  };
}

export function endLiveSession(session: RoomLiveSession, endedAt = new Date().toISOString()): RoomLiveSession {
  return {
    ...session,
    status: "ended",
    mode: "LIVE",
    endedAt,
    speakerIds: [],
    viewerCount: 0,
  };
}

export function applyLiveViewerCount(session: RoomLiveSession, viewerCount: number): RoomLiveSession {
  return {
    ...session,
    viewerCount: Math.max(1, viewerCount),
  };
}

export function isActiveLiveSession(session: RoomLiveSession | null | undefined): session is RoomLiveSession {
  return Boolean(session && (session.status === "live" || session.status === "starting"));
}

export function isLiveHost(session: RoomLiveSession | null | undefined, userId: string | null | undefined) {
  if (!session || !userId) return false;
  return String(session.startedBy || "") === String(userId);
}

export function liveSignal(partial: Omit<LiveSignal, "ts"> & { ts?: number }): LiveSignal {
  return {
    ...partial,
    to: partial.to ?? null,
    ts: partial.ts ?? Date.now(),
  };
}

export function signalTargetsPeer(signal: LiveSignal, peerId: string) {
  if (!signal.to) return signal.kind === "hello" || signal.kind === "ended" || signal.kind === "state";
  return signal.to === peerId;
}

export const LIVE_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: true,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};
