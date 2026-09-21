import type { ActivityType } from "@/lib/board/notifications";
import { isPresenceEvent } from "./presence";
import type { RoomActivityEventType } from "./types";

export const ROOM_ACTIVITY_TYPES: RoomActivityEventType[] = [
  "room_joined",
  "room_drop_shared",
  "room_reply",
  "room_mention",
  "room_call_started",
  "room_live_started",
  "room_followed_active",
  "room_announcement",
];

export function isRoomActivityType(value: unknown): value is RoomActivityEventType {
  return ROOM_ACTIVITY_TYPES.includes(value as RoomActivityEventType);
}

export function shouldEmitRoomActivity(eventType: string) {
  if (isPresenceEvent(eventType)) return false;
  return isRoomActivityType(eventType);
}

export function roomActivityGroupKey(type: RoomActivityEventType, roomId: string, actorId?: string | null) {
  if (type === "room_joined") return `room_joined:${roomId}:${actorId || "anon"}`;
  if (type === "room_drop_shared") return `room_drop:${roomId}`;
  if (type === "room_call_started" || type === "room_live_started") return `${type}:${roomId}`;
  if (type === "room_followed_active") return `room_active:${roomId}`;
  if (type === "room_announcement") return `room_announce:${roomId}`;
  return `${type}:${roomId}`;
}

export function describeRoomActivity(
  type: RoomActivityEventType,
  actorName: string,
  roomName: string,
  extras?: { dropTitle?: string }
) {
  if (type === "room_joined") return `${actorName} joined ${roomName}.`;
  if (type === "room_drop_shared") {
    return extras?.dropTitle
      ? `${actorName} shared ${extras.dropTitle} in ${roomName}.`
      : `${actorName} shared a Drop in ${roomName}.`;
  }
  if (type === "room_reply") return `${actorName} replied in ${roomName}.`;
  if (type === "room_mention") return `${actorName} mentioned you in ${roomName}.`;
  if (type === "room_call_started") return `A Room Call started in ${roomName}.`;
  if (type === "room_live_started") return `${roomName} went Live.`;
  if (type === "room_followed_active") return `${roomName} is active.`;
  return `Official announcement in ${roomName}.`;
}

export function asActivityType(type: RoomActivityEventType): ActivityType | RoomActivityEventType {
  return type;
}
