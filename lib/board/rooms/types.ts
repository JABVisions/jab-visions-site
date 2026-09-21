export type RoomKind = "board" | "official" | "reserved";
export type RoomBroadcastState = "ROOM" | "LIVE" | "STAGE";
export type RoomRole = "owner" | "host" | "moderator" | "member" | "viewer";
export type RoomMembershipStatus = "joined" | "following" | "invited" | "left";
export type RoomSessionKind = "call" | "live";
export type RoomSessionStatus = "idle" | "starting" | "live" | "ended";
export type RoomCallProvider = "none" | "livekit" | "daily" | "agora" | "webrtc";
export type RoomParticipantRole = "speaker" | "viewer" | "caller";

export type RoomFeedItemKind =
  | "conversation"
  | "text_post"
  | "reply"
  | "drop_share"
  | "announcement"
  | "pin"
  | "call"
  | "live";

export type RoomActivityEventType =
  | "room_joined"
  | "room_drop_shared"
  | "room_reply"
  | "room_mention"
  | "room_call_started"
  | "room_live_started"
  | "room_followed_active"
  | "room_announcement";

export type Room = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  chips: string[];
  kind: RoomKind;
  isOfficial: boolean;
  comingSoon: boolean;
  color: string;
  accent: string;
  imageryUrl?: string | null;
  state: RoomBroadcastState;
  memberCount: number;
  presenceCount: number;
  lastActivityAt: number | null;
  aliases?: string[];
};

export type RoomMember = {
  roomId: string;
  userId: string;
  role: RoomRole;
  status: RoomMembershipStatus;
  following: boolean;
  joinedAt: string;
  lastEnteredAt: string | null;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
};

export type RoomPresence = {
  userId: string;
  roomId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  lastSeenAt: string;
};

export type RoomParticipant = {
  id: string;
  userId: string;
  roomId: string;
  sessionId: string;
  role: RoomParticipantRole;
  joinedAt: string;
  leftAt: string | null;
};

export type RoomCallSession = {
  id: string;
  roomId: string;
  kind: "call";
  provider: RoomCallProvider;
  status: RoomSessionStatus;
  startedBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  participantIds: string[];
};

export type RoomLiveSession = {
  id: string;
  roomId: string;
  kind: "live";
  provider: RoomCallProvider;
  status: RoomSessionStatus;
  mode: Extract<RoomBroadcastState, "LIVE" | "STAGE">;
  startedBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  speakerIds: string[];
  viewerCount: number;
};

export type RoomSession = RoomCallSession | RoomLiveSession;

export type RoomPermissions = {
  join: boolean;
  follow: boolean;
  post: boolean;
  reply: boolean;
  shareDrop: boolean;
  pin: boolean;
  announce: boolean;
  moderate: boolean;
  startCall: boolean;
  goLive: boolean;
  setStage: boolean;
  editRoom: boolean;
};

export type RoomConversationReply = {
  id: string;
  threadId: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  /** Attached Board Drop. The Drop stays a Drop; the reply is just context. */
  dropId?: string;
  dropSnapshot?: Record<string, unknown>;
};

export type RoomConversation = {
  id: string;
  roomId: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  replies: RoomConversationReply[];
  isPinned?: boolean;
  privacy?: "public" | "private" | "work" | "invite-only";
  mood?: "quiet" | "active" | "urgent" | "dreaming" | "locked";
};

export type RoomDropShare = {
  id: string;
  roomId: string;
  dropId: string;
  sharedBy: string;
  sharedByName?: string;
  activityId?: string | null;
  snapshot: Record<string, unknown>;
  createdAt: string;
  /** create = posted from Drop Studio; share = existing Drop; conversation = pointer only */
  origin?: "create" | "share" | "conversation";
  conversationId?: string | null;
};

export type RoomFeedItem = {
  id: string;
  roomId: string;
  kind: RoomFeedItemKind;
  createdAt: number;
  pinned?: boolean;
  official?: boolean;
  title?: string;
  body?: string;
  authorName?: string;
  authorAvatar?: string;
  conversation?: RoomConversation;
  share?: RoomDropShare;
  session?: RoomSession;
};

export type RoomCardModel = Room & {
  joined?: boolean;
  following?: boolean;
  recentlyEntered?: boolean;
  live?: boolean;
};

export const ROOM_PRESENCE_TTL_MS = 90 * 1000;
export const ROOM_PRESENCE_HEARTBEAT_MS = 25 * 1000;

export const NOISY_ROOM_EVENTS = ["entered", "left", "presence", "heartbeat"] as const;
