import {
  applyLiveViewerCount,
  buildLiveSession,
  endLiveSession,
  goLiveBlockedReason,
  isActiveLiveSession,
  isLiveHost,
  liveSignal,
  roomLiveChannelName,
  signalTargetsPeer,
} from "./liveWebRtc";
import { permissionsForRole } from "./permissions";
import { getRoomById } from "./catalog";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const music = getRoomById("music");
const session = buildLiveSession({
  id: "live_1",
  roomId: "music",
  startedBy: "host-1",
  viewerCount: 3,
});

assert(session.kind === "live", "Go Live opens a live session");
assert(session.provider === "webrtc", "Board-native live uses WebRTC");
assert(session.status === "live", "Go Live starts in live status");
assert(session.mode === "LIVE", "Room state mode is LIVE");
assert(isActiveLiveSession(session) === true, "new session is active");
assert(isLiveHost(session, "host-1") === true, "starter is the live host");
assert(isLiveHost(session, "viewer-2") === false, "other members are viewers");

const ended = endLiveSession(session, "2026-10-02T00:00:00.000Z");
assert(ended.status === "ended", "End Live ends the session");
assert(ended.endedAt === "2026-10-02T00:00:00.000Z", "End Live stamps endedAt");
assert(isActiveLiveSession(ended) === false, "ended session is not active");

assert(roomLiveChannelName("music") === "room-live:music", "Realtime channel is scoped to the Room");
assert(applyLiveViewerCount(session, 8).viewerCount === 8, "presence watching count updates");

assert(goLiveBlockedReason("viewer", music) === "Join this Room to Go Live.", "viewers get a reason");
assert(goLiveBlockedReason("member", music, permissionsForRole("member", music)) === null, "members can Go Live");
assert(
  goLiveBlockedReason("member", { comingSoon: true, isOfficial: true }) === "This Room is reserved.",
  "reserved rooms block Go Live"
);

const hello = liveSignal({
  kind: "hello",
  sessionId: session.id,
  roomId: "music",
  from: "viewer-2",
  role: "viewer",
});
assert(hello.ts > 0, "signals are timestamped");
assert(signalTargetsPeer({ ...hello, to: "host-1" }, "host-1") === true, "directed signals reach the peer");
assert(signalTargetsPeer({ ...hello, to: "host-1" }, "viewer-9") === false, "directed signals do not leak");

console.log("liveWebRtc.check.ts: ok");
