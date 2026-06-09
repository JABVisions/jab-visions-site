"use client";

import { getLocalActivity, type BoardActivity } from "@/lib/board/activity";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { readDrops, type UniversalDrop } from "@/lib/board/drops/storage";
import { readFeed, type FeedDrop } from "@/lib/boardStore";

export const BOARD_PROJECTS_STORAGE_KEY = "jab_board_projects_v2";
export const BOARD_PROJECTS_UPDATED_EVENT = "board:projects:updated";
const LEGACY_BOARD_PROJECTS_STORAGE_KEYS = [
  "jab_board_projects_v1",
  "jab_board_projects",
];
const DROP_PAD_PROJECT_DROPS_STORAGE_KEYS = [
  "jab_drop_pad_project_drops_v1",
  "jab_drop_pad_project_drops",
  "jab_drop_pad_projects_v1",
];
const SEEDED_PROJECT_CONTACT_EMAIL = "casting@jabvisions.com";
let activeProjectsUserId: string | null = null;
let includeGlobalProjectLegacy = false;

function scopedProjectsKey() {
  return activeProjectsUserId
    ? `${BOARD_PROJECTS_STORAGE_KEY}:${activeProjectsUserId}`
    : BOARD_PROJECTS_STORAGE_KEY;
}

export function configureBoardProjectsStorage(
  userId: string | null,
  includeGlobalLegacy = false
) {
  activeProjectsUserId = userId;
  includeGlobalProjectLegacy = includeGlobalLegacy;
}

export type ProjectStatus =
  | "casting"
  | "staffing"
  | "pre_production"
  | "production"
  | "post"
  | "released";

export type ProjectMedia =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string };

export type ProjectInvite = {
  id: string;
  name: string;
  handle?: string;
  email?: string;
  role?: string;
  status: "invited" | "joined";
  invitedAt: number;
};

export type ProjectRoomPost = {
  id: string;
  authorName: string;
  text: string;
  createdAt: number;
};

export type BoardProject = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  logline: string;
  projectType: string;
  status: ProjectStatus;
  location: string;
  startDate: string;
  endDate?: string;
  unionStatus: string;
  compensationType: string;
  rate?: string;
  rolesNeeded: string;
  contactName: string;
  contactEmail: string;
  notes?: string;
  goal?: string;
  milestone?: string;
  source?: string;
  media?: ProjectMedia;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  authorAvatar?: string;
  authorGlow?: string;
  authorAuraIntensity?: number;
  productionTitle?: string;
  roleTitle?: string;
  department?: string;
  payRange?: string;
  remoteOrInPerson?: string;
  deadline?: string;
  auditionInstructions?: string;
  applicationLink?: string;
  attachedFiles?: unknown[];
  payDropEligible?: boolean;
  invites: ProjectInvite[];
  roomPosts: ProjectRoomPost[];
};

function stripProjectPrefix(title: string) {
  return title.replace(/^Project Drop:\s*/i, "").trim();
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function safeTime(value: unknown, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const direct = Number(value);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function seedRoomPosts(title: string, contactName: string): ProjectRoomPost[] {
  return [
    {
      id: uid("post"),
      authorName: contactName || "Host",
      text: `Welcome to ${title}. Use this room to invite collaborators, post updates, and keep the project moving.`,
      createdAt: Date.now(),
    },
  ];
}

function normalizeInvite(value: any): ProjectInvite | null {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name ?? "").trim();
  if (!name) return null;
  return {
    id: String(value.id ?? uid("invite")),
    name,
    handle: typeof value.handle === "string" ? value.handle : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    status: value.status === "joined" ? "joined" : "invited",
    invitedAt: safeTime(value.invitedAt),
  };
}

function normalizeRoomPost(value: any): ProjectRoomPost | null {
  if (!value || typeof value !== "object") return null;
  const text = String(value.text ?? "").trim();
  if (!text) return null;
  return {
    id: String(value.id ?? uid("post")),
    authorName: String(value.authorName ?? "Host"),
    text,
    createdAt: safeTime(value.createdAt),
  };
}

function sanitizeProjectsForStorage(items: BoardProject[]) {
  return items.map((project) => {
    if (!project.media?.src?.startsWith("data:")) return project;
    return {
      ...project,
      media: undefined,
      notes: project.notes
        ? `${project.notes}\n\n[Local image omitted to fit browser storage.]`
        : "[Local image omitted to fit browser storage.]",
    };
  });
}

function allKnownProjectStorageKeys() {
  if (typeof window === "undefined") return [scopedProjectsKey()];

  const keys = new Set<string>([
    scopedProjectsKey(),
    BOARD_PROJECTS_STORAGE_KEY,
    ...LEGACY_BOARD_PROJECTS_STORAGE_KEYS,
  ]);

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${BOARD_PROJECTS_STORAGE_KEY}:`)) {
        keys.add(key);
      }
    }
  } catch {
    // Keep the explicit keys above if localStorage enumeration is blocked.
  }

  return Array.from(keys);
}

function textLooksProject(value: unknown) {
  return /\b(project(\s+drop)?|casting|crew\s+call|gig|audition|work|production|those\s+ryderz|ryderz)\b/i.test(
    String(value ?? "")
  );
}

function kindLooksProject(value: unknown) {
  return /^(project|project_drop|casting|casting_call|crew|crew_call|gig|audition|work|production)$/i.test(
    String(value ?? "").trim().replace(/[\s-]+/g, "_")
  );
}

function metaLooksProject(meta: Record<string, any> | null | undefined) {
  if (!meta) return false;
  // Only treat a drop as a project when it carries an EXPLICIT project marker.
  // Matching loose body/title text (e.g. the word "work") wrongly swept ordinary
  // drops — work thoughts especially — into the Project Notebook by the hundreds.
  return (
    kindLooksProject(meta.kind) ||
    kindLooksProject(meta.cardStyle) ||
    kindLooksProject(meta.dropType) ||
    kindLooksProject(meta.drop_type) ||
    (typeof meta.projectId === "string" && meta.projectId.trim() !== "")
  );
}

function normalizeProjectStatus(value: unknown): ProjectStatus {
  return value === "staffing" ||
    value === "pre_production" ||
    value === "production" ||
    value === "post" ||
    value === "released"
    ? value
    : "casting";
}

function isSeededOrDemoProjectValue(value: any) {
  const meta = value?.meta && typeof value.meta === "object" ? value.meta : {};
  const id = String(value?.id ?? value?.projectId ?? "").toLowerCase();
  const contactEmail = String(value?.contactEmail ?? meta?.contactEmail ?? "").toLowerCase();
  const notes = String(value?.notes ?? meta?.notes ?? "").toLowerCase();
  return (
    Boolean(value?.seeded || meta?.seeded || value?.demo || meta?.demo) ||
    id.startsWith("demo_") ||
    id.startsWith("seed_") ||
    id.includes("demo_feed_project_drop") ||
    contactEmail === SEEDED_PROJECT_CONTACT_EMAIL ||
    notes.includes("auto-seeded test project") ||
    notes.includes("test project seeded from work")
  );
}

function isSeededOrDemoProject(project: BoardProject) {
  return isSeededOrDemoProjectValue(project);
}

function resolveProjectImage(meta: Record<string, any> | null | undefined, itemImageUrl?: string | null) {
  if (typeof itemImageUrl === "string" && itemImageUrl) {
    return itemImageUrl;
  }
  if (!meta) return null;

  if (
    meta.media &&
    meta.media.kind === "image" &&
    typeof meta.media.src === "string" &&
    meta.media.src
  ) {
    return meta.media.src;
  }

  if (
    meta.preview &&
    typeof meta.preview.image === "string" &&
    meta.preview.image
  ) {
    return meta.preview.image;
  }

  if (typeof meta.image_url === "string" && meta.image_url) {
    return meta.image_url;
  }

  return null;
}

function mergeProjectRecord(
  base: BoardProject,
  incoming: BoardProject
): BoardProject {
  return {
    ...base,
    ...incoming,
    logline: base.logline || incoming.logline,
    location: base.location || incoming.location,
    startDate: base.startDate || incoming.startDate,
    endDate: base.endDate || incoming.endDate,
    unionStatus:
      base.unionStatus && base.unionStatus !== "Negotiable"
        ? base.unionStatus
        : incoming.unionStatus,
    compensationType:
      base.compensationType && base.compensationType !== "Negotiable"
        ? base.compensationType
        : incoming.compensationType,
    rate: base.rate || incoming.rate,
    rolesNeeded: base.rolesNeeded || incoming.rolesNeeded,
    contactName:
      base.contactName && base.contactName !== "Project Host"
        ? base.contactName
        : incoming.contactName,
    contactEmail: base.contactEmail || incoming.contactEmail,
    notes: base.notes || incoming.notes,
    goal: base.goal || incoming.goal,
    milestone: base.milestone || incoming.milestone,
    source: base.source || incoming.source,
    media: base.media ?? incoming.media,
    authorId: base.authorId || incoming.authorId,
    authorName: base.authorName || incoming.authorName,
    authorUsername: base.authorUsername || incoming.authorUsername,
    authorAvatar: base.authorAvatar || incoming.authorAvatar,
    authorGlow: base.authorGlow || incoming.authorGlow,
    authorAuraIntensity: base.authorAuraIntensity ?? incoming.authorAuraIntensity,
    productionTitle: base.productionTitle || incoming.productionTitle,
    roleTitle: base.roleTitle || incoming.roleTitle,
    department: base.department || incoming.department,
    payRange: base.payRange || incoming.payRange,
    remoteOrInPerson: base.remoteOrInPerson || incoming.remoteOrInPerson,
    deadline: base.deadline || incoming.deadline,
    auditionInstructions: base.auditionInstructions || incoming.auditionInstructions,
    applicationLink: base.applicationLink || incoming.applicationLink,
    attachedFiles: Array.isArray(base.attachedFiles) && base.attachedFiles.length > 0
      ? base.attachedFiles
      : incoming.attachedFiles,
    payDropEligible: base.payDropEligible ?? incoming.payDropEligible,
    invites:
      Array.isArray(base.invites) && base.invites.length > 0
        ? base.invites
        : incoming.invites,
    roomPosts:
      Array.isArray(base.roomPosts) && base.roomPosts.length > 0
        ? base.roomPosts
        : incoming.roomPosts,
    updatedAt: Math.max(safeTime(base.updatedAt), safeTime(incoming.updatedAt)),
  };
}

function projectFromActivity(item: BoardActivity): BoardProject | null {
  const meta = item.meta ?? {};
  if (isSeededOrDemoProjectValue(item)) return null;

  const isProjectDrop =
    metaLooksProject(meta) || /^Project Drop:\s*/i.test(item.title ?? "");

  if (!isProjectDrop) return null;

  const rawTitle =
    stripProjectPrefix(item.title ?? "") ||
    (typeof meta.preview?.title === "string" ? meta.preview.title : "");
  const title = rawTitle || "Untitled Project";
  const createdAt = safeTime(item.created_at);
  const contactName =
    typeof meta.authorName === "string" && meta.authorName.trim()
      ? meta.authorName.trim()
      : typeof meta.ownerLabel === "string" && meta.ownerLabel.trim()
        ? meta.ownerLabel.trim()
      : typeof meta.contactName === "string" && meta.contactName.trim()
        ? meta.contactName.trim()
      : "Project Host";
  const resolvedImage = resolveProjectImage(meta, item.image_url);
  const authorName = String(meta.authorName ?? meta.ownerLabel ?? contactName).trim();
  const authorUsername = String(meta.authorUsername ?? meta.ownerUsername ?? meta.username ?? "")
    .trim()
    .replace(/^@+/, "");

  return {
    id:
      (typeof meta.projectId === "string" && meta.projectId) ||
      String(item.id || uid("project")),
    createdAt,
    updatedAt: createdAt,
    title,
    logline: String(item.body ?? ""),
    projectType:
      typeof meta.projectType === "string" && meta.projectType.trim()
        ? meta.projectType.trim()
        : typeof meta.dropType === "string" && meta.dropType.trim()
          ? meta.dropType.trim()
        : "Project",
    status:
      normalizeProjectStatus(meta.status),
    location: typeof meta.location === "string" ? meta.location : "",
    startDate: typeof meta.startDate === "string" ? meta.startDate : "",
    endDate: typeof meta.endDate === "string" ? meta.endDate : undefined,
    unionStatus: typeof meta.unionStatus === "string" ? meta.unionStatus : "Negotiable",
    compensationType:
      typeof meta.compensationType === "string" ? meta.compensationType : "Negotiable",
    rate: typeof meta.rate === "string" ? meta.rate : undefined,
    rolesNeeded: typeof meta.rolesNeeded === "string" ? meta.rolesNeeded : "",
    contactName,
    contactEmail: typeof meta.contactEmail === "string" ? meta.contactEmail : "",
    notes: typeof meta.notes === "string" ? meta.notes : undefined,
    goal: typeof meta.goal === "string" ? meta.goal : undefined,
    milestone: typeof meta.milestone === "string" ? meta.milestone : undefined,
    source: typeof meta.source === "string" ? meta.source : undefined,
    media: resolvedImage ? { kind: "image", src: resolvedImage } : undefined,
    authorId: String(item.user_id ?? meta.authorId ?? "").trim() || undefined,
    authorName: authorName || undefined,
    authorUsername: authorUsername || undefined,
    authorAvatar: typeof meta.authorAvatar === "string" ? meta.authorAvatar : undefined,
    authorGlow:
      typeof meta.authorGlow === "string"
        ? meta.authorGlow
        : typeof meta.glowColor === "string"
          ? meta.glowColor
          : undefined,
    authorAuraIntensity:
      typeof meta.authorAuraIntensity === "number" ? meta.authorAuraIntensity : undefined,
    productionTitle: typeof meta.productionTitle === "string" ? meta.productionTitle : undefined,
    roleTitle: typeof meta.roleTitle === "string" ? meta.roleTitle : undefined,
    department: typeof meta.department === "string" ? meta.department : undefined,
    payRange: typeof meta.payRange === "string" ? meta.payRange : undefined,
    remoteOrInPerson:
      typeof meta.remoteOrInPerson === "string" ? meta.remoteOrInPerson : undefined,
    deadline: typeof meta.deadline === "string" ? meta.deadline : undefined,
    auditionInstructions:
      typeof meta.auditionInstructions === "string" ? meta.auditionInstructions : undefined,
    applicationLink:
      typeof meta.applicationLink === "string" ? meta.applicationLink : undefined,
    attachedFiles: Array.isArray(meta.attachedFiles) ? meta.attachedFiles : undefined,
    payDropEligible:
      typeof meta.payDropEligible === "boolean" ? meta.payDropEligible : undefined,
    invites: [],
    roomPosts: seedRoomPosts(title, contactName),
  };
}

function projectFromFeed(drop: FeedDrop): BoardProject | null {
  const meta = drop.meta ?? {};
  if (isSeededOrDemoProjectValue(drop)) return null;

  if (!metaLooksProject(meta) && !/^Project Drop:\s*/i.test(drop.title ?? "")) {
    return null;
  }

  const activityLike: BoardActivity = {
    id: `feed_${drop.id}`,
    created_at: new Date(drop.createdAt).toISOString(),
    user_id: drop.authorId || null,
    kind: "status",
    title: drop.title,
    body: drop.text,
    href: drop.href ?? null,
    image_url: resolveProjectImage(meta),
    meta: {
      authorName: drop.authorName,
      authorId: drop.authorId,
      ...meta,
    },
  };

  return projectFromActivity(activityLike);
}

function projectFromUniversalDrop(drop: UniversalDrop): BoardProject | null {
  if (isSeededOrDemoProjectValue(drop)) return null;
  if (drop.type !== "project") return null;

  const meta = drop.meta ?? {};
  const createdAt = safeTime(drop.createdAt);
  const title = stripProjectPrefix(drop.title || "") || "Untitled Project";
  const logline =
    drop.description ||
    (typeof meta.description === "string" ? meta.description : "") ||
    "";
  const identity = readCurrentBoardIdentity();
  const image =
    drop.imageUrl ||
    (drop.mediaKind === "image" ? drop.mediaUrl : "") ||
    (typeof meta.imageUrl === "string" ? meta.imageUrl : "") ||
    "";
  const authorName =
    drop.authorName ||
    (typeof meta.authorName === "string" ? meta.authorName : "") ||
    identity.displayName;
  const authorUsername =
    drop.authorUsername ||
    (typeof meta.authorUsername === "string" ? meta.authorUsername : "") ||
    identity.username;

  return {
    id: drop.projectId || (typeof meta.projectId === "string" ? meta.projectId : "") || `universal_${drop.id}`,
    createdAt,
    updatedAt: createdAt,
    title,
    logline,
    projectType:
      drop.projectType ||
      (typeof meta.projectType === "string" ? meta.projectType : "") ||
      "Project",
    status: normalizeProjectStatus(drop.projectStatus || meta.status),
    location: typeof meta.location === "string" ? meta.location : "",
    startDate: typeof meta.startDate === "string" ? meta.startDate : "",
    endDate: typeof meta.endDate === "string" ? meta.endDate : undefined,
    unionStatus: typeof meta.unionStatus === "string" ? meta.unionStatus : "Negotiable",
    compensationType:
      typeof meta.compensationType === "string" ? meta.compensationType : "Negotiable",
    rate: typeof meta.rate === "string" ? meta.rate : undefined,
    rolesNeeded:
      typeof meta.rolesNeeded === "string" && meta.rolesNeeded
        ? meta.rolesNeeded
        : logline,
    contactName:
      typeof meta.contactName === "string" && meta.contactName
        ? meta.contactName
        : authorName || "Project Host",
    contactEmail: typeof meta.contactEmail === "string" ? meta.contactEmail : "",
    notes: drop.url || drop.embedUrl || undefined,
    goal: drop.goal || (typeof meta.goal === "string" ? meta.goal : undefined),
    milestone:
      drop.milestone || (typeof meta.milestone === "string" ? meta.milestone : undefined),
    source: drop.source || (typeof meta.source === "string" ? meta.source : "universal_drop"),
    media: image ? { kind: "image", src: image } : undefined,
    authorId:
      drop.authorId ||
      (typeof meta.authorId === "string" ? meta.authorId : "") ||
      identity.id,
    authorName,
    authorUsername: authorUsername?.replace(/^@+/, ""),
    authorAvatar:
      drop.authorAvatar ||
      (typeof meta.authorAvatar === "string" ? meta.authorAvatar : "") ||
      identity.avatar,
    authorGlow:
      drop.authorGlow ||
      (typeof meta.authorGlow === "string" ? meta.authorGlow : "") ||
      identity.glow,
    authorAuraIntensity:
      drop.authorAuraIntensity ??
      (typeof meta.authorAuraIntensity === "number" ? meta.authorAuraIntensity : undefined) ??
      identity.auraIntensity,
    invites: [],
    roomPosts: seedRoomPosts(title, authorName || "Project Host"),
  };
}

function projectFromDropPadProjectDrop(value: any): BoardProject | null {
  if (!value || typeof value !== "object") return null;
  if (isSeededOrDemoProjectValue(value)) return null;

  const id = String(value.id ?? "").trim();
  const title = String(value.title ?? value.name ?? "").trim();
  if (!id || !title) return null;

  const payload =
    value.payload && typeof value.payload === "object"
      ? value.payload
      : {
          mediaUrl: value.mediaUrl,
          mediaType: value.mediaType,
          embedUrl: value.embedUrl,
          url: value.url,
          text: value.text,
        };
  const createdAt = safeTime(value.createdAt ?? value.updatedAt);
  const description =
    typeof value.description === "string"
      ? value.description
      : typeof value.body === "string"
        ? value.body
        : "";
  const body =
    typeof payload?.text === "string" && payload.text.trim()
      ? payload.text
      : description;
  const mediaUrl =
    payload?.mediaType === "image" && typeof payload.mediaUrl === "string"
      ? payload.mediaUrl
      : "";

  return {
    id: `droppad_${id}`,
    createdAt,
    updatedAt: createdAt,
    title,
    logline: body,
    projectType: "Project Drop",
    status: "casting",
    location: "",
    startDate: "",
    unionStatus: "Negotiable",
    compensationType: "Negotiable",
    rolesNeeded: body,
    contactName: String(value.authorName ?? value.contactName ?? "Project Host"),
    contactEmail: "",
    notes:
      body ||
      (typeof payload?.url === "string" ? payload.url : undefined) ||
      (typeof payload?.embedUrl === "string" ? payload.embedUrl : undefined),
    media: mediaUrl ? { kind: "image", src: mediaUrl } : undefined,
    authorName:
      typeof value.authorName === "string" ? value.authorName : undefined,
    authorUsername:
      typeof value.authorUsername === "string" ? value.authorUsername : undefined,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    authorGlow: typeof value.authorGlow === "string" ? value.authorGlow : undefined,
    invites: [],
    roomPosts: seedRoomPosts(title, String(value.authorName ?? value.contactName ?? "Project Host")),
  };
}

function projectFromLooseStoredDrop(value: any, storageKey: string): BoardProject | null {
  if (!value || typeof value !== "object") return null;
  if (isSeededOrDemoProjectValue(value)) return null;

  const title = String(value.title ?? value.name ?? value.previewTitle ?? "").trim();
  const description = String(
    value.logline ??
      value.description ??
      value.body ??
      value.text ??
      value.previewDescription ??
      ""
  ).trim();
  const meta =
    value.meta && typeof value.meta === "object"
      ? value.meta
      : value.payload && typeof value.payload === "object"
        ? value.payload
        : {};
  const looksProject =
    metaLooksProject(meta) ||
    kindLooksProject(value.type) ||
    kindLooksProject(value.kind) ||
    kindLooksProject(value.cardStyle) ||
    kindLooksProject(value.dropType) ||
    /^Project Drop:\s*/i.test(title);

  if (!title || !looksProject) return null;

  const createdAt = safeTime(value.createdAt ?? value.created_at ?? value.updatedAt);
  // Prefer the underlying projectId so a loose copy of a project drop shares the
  // SAME id as the dedicated activity/feed/universal readers and dedupes to one,
  // instead of becoming a distinct "loose_" duplicate of an existing project.
  const projectId = String(value.projectId ?? meta?.projectId ?? "").trim();
  const id = String(value.id ?? `${storageKey}_${title}_${createdAt}`);
  const image =
    (typeof value.previewImage === "string" && value.previewImage) ||
    (typeof value.image_url === "string" && value.image_url) ||
    (typeof value.imageUrl === "string" && value.imageUrl) ||
    (typeof meta?.previewImage === "string" && meta.previewImage) ||
    (typeof meta?.preview?.image === "string" && meta.preview.image) ||
    (typeof meta?.mediaUrl === "string" && meta.mediaUrl) ||
    "";

  return {
    id: projectId || `loose_${id}`,
    createdAt,
    updatedAt: safeTime(value.updatedAt, createdAt),
    title: stripProjectPrefix(title) || title,
    logline: description,
    projectType:
      String(value.projectType ?? meta?.projectType ?? value.type ?? meta?.dropType ?? "Project")
        .replace(/_/g, " ")
        .trim() || "Project",
    status: "casting",
    location: String(value.location ?? meta?.location ?? ""),
    startDate: String(value.startDate ?? meta?.startDate ?? ""),
    unionStatus: String(value.unionStatus ?? meta?.unionStatus ?? "Negotiable"),
    compensationType: String(value.compensationType ?? meta?.compensationType ?? "Negotiable"),
    rate: typeof value.rate === "string" ? value.rate : typeof meta?.rate === "string" ? meta.rate : undefined,
    rolesNeeded: String(value.rolesNeeded ?? meta?.rolesNeeded ?? description),
    contactName: String(value.contactName ?? meta?.contactName ?? meta?.ownerLabel ?? "Project Host"),
    contactEmail: String(value.contactEmail ?? meta?.contactEmail ?? ""),
    notes: String(value.notes ?? meta?.notes ?? value.url ?? value.href ?? "").trim() || undefined,
    goal: String(value.goal ?? meta?.goal ?? "").trim() || undefined,
    milestone: String(value.milestone ?? meta?.milestone ?? "").trim() || undefined,
    source: String(value.source ?? meta?.source ?? storageKey ?? "").trim() || undefined,
    media: image ? { kind: "image", src: image } : undefined,
    authorId: String(value.authorId ?? meta?.authorId ?? value.user_id ?? "").trim() || undefined,
    authorName:
      String(value.authorName ?? meta?.authorName ?? meta?.ownerLabel ?? "").trim() || undefined,
    authorUsername:
      String(value.authorUsername ?? meta?.authorUsername ?? meta?.ownerUsername ?? "").trim().replace(/^@+/, "") || undefined,
    authorAvatar:
      String(value.authorAvatar ?? meta?.authorAvatar ?? meta?.avatarDataUrl ?? "").trim() || undefined,
    authorGlow:
      String(value.authorGlow ?? meta?.authorGlow ?? meta?.glowColor ?? "").trim() || undefined,
    invites: [],
    roomPosts: seedRoomPosts(title, "Project Host"),
  };
}

function readLooseProjectDropsFromStorage(): BoardProject[] {
  if (typeof window === "undefined") return [];

  const projects: BoardProject[] = [];
  try {
    // Never re-ingest the project notebook's OWN storage. Doing so wraps already
    // resolved projects as brand-new "loose_" drops, which then get persisted and
    // re-ingested again (loose_loose_…) every cycle — multiplying one project into
    // hundreds of repetitive tiles. The notebook keys are read by readBoardProjects.
    const excludedKeys = new Set(allKnownProjectStorageKeys());
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !/drop|project|activity|feed|board/i.test(key)) continue;
      if (excludedKeys.has(key) || key.startsWith(`${BOARD_PROJECTS_STORAGE_KEY}:`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];

      for (const item of items) {
        const project = projectFromLooseStoredDrop(item, key);
        if (project) projects.push(project);
      }
    }
  } catch {
    return projects;
  }

  return projects;
}

function readDropPadProjectProjects(): BoardProject[] {
  if (typeof window === "undefined") return [];

  const projects: BoardProject[] = [];
  try {
    for (const key of DROP_PAD_PROJECT_DROPS_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        const project = projectFromDropPadProjectDrop(item);
        if (project) projects.push(project);
      }
    }
  } catch {
    return projects;
  }

  return projects;
}

// A genuine notebook project was either created through the New Project Drop
// form (id `project_…`), placed from Drop Pad (`droppad_…`), or has real user
// engagement (an invite). Everything else persisted in the projects store is
// junk auto-ingested by the old over-eager resolver and is dropped on read.
function isGenuineNotebookProject(project: BoardProject): boolean {
  const id = String(project.id || "");
  if (id.startsWith("project_") || id.startsWith("droppad_")) return true;
  if (Array.isArray(project.invites) && project.invites.length > 0) return true;
  return false;
}

// One-time cleanup: physically remove the corrupt auto-ingested entries from
// localStorage so the bloated store (hundreds of bogus tiles) is reset, not just
// hidden on read. Safe to call repeatedly — it only rewrites keys that change.
export function pruneCorruptProjects(): boolean {
  if (typeof window === "undefined") return false;
  let changed = false;
  try {
    for (const key of allKnownProjectStorageKeys()) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      const cleaned = parsed.filter((value: any) => {
        if (isSeededOrDemoProjectValue(value)) return false;
        const id = String(value?.id ?? "");
        const hasInvites = Array.isArray(value?.invites) && value.invites.length > 0;
        return id.startsWith("project_") || id.startsWith("droppad_") || hasInvites;
      });
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(cleaned));
        changed = true;
      }
    }
    if (changed) {
      window.dispatchEvent(new CustomEvent(BOARD_PROJECTS_UPDATED_EVENT));
    }
  } catch {
    return changed;
  }
  return changed;
}

export function readBoardProjects(): BoardProject[] {
  try {
    const rawItems: any[] = [];
    const keys = allKnownProjectStorageKeys();

    for (const storageKey of keys) {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rawItems.push(...parsed);
    }

    if (rawItems.length === 0) return [];

    const normalized = rawItems
      .filter((value) => !isSeededOrDemoProjectValue(value))
      .map((value: any): BoardProject | null => {
        const title = String(value?.title ?? "").trim();
        if (!title) return null;
        const contactName = String(value?.contactName ?? "Host").trim() || "Host";
        return {
          id: String(value?.id ?? uid("project")),
          createdAt: safeTime(value?.createdAt),
          updatedAt: safeTime(value?.updatedAt, safeTime(value?.createdAt)),
          title,
          logline: String(value?.logline ?? ""),
          projectType: String(value?.projectType ?? value?.type ?? "Project"),
          status: normalizeProjectStatus(value?.status),
          location: String(value?.location ?? ""),
          startDate: String(value?.startDate ?? ""),
          endDate: typeof value?.endDate === "string" ? value.endDate : undefined,
          unionStatus: String(value?.unionStatus ?? value?.union ?? "Non-Union"),
          compensationType: String(value?.compensationType ?? "Negotiable"),
          rate: typeof value?.rate === "string" ? value.rate : undefined,
          rolesNeeded: String(value?.rolesNeeded ?? ""),
          contactName,
          contactEmail: String(value?.contactEmail ?? ""),
          notes: typeof value?.notes === "string" ? value.notes : undefined,
          goal: typeof value?.goal === "string" ? value.goal : undefined,
          milestone: typeof value?.milestone === "string" ? value.milestone : undefined,
          source: typeof value?.source === "string" ? value.source : undefined,
          media:
            value?.media &&
            (value.media.kind === "image" || value.media.kind === "video") &&
            typeof value.media.src === "string"
              ? { kind: value.media.kind, src: value.media.src }
              : undefined,
          authorId: typeof value?.authorId === "string" ? value.authorId : undefined,
          authorName: typeof value?.authorName === "string" ? value.authorName : undefined,
          authorUsername:
            typeof value?.authorUsername === "string" ? value.authorUsername : undefined,
          authorAvatar:
            typeof value?.authorAvatar === "string" ? value.authorAvatar : undefined,
          authorGlow: typeof value?.authorGlow === "string" ? value.authorGlow : undefined,
          authorAuraIntensity:
            typeof value?.authorAuraIntensity === "number"
              ? value.authorAuraIntensity
              : undefined,
          productionTitle:
            typeof value?.productionTitle === "string" ? value.productionTitle : undefined,
          roleTitle: typeof value?.roleTitle === "string" ? value.roleTitle : undefined,
          department: typeof value?.department === "string" ? value.department : undefined,
          payRange: typeof value?.payRange === "string" ? value.payRange : undefined,
          remoteOrInPerson:
            typeof value?.remoteOrInPerson === "string" ? value.remoteOrInPerson : undefined,
          deadline: typeof value?.deadline === "string" ? value.deadline : undefined,
          auditionInstructions:
            typeof value?.auditionInstructions === "string"
              ? value.auditionInstructions
              : undefined,
          applicationLink:
            typeof value?.applicationLink === "string" ? value.applicationLink : undefined,
          attachedFiles: Array.isArray(value?.attachedFiles) ? value.attachedFiles : undefined,
          payDropEligible:
            typeof value?.payDropEligible === "boolean" ? value.payDropEligible : undefined,
          invites: Array.isArray(value?.invites)
            ? value.invites.map(normalizeInvite).filter(Boolean) as ProjectInvite[]
            : [],
          roomPosts: Array.isArray(value?.roomPosts)
            ? value.roomPosts.map(normalizeRoomPost).filter(Boolean) as ProjectRoomPost[]
            : seedRoomPosts(title, contactName),
        };
      })
      .filter((value): value is BoardProject => Boolean(value))
      .filter((project) => !isSeededOrDemoProject(project));

    const merged = new Map<string, BoardProject>();
    for (const project of normalized) {
      mergeIntoCanonical(merged, project);
    }

    return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

// Collapse accidental wrapper-prefixed ids (loose_, feed_, universal_, and any
// nested repeats like loose_loose_) down to the underlying project id so the
// same project from different storage sources dedupes to ONE tile. droppad_ is
// preserved on purpose — Drop Pad drops are keyed that way in both merge sites.
function canonicalProjectKey(id: string): string {
  let key = String(id || "").trim();
  if (!key) return key;
  let prev = "";
  let guard = 0;
  while (key !== prev && guard < 16) {
    prev = key;
    key = key.replace(/^(loose_|feed_|universal_)/i, "");
    guard += 1;
  }
  return key || String(id);
}

function mergeIntoCanonical(merged: Map<string, BoardProject>, project: BoardProject) {
  const key = canonicalProjectKey(project.id);
  const existing = merged.get(key);
  const record = existing ? mergeProjectRecord(existing, project) : { ...project };
  record.id = key;
  merged.set(key, record);
}

export function resolveBoardProjects(): BoardProject[] {
  const stored = readBoardProjects();
  const merged = new Map<string, BoardProject>();

  for (const project of stored) {
    mergeIntoCanonical(merged, project);
  }

  for (const project of readDropPadProjectProjects()) {
    mergeIntoCanonical(merged, project);
  }

  for (const project of readLooseProjectDropsFromStorage()) {
    mergeIntoCanonical(merged, project);
  }

  for (const item of getLocalActivity()) {
    const project = projectFromActivity(item);
    if (!project) continue;
    mergeIntoCanonical(merged, project);
  }

  for (const drop of readFeed()) {
    const project = projectFromFeed(drop);
    if (!project) continue;
    mergeIntoCanonical(merged, project);
  }

  for (const drop of readDrops()) {
    const project = projectFromUniversalDrop(drop);
    if (!project) continue;
    mergeIntoCanonical(merged, project);
  }

  return Array.from(merged.values())
    .filter((project) => !isSeededOrDemoProject(project))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function syncResolvedProjectsToStorage() {
  const stored = readBoardProjects();
  const resolved = resolveBoardProjects();

  const storedIds = new Set(stored.map((project) => project.id));
  const needsBackfill =
    resolved.length > stored.length ||
    resolved.some((project) => !storedIds.has(project.id));

  if (needsBackfill && resolved.length > 0) {
    writeBoardProjects(resolved);
    return resolved;
  }

  return stored.length > 0 ? stored : resolved;
}

export async function syncRemoteProjectActivitiesToStorage(sb: any) {
  try {
    const { data, error } = await sb
      .from("board_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error || !Array.isArray(data)) return syncResolvedProjectsToStorage();

    const stored = syncResolvedProjectsToStorage();
    const merged = new Map(stored.map((project) => [project.id, project]));

    for (const item of data) {
      const project = projectFromActivity(item as BoardActivity);
      if (!project) continue;
      const existing = merged.get(project.id);
      merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
    }

    const next = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    if (next.length > stored.length) {
      writeBoardProjects(next);
      return next;
    }

    return stored.length > 0 ? stored : next;
  } catch {
    return syncResolvedProjectsToStorage();
  }
}

export function writeBoardProjects(items: BoardProject[]) {
  const key = scopedProjectsKey();
  const realItems = items.filter((project) => !isSeededOrDemoProject(project));
  try {
    localStorage.setItem(key, JSON.stringify(realItems));
    if (key !== BOARD_PROJECTS_STORAGE_KEY) {
      localStorage.setItem(BOARD_PROJECTS_STORAGE_KEY, JSON.stringify(realItems));
    }
    window.dispatchEvent(new CustomEvent(BOARD_PROJECTS_UPDATED_EVENT));
    window.dispatchEvent(
      new StorageEvent("storage", { key })
    );
    return true;
  } catch {
    try {
      const sanitized = sanitizeProjectsForStorage(realItems);
      localStorage.setItem(
        key,
        JSON.stringify(sanitized)
      );
      if (key !== BOARD_PROJECTS_STORAGE_KEY) {
        localStorage.setItem(BOARD_PROJECTS_STORAGE_KEY, JSON.stringify(sanitized));
      }
      window.dispatchEvent(new CustomEvent(BOARD_PROJECTS_UPDATED_EVENT));
      window.dispatchEvent(
        new StorageEvent("storage", { key })
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function createBoardProject(
  input: Omit<BoardProject, "id" | "createdAt" | "updatedAt" | "invites" | "roomPosts">
): BoardProject {
  const now = Date.now();
  const contactName = input.contactName.trim() || "Host";
  const identity = readCurrentBoardIdentity();
  return {
    ...input,
    id: uid("project"),
    createdAt: now,
    updatedAt: now,
    authorId: input.authorId || identity.id,
    authorName: input.authorName || identity.displayName,
    authorUsername: input.authorUsername || identity.username,
    authorAvatar: input.authorAvatar || identity.avatar,
    authorGlow: input.authorGlow || identity.glow,
    authorAuraIntensity: input.authorAuraIntensity ?? identity.auraIntensity,
    invites: [],
    roomPosts: seedRoomPosts(input.title, contactName),
  };
}

export function statusLabel(status: ProjectStatus) {
  switch (status) {
    case "casting":
      return "Casting";
    case "staffing":
      return "Staffing";
    case "pre_production":
      return "Pre-Production";
    case "production":
      return "Production";
    case "post":
      return "Post";
    case "released":
      return "Released";
  }
}
