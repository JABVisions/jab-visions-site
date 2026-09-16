/** Shared Bucket Brain response model. New entity kinds can be added without
 * rebuilding the Drop Pad space — renderers switch on `kind`. */

export type BucketBrainIntent =
  | "work_board_search"
  | "creator_search"
  | "visionary_question"
  | "personal_search"
  | "board_content_search"
  | "hybrid_query";

export type BucketBrainPhase =
  | "idle"
  | "listening"
  | "searching"
  | "thinking"
  | "results";

export type WorkDropPreview = {
  id: string;
  title: string;
  kind?: string | null;
};

export type WorkBoardEntity = {
  kind: "work_board";
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
  location: string | null;
  bio: string | null;
  boardLabel: string | null;
  avatarUrl: string | null;
  glowColor: string | null;
  href: string;
  previews: WorkDropPreview[];
  score: number;
};

export type CreatorEntity = {
  kind: "creator";
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
  bio: string | null;
  avatarUrl: string | null;
  href: string;
  score: number;
};

export type VisionaryEntity = {
  kind: "visionary";
  id: string;
  answer: string;
  mode: "openai" | "knowledge" | "safety" | "unavailable";
  confidence?: string;
};

export type NoticeEntity = {
  kind: "notice";
  id: string;
  title: string;
  body: string;
};

/** Reserved for later: Dropbooks, Work Drops, projects, Board links. */
export type BoardContentEntity = {
  kind: "board_content";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  contentKind: "drop" | "dropbook" | "project" | "link";
};

export type BucketBrainEntity =
  | WorkBoardEntity
  | CreatorEntity
  | VisionaryEntity
  | NoticeEntity
  | BoardContentEntity;

export type BucketBrainResponse = {
  query: string;
  intent: BucketBrainIntent;
  status: string;
  entities: BucketBrainEntity[];
};

export type PersonalContextSource = {
  id: string;
  label: string;
  connected: boolean;
  notes: string;
};
