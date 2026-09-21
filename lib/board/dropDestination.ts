export type StudioCaptureMode = "photo" | "video" | "audio" | "art" | "descript";

/**
 * One Drop Studio, many publish destinations.
 * Forum Rooms reuse this editor instead of a Forums-only duplicate.
 * Project Room stays a separate Work Board destination.
 */
export type DropDestination =
  | { type: "feed" }
  | { type: "profile" }
  | { type: "project_room"; projectId: string; projectTitle?: string }
  | {
      type: "room";
      roomId: string;
      roomName?: string;
      roomIcon?: string;
    }
  | {
      type: "room_conversation";
      roomId: string;
      conversationId: string;
      roomName?: string;
      roomIcon?: string;
      conversationTitle?: string;
    };

export type DropDestinationType = DropDestination["type"];

export type ForumRoomDestination = Extract<
  DropDestination,
  { type: "room" } | { type: "room_conversation" }
>;

export function isForumRoomDestination(
  destination: DropDestination | null | undefined
): destination is ForumRoomDestination {
  return destination?.type === "room" || destination?.type === "room_conversation";
}

export function isProjectRoomDestination(
  destination: DropDestination | null | undefined
): destination is Extract<DropDestination, { type: "project_room" }> {
  return destination?.type === "project_room";
}

export function dropDestinationKey(destination: DropDestination | null | undefined): string {
  if (!destination) return "feed";
  if (destination.type === "room") return `room:${destination.roomId}`;
  if (destination.type === "room_conversation") {
    return `room_conversation:${destination.roomId}:${destination.conversationId}`;
  }
  if (destination.type === "project_room") return `project_room:${destination.projectId}`;
  return destination.type;
}

export function dropPublishLabel(destination: DropDestination | null | undefined): string {
  if (destination?.type === "room") return "Post to Room";
  if (destination?.type === "room_conversation") return "Reply with Drop";
  if (destination?.type === "project_room") return "Post to Room";
  return "Publish";
}

export function dropDestinationBadge(destination: DropDestination | null | undefined): {
  prefix: string;
  label: string;
} | null {
  if (!destination) return null;
  if (destination.type === "room") {
    const icon = destination.roomIcon ? `${destination.roomIcon} ` : "";
    return {
      prefix: "Creating for",
      label: `${icon}${destination.roomName || "Room"}`.trim(),
    };
  }
  if (destination.type === "room_conversation") {
    return {
      prefix: "Replying in",
      label: destination.conversationTitle || "Conversation",
    };
  }
  if (destination.type === "project_room") {
    return {
      prefix: "Creating for",
      label: destination.projectTitle || "Project Room",
    };
  }
  return null;
}

export type RoomQuickCreateMode = "photo" | "audio" | "descript" | "art" | "link";

export const ROOM_QUICK_CREATE_MODES: Array<{
  id: RoomQuickCreateMode;
  label: string;
  studioMode: StudioCaptureMode;
}> = [
  { id: "photo", label: "Vision", studioMode: "photo" },
  { id: "audio", label: "Voice", studioMode: "audio" },
  { id: "descript", label: "Descript", studioMode: "descript" },
  { id: "art", label: "Art", studioMode: "art" },
  { id: "link", label: "Link", studioMode: "photo" },
];

/** UX hint only — never a hard per-Room type ban. */
export function suggestedStudioModeForRoom(roomId: string): StudioCaptureMode {
  const id = String(roomId || "").trim().toLowerCase();
  if (id === "music" || id === "music-drops") return "audio";
  if (id === "jab-comics") return "art";
  if (id === "jab-lit") return "descript";
  return "photo";
}

export const ALL_FORUM_STUDIO_MODES: StudioCaptureMode[] = [
  "photo",
  "video",
  "audio",
  "art",
  "descript",
];
