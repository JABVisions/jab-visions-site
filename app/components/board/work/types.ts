export type AssetType =
  | "Headshot"
  | "Resume"
  | "Demo Reel"
  | "Photo"
  | "Video"
  | "Music"
  | "Link"
  | "Document";

export type Visibility = "Private" | "Friends" | "Public";

export type WorkCallType =
  | "Audition"
  | "Casting Call"
  | "Crew Call"
  | "Gig"
  | "Collaboration";

export type ProjectStatus =
  | "Idea"
  | "Planning"
  | "In Progress"
  | "Paused"
  | "Complete";

export type WorkAsset = {
  id: string;
  type: AssetType;
  title: string;
  createdAt: number;
  url?: string;
  visibility?: Visibility;
  tags?: string[];
};

export type WorkCall = {
  id: string;
  type: WorkCallType;
  title: string;
  description?: string;
  createdAt: number;
  visibility?: Visibility;
  deadline?: string;
  paid?: boolean;
  remote?: boolean;
  link?: string;
  tags?: string[];
};

export type ProjectItem = {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: number;
  description?: string;
  tags?: string[];
};

export type WorkState = {
  assets: WorkAsset[];
  calls: WorkCall[];
  projects: ProjectItem[];
};