export type RoomActivityTag = "new" | "hot" | "quiet";

export type ForumRoom = {
  id: string;
  name: string;
  subtitle?: string;     // your “channels/purpose” descriptor line
  color?: string;        // optional: hex, e.g. "#FF4FD8"
  icon?: string;         // optional: emoji or short glyph
  isPinned?: boolean;
  sortOrder?: number;    // optional stable ordering
  threadCount?: number;  // optional display
  unreadCount?: number;  // optional display
  activityTag?: RoomActivityTag;
  lastActivityAt?: number; // unix ms (optional)
};

export type ThreadDrop = {
  id: string;
  roomId: string;
  title: string;
  subtitle?: string;     // optional mini descriptor
  authorName?: string;
  createdAt: number;     // unix ms
  lastReplyAt?: number;  // unix ms
  replyCount?: number;
  // add more later (tags, attachments, etc.)
};
