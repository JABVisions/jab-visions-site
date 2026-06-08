export type AssetKind =
  | "youtube"
  | "music"
  | "link"
  | "media"
  | "doc"
  | "pay"
  | "note";

export type DropRoute =
  | "home"
  | "feed"
  | "forums"
  | "work"
  | "profile"
  | "friend-zone"
  | "options"
  | "explore";

export type Visibility = "Private" | "Friends" | "Public";

export type AssetItem = {
  id: string;
  kind: AssetKind;
  title: string;
  createdAt: number;
  url?: string;
  visibility?: Visibility;
  tags?: string[];
};