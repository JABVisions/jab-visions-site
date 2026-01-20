// lib/board/types.ts

export type MusicPlatform = "Spotify" | "SoundCloud" | "YouTube" | "Other";

export type MusicLink = {
  id: string;
  title: string;
  platform: MusicPlatform;
  url: string;
  embedUrl: string;
  createdAt: number;
};

export type FeedDrop = {
  id: string;
  type: "status" | "forum" | "board" | "photo" | "link" | "system";
  title?: string;
  text: string;
  author?: string;
  createdAt: number;
  href?: string;
  tags?: string[];

  linkUrl?: string | null;
  provider?: string | null;
  linkType?: "video" | "music" | "link" | "photo" | "other";
  image?: string | null;
  embedUrl?: string | null;
};
