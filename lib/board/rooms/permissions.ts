import type { Room, RoomPermissions, RoomRole } from "./types";

export function permissionsForRole(role: RoomRole, room?: Pick<Room, "comingSoon" | "isOfficial"> | null): RoomPermissions {
  const closed = Boolean(room?.comingSoon);
  const hostish = role === "owner" || role === "host";
  const modish = hostish || role === "moderator";
  const memberish = modish || role === "member";

  return {
    join: !closed,
    follow: true,
    post: memberish && !closed,
    reply: memberish && !closed,
    shareDrop: memberish && !closed,
    pin: modish && !closed,
    announce: (hostish || (modish && Boolean(room?.isOfficial))) && !closed,
    moderate: modish && !closed,
    startCall: memberish && !closed,
    goLive: hostish && !closed,
    setStage: hostish && !closed,
    editRoom: role === "owner",
  };
}

export function canStartCall(role: RoomRole, room?: Room | null) {
  return permissionsForRole(role, room).startCall;
}

export function canGoLive(role: RoomRole, room?: Room | null) {
  return permissionsForRole(role, room).goLive;
}

export function roleLabel(role: RoomRole) {
  if (role === "owner") return "Owner";
  if (role === "host") return "Host";
  if (role === "moderator") return "Moderator";
  if (role === "member") return "Member";
  return "Viewer";
}
