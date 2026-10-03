import {
  addCallParticipant,
  applyCallParticipants,
  applyLiveViewerCount,
  buildCallSession,
  buildLiveSession,
  CALL_MAX_PARTICIPANTS,
  callShouldCreateOffer,
  endCallSession,
  endLiveSession,
  goLiveBlockedReason,
  isActiveCallSession,
  isActiveLiveSession,
  isCallHost,
  isCallParticipant,
  isLiveHost,
  joinCallBlockedReason,
  liveSignal,
  removeCallParticipant,
  roomCallChannelName,
  roomLiveChannelName,
  signalTargetsPeer,
  startCallBlockedReason,
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

const call = buildCallSession({
  id: "call_1",
  roomId: "music",
  startedBy: "member-1",
});
assert(call.kind === "call", "Start Call opens a call session");
assert(call.provider === "webrtc", "Board-native Room Call uses the same WebRTC provider as Go Live");
assert(call.status === "live", "Start Call starts in live status");
assert(call.participantIds.join(",") === "member-1", "starter is already in the call");
assert(isActiveCallSession(call) === true, "new Room Call is active");
assert(isCallHost(call, "member-1") === true, "starter can end the Room Call");
assert(isCallParticipant(call, "member-1") === true, "starter is a participant");
assert(isCallParticipant(call, "member-2") === false, "other members join before speaking");

const joined = addCallParticipant(call, "member-2");
assert(joined.participantIds.includes("member-2") === true, "Join Call adds the member");
assert(applyCallParticipants(joined, ["member-1", "member-2", "member-1"]).participantIds.length === 2, "participant ids stay unique");
assert(joinCallBlockedReason(joined, "member-3") === null, "open calls accept more members");

const full = applyCallParticipants(
  joined,
  Array.from({ length: CALL_MAX_PARTICIPANTS }, (_, index) => `member-${index + 1}`)
);
assert(full.participantIds.length === CALL_MAX_PARTICIPANTS, "Room Call stays a small group");
assert(
  joinCallBlockedReason(full, "member-99") === `This Room Call is full (${CALL_MAX_PARTICIPANTS}).`,
  "the sixth seat is the last"
);

const left = removeCallParticipant(joined, "member-2");
assert(left.participantIds.includes("member-2") === false, "Leave Call removes the member");

const endedCall = endCallSession(call, "2026-10-03T00:00:00.000Z");
assert(endedCall.status === "ended", "End Call ends the session");
assert(endedCall.participantIds.length === 0, "ended calls have no speakers");
assert(isActiveCallSession(endedCall) === false, "ended Room Call is not active");

assert(roomCallChannelName("music") === "room-call:music", "call Realtime channel is scoped to the Room");
assert(callShouldCreateOffer("b-peer", "a-peer") === true, "greater peer id creates the mesh offer");
assert(callShouldCreateOffer("a-peer", "b-peer") === false, "lesser peer id waits for the offer");

assert(startCallBlockedReason("viewer", music) === "Join this Room to start a Call.", "viewers get a call reason");
assert(startCallBlockedReason("member", music, permissionsForRole("member", music)) === null, "members can Start Call");
assert(
  startCallBlockedReason("member", { comingSoon: true, isOfficial: true }) === "This Room is reserved.",
  "reserved rooms block Start Call"
);

console.log("liveWebRtc.check.ts: ok");
