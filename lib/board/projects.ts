"use client";

import { getLocalActivity, type BoardActivity } from "@/lib/board/activity";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { readDrops, type UniversalDrop } from "@/lib/board/drops/storage";
import { readFeed, type FeedDrop } from "@/lib/boardStore";
import {
  DROP_PAD_PROJECT_DROPS_STORAGE_KEYS,
  isExplicitProjectDropRecord,
  isStoredNotebookProject,
  notebookSourceForProjectRecord,
} from "@/lib/board/isProjectNotebookDrop";
import {
  applyProjectRoomActivitiesToProjects,
  mergeRoomPosts,
} from "@/lib/board/projectRoomDrop";
import {
  mergeProjectCover,
  persistableImageUrl,
  persistableProjectCover,
  pickProjectHostName,
  resolveProjectCover,
  resolveProjectEndDate,
  resolveProjectLocation,
  resolveProjectStartDate,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";
import {
  profileBoardDropFromProject,
  persistLocalProjectsViaApi,
  projectDropsFromProfileStyle,
  PROJECT_NOTEBOOK_STYLE_KEY,
  isCloudProjectDrop,
} from "@/lib/board/projectProfileDrop";
import { getCurrentUserId } from "@/lib/board/boardDropEditStore";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const BOARD_PROJECTS_STORAGE_KEY = "jab_board_projects_v2";
export const BOARD_PROJECTS_UPDATED_EVENT = "board:projects:updated";
const LEGACY_BOARD_PROJECTS_STORAGE_KEYS = [
  "jab_board_projects_v1",
  "jab_board_projects",
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

export type ProjectMedia = ProjectCoverMedia;

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
  authorId?: string;
  text: string;
  createdAt: number;
  mediaUrl?: string;
  mediaKind?: "image" | "video";
  bucket?: string;
  storagePath?: string;
  dropId?: string;
  projectId?: string;
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

function persistableRoomMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const src = value.trim();
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return undefined;
  return src;
}

function normalizeRoomPost(value: any): ProjectRoomPost | null {
  if (!value || typeof value !== "object") return null;
  const text = String(value.text ?? "").trim();
  const mediaUrl = persistableRoomMediaUrl(value.mediaUrl ?? value.src);
  if (!text && !mediaUrl) return null;
  const mediaKind =
    value.mediaKind === "video" || value.kind === "video"
      ? "video"
      : value.mediaKind === "image" || value.kind === "image"
        ? "image"
        : undefined;
  return {
    id: String(value.id ?? uid("post")),
    authorName: String(value.authorName ?? "Host"),
    authorId: typeof value.authorId === "string" ? value.authorId : undefined,
    text: text || (mediaKind === "video" ? "Posted a video drop." : "Posted a photo drop."),
    createdAt: safeTime(value.createdAt),
    mediaUrl,
    mediaKind,
    bucket: typeof value.bucket === "string" ? value.bucket : undefined,
    storagePath: typeof value.storagePath === "string" ? value.storagePath : undefined,
    dropId: typeof value.dropId === "string" ? value.dropId : undefined,
    projectId: typeof value.projectId === "string" ? value.projectId : undefined,
  };
}

function toPersistedProject(project: BoardProject): BoardProject {
  return {
    ...project,
    media: persistableProjectCover(project.media),
  };
}

function durableProjectForStorage(project: BoardProject): BoardProject {
  const media = persistableProjectCover(project.media);
  if (!media?.src?.startsWith("data:")) {
    return { ...project, media };
  }
  if (media.storagePath) {
    return { ...project, media: { ...media, src: "" } };
  }
  return {
    ...project,
    media: undefined,
    notes: project.notes
      ? `${project.notes}\n\n[Local image omitted to fit browser storage.]`
      : "[Local image omitted to fit browser storage.]",
  };
}

function sanitizeProjectsForStorage(items: BoardProject[]) {
  return items.map(durableProjectForStorage);
}

function projectPersistSignature(project: BoardProject) {
  const media = persistableProjectCover(project.media);
  return [
    project.id,
    project.title,
    project.logline,
    project.location,
    project.startDate,
    project.endDate || "",
    project.rolesNeeded,
    project.unionStatus,
    project.compensationType,
    media?.kind || "",
    media?.storagePath || "",
    media?.src?.startsWith("data:") ? "data" : media?.src || "",
    String(project.invites?.length ?? 0),
    String(project.roomPosts?.length ?? 0),
  ].join("\0");
}

function projectsNeedPersist(stored: BoardProject[], resolved: BoardProject[]) {
  if (stored.length !== resolved.length) return true;
  const storedIds = new Set(stored.map((project) => project.id));
  const resolvedIds = new Set(resolved.map((project) => project.id));
  if ([...resolvedIds].some((id) => !storedIds.has(id))) return true;
  if ([...storedIds].some((id) => !resolvedIds.has(id))) return true;

  const storedById = new Map(stored.map((project) => [project.id, project]));
  return resolved.some((project) => {
    const existing = storedById.get(project.id);
    return !existing || projectPersistSignature(existing) !== projectPersistSignature(project);
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

function kindLooksProject(value: unknown) {
  return /^(project|project_drop|casting|casting_call|crew|crew_call|gig|audition)$/i.test(
    String(value ?? "").trim().replace(/[\s-]+/g, "_")
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

export function mergeProjectRecord(
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
    contactName: pickProjectHostName(base.contactName, incoming.contactName) || incoming.contactName || base.contactName,
    contactEmail: base.contactEmail || incoming.contactEmail,
    notes: base.notes || incoming.notes,
    goal: base.goal || incoming.goal,
    milestone: base.milestone || incoming.milestone,
    source: base.source || incoming.source,
    media: mergeProjectCover(base.media, incoming.media),
    authorId: base.authorId || incoming.authorId,
    authorName: pickProjectHostName(base.authorName, incoming.authorName) || incoming.authorName || base.authorName,
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
    roomPosts: mergeRoomPosts(base.roomPosts, incoming.roomPosts),
    updatedAt: Math.max(safeTime(base.updatedAt), safeTime(incoming.updatedAt)),
  };
}

export function projectFromBoardActivity(item: BoardActivity): BoardProject | null {
  return projectFromActivity(item);
}

function projectFromActivity(item: BoardActivity): BoardProject | null {
  const meta = item.meta ?? {};
  if (isSeededOrDemoProjectValue(item)) return null;

  if (
    !isExplicitProjectDropRecord({
      ...item,
      type: item.kind,
      meta,
    }) &&
    !kindLooksProject(item.kind)
  ) {
    return null;
  }

  const rawTitle =
    stripProjectPrefix(item.title ?? "") ||
    (typeof meta.preview?.title === "string" ? meta.preview.title : "");
  const title = rawTitle || "Untitled Project";
  const createdAt = safeTime(item.created_at);
  const contactName = pickProjectHostName(
    meta.contactName,
    meta.ownerLabel,
    meta.authorName,
    meta.displayName
  ) || "Project Host";
  const resolvedCover = resolveProjectCover({ ...item, meta }, persistableImageUrl(item.image_url));
  const authorName = pickProjectHostName(
    meta.authorName,
    meta.ownerLabel,
    contactName
  );
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
    location: resolveProjectLocation({ ...item, meta }),
    startDate: resolveProjectStartDate({ ...item, meta }),
    endDate: resolveProjectEndDate({ ...item, meta }) || undefined,
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
    source: notebookSourceForProjectRecord({ ...item, meta }),
    media: resolvedCover,
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

  if (
    !isExplicitProjectDropRecord({
      ...drop,
      type: (meta as any)?.dropType ?? (meta as any)?.kind ?? drop.type,
      meta,
    })
  ) {
    return null;
  }

  const activityLike: BoardActivity = {
    id:
      (typeof meta.projectId === "string" && meta.projectId) ||
      String(drop.id || ""),
    created_at: new Date(drop.createdAt).toISOString(),
    user_id: drop.authorId || null,
    kind: "status",
    title: drop.title,
    body: drop.text,
    href: drop.href ?? null,
    image_url: resolveProjectCover({ ...drop, meta })?.src ?? null,
    meta: {
      ...meta,
      authorName: drop.authorName || meta.authorName,
      authorId: drop.authorId || meta.authorId,
      source: notebookSourceForProjectRecord({ ...drop, meta }),
    },
  };

  return projectFromActivity(activityLike);
}

function projectFromUniversalDrop(drop: UniversalDrop): BoardProject | null {
  if (isSeededOrDemoProjectValue(drop)) return null;
  if (drop.type !== "project") return null;
  if (
    !isExplicitProjectDropRecord({
      ...drop,
      type: drop.type,
      meta: drop.meta,
      origin: drop.origin,
      source: drop.source,
    })
  ) {
    return null;
  }

  const meta = drop.meta ?? {};
  const createdAt = safeTime(drop.createdAt);
  const title = stripProjectPrefix(drop.title || "") || "Untitled Project";
  const logline =
    drop.description ||
    (typeof meta.description === "string" ? meta.description : "") ||
    "";
  const identity = readCurrentBoardIdentity();
  const cover = resolveProjectCover(drop, drop.imageUrl || drop.mediaUrl || null);
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
    location: resolveProjectLocation(drop),
    startDate: resolveProjectStartDate(drop),
    endDate: resolveProjectEndDate(drop) || undefined,
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
    media: cover,
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
  const cover = resolveProjectCover({ ...value, payload });
  const location = resolveProjectLocation({ ...value, payload });
  const startDate = resolveProjectStartDate({ ...value, payload });
  const endDate = resolveProjectEndDate({ ...value, payload });
  const projectType =
    String(value.projectType ?? payload?.projectType ?? "").trim() || "Project Drop";

  return {
    id: `droppad_${id}`,
    createdAt,
    updatedAt: createdAt,
    title,
    logline: body,
    projectType,
    status: normalizeProjectStatus(value.status ?? payload?.status),
    location,
    startDate,
    endDate: endDate || undefined,
    unionStatus: String(value.unionStatus ?? payload?.unionStatus ?? "Negotiable"),
    compensationType: String(value.compensationType ?? payload?.compensationType ?? "Negotiable"),
    rolesNeeded: String(value.rolesNeeded ?? payload?.rolesNeeded ?? body),
    contactName: String(value.authorName ?? value.contactName ?? payload?.contactName ?? "Project Host"),
    contactEmail: String(value.contactEmail ?? payload?.contactEmail ?? ""),
    notes:
      body ||
      (typeof payload?.url === "string" ? payload.url : undefined) ||
      (typeof payload?.embedUrl === "string" ? payload.embedUrl : undefined),
    media: cover,
    authorName:
      typeof value.authorName === "string" ? value.authorName : undefined,
    authorUsername:
      typeof value.authorUsername === "string" ? value.authorUsername : undefined,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    authorGlow: typeof value.authorGlow === "string" ? value.authorGlow : undefined,
    source: "drop_pad_projects",
    invites: [],
    roomPosts: seedRoomPosts(title, String(value.authorName ?? value.contactName ?? "Project Host")),
  };
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
          location: resolveProjectLocation(value) || String(value?.location ?? ""),
          startDate: resolveProjectStartDate(value) || String(value?.startDate ?? ""),
          endDate: resolveProjectEndDate(value) || (typeof value?.endDate === "string" ? value.endDate : undefined),
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
          media: resolveProjectCover(value),
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
      .filter((project) => !isSeededOrDemoProject(project))
      .filter((project) => isStoredNotebookProject(project));

    const merged = new Map<string, BoardProject>();
    for (const project of normalized) {
      const existing = merged.get(project.id);
      merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
    }

    return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function resolveBoardProjects(): BoardProject[] {
  const stored = readBoardProjects();
  const merged = new Map<string, BoardProject>();

  for (const project of stored) {
    merged.set(project.id, project);
  }

  for (const project of readDropPadProjectProjects()) {
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
  }

  for (const item of getLocalActivity()) {
    const project = projectFromActivity(item);
    if (!project) continue;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
  }

  for (const drop of readFeed()) {
    const project = projectFromFeed(drop);
    if (!project) continue;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
  }

  for (const drop of readDrops()) {
    const project = projectFromUniversalDrop(drop);
    if (!project) continue;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
  }

  return Array.from(merged.values())
    .filter((project) => !isSeededOrDemoProject(project))
    .filter((project) => isStoredNotebookProject(project))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function syncResolvedProjectsToStorage() {
  const stored = readBoardProjects();
  const resolved = resolveBoardProjects();

  if (projectsNeedPersist(stored, resolved)) {
    writeBoardProjects(resolved);
  }

  return resolved;
}

async function fetchRemoteProjectActivities(timeoutMs = 8000): Promise<BoardActivity[]> {
  if (typeof fetch !== "function") return [];
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch("/api/board/projects", {
      cache: "no-store",
      credentials: "include",
      signal: controller?.signal,
    });
    if (!response.ok) return [];
    const raw = await response.text();
    if (!raw.trim()) return [];
    const payload = JSON.parse(raw);
    return Array.isArray(payload?.activities) ? payload.activities : [];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function syncRemoteProjectActivitiesToStorage(sb: any) {
  try {
    let remoteActivities = await fetchRemoteProjectActivities();

    if (!remoteActivities.length) {
      const { data, error } = await sb
        .from("board_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);
      if (!error && Array.isArray(data)) {
        remoteActivities = data as BoardActivity[];
      }
    }

    const stored = syncResolvedProjectsToStorage();
    const merged = new Map(stored.map((project) => [project.id, project]));

    for (const item of remoteActivities) {
      const project = projectFromActivity(item as BoardActivity);
      if (!project) continue;
      const existing = merged.get(project.id);
      merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
    }

    const withRoomDrops = applyProjectRoomActivitiesToProjects(
      Array.from(merged.values()),
      remoteActivities as BoardActivity[]
    );

    const next = withRoomDrops
      .filter((project) => isStoredNotebookProject(project))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!next.length && stored.length) {
      return stored;
    }
    if (projectsNeedPersist(stored, next)) {
      writeBoardProjects(next);
      return next;
    }

    return next;
  } catch {
    return syncResolvedProjectsToStorage();
  }
}

export function writeBoardProjects(items: BoardProject[]) {
  const key = scopedProjectsKey();
  const realItems = items
    .filter(
      (project) => !isSeededOrDemoProject(project) && isStoredNotebookProject(project)
    )
    .map((project) =>
      toPersistedProject({
        ...project,
        source: project.source || notebookSourceForProjectRecord(project),
      })
    );
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
  const contactName = pickProjectHostName(input.contactName) || input.contactName.trim() || "Host";
  const identity = readCurrentBoardIdentity();
  const authorName =
    pickProjectHostName(input.authorName, contactName, identity.displayName) || contactName;
  return {
    ...input,
    id: uid("project"),
    createdAt: now,
    updatedAt: now,
    contactName,
    authorId: input.authorId || identity.id,
    authorName,
    authorUsername: input.authorUsername || identity.username,
    authorAvatar: input.authorAvatar || identity.avatar,
    authorGlow: input.authorGlow || identity.glow,
    authorAuraIntensity: input.authorAuraIntensity ?? identity.auraIntensity,
    invites: [],
    roomPosts: seedRoomPosts(input.title, contactName),
  };
}

function asProjectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function projectsFromProfileBoardDrops(profile: {
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
  board_style?: unknown;
}): BoardProject[] {
  const projects: BoardProject[] = [];

  for (const drop of projectDropsFromProfileStyle(profile.board_style)) {
    const row = asProjectRecord(drop);
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const project = projectFromProfileBoardDrop(profile, row);
    if (project) projects.push(project);
  }

  return projects;
}

function projectFromProfileBoardDrop(
  profile: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
  },
  drop: Record<string, any>
): BoardProject | null {
  if (isSeededOrDemoProjectValue(drop)) return null;

  const meta = asProjectRecord(drop.meta);
  const type = String(drop.type ?? drop.dropType ?? "");
  const title = String(drop.title ?? "").trim();
  if (
    !isExplicitProjectDropRecord({ ...drop, type, meta, title }) &&
    !/\bproject(\s+drop)?\b/i.test(type)
  ) {
    return null;
  }

  const id = String(drop.id ?? "").trim();
  const projectId =
    (typeof meta.projectId === "string" && meta.projectId.trim()) ||
    id.replace(/^project_drop_/, "") ||
    id;
  const coverUrl =
    persistableImageUrl(drop.previewImage) ||
    persistableImageUrl(drop.imageUrl) ||
    persistableImageUrl(drop.mediaUrl) ||
    persistableImageUrl(drop.media?.src);
  const hostName =
    pickProjectHostName(
      drop.contactName,
      drop.authorName,
      meta.contactName,
      meta.authorName,
      profile.display_name,
      profile.username
    ) || "Project Host";

  return projectFromActivity({
    id: `profile_project_${profile.id ?? "user"}_${id}`,
    created_at: new Date(Number(drop.createdAt ?? Date.now()) || Date.now()).toISOString(),
    user_id: profile.id ?? null,
    kind: "board_drop",
    title: /^Project Drop:/i.test(title) ? title : `Project Drop: ${title || "Untitled Project"}`,
    body: String(drop.description ?? drop.logline ?? meta.description ?? title ?? "Project Drop"),
    href: "/board/work",
    image_url: coverUrl,
    meta: {
      ...meta,
      source: "work_board",
      origin: "project_notebook",
      kind: "project_drop",
      cardStyle: "project_drop",
      dropType: "project",
      projectId,
      projectType: drop.projectType ?? meta.projectType ?? type,
      location: drop.location ?? meta.location ?? null,
      startDate: drop.startDate ?? meta.startDate ?? null,
      endDate: drop.endDate ?? meta.endDate ?? null,
      rolesNeeded: drop.rolesNeeded ?? meta.rolesNeeded ?? null,
      contactName: drop.contactName ?? meta.contactName ?? hostName,
      contactEmail: drop.contactEmail ?? meta.contactEmail ?? null,
      status: drop.projectStatus ?? drop.status ?? meta.status ?? null,
      media: drop.media ?? meta.media ?? null,
      bucket: drop.bucket ?? meta.bucket ?? drop.media?.bucket ?? null,
      storagePath: drop.storagePath ?? meta.storagePath ?? drop.media?.storagePath ?? null,
      previewImage: coverUrl,
      authorName: hostName,
      authorUsername: profile.username ?? null,
      ownerLabel: hostName,
      ownerUsername: profile.username ?? null,
    },
  });
}

export function mergeProjectsIntoNotebook(incoming: BoardProject[]) {
  const stored = syncResolvedProjectsToStorage();
  if (!incoming.length) return stored;

  const merged = new Map(stored.map((project) => [project.id, project]));
  for (const project of incoming) {
    if (!isStoredNotebookProject(project)) continue;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecord(existing, project) : project);
  }

  const next = Array.from(merged.values())
    .filter((project) => isStoredNotebookProject(project))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (projectsNeedPersist(stored, next)) {
    writeBoardProjects(next);
  }

  return next;
}

export async function persistProjectDropToProfile(
  sb: any,
  userId: string,
  project: BoardProject
): Promise<void> {
  await persistProjectListToProfile(sb, userId, [project]);
}

export async function persistProjectListToProfile(
  sb: any,
  userId: string,
  projects: BoardProject[]
): Promise<void> {
  if (!projects.length) return;
  const { data: profile } = await sb
    .from("profiles")
    .select("board_style, display_name, username")
    .eq("id", userId)
    .maybeSingle();
  const currentStyle =
    profile?.board_style && typeof profile.board_style === "object"
      ? profile.board_style
      : {};
  const boardDrops = Array.isArray(currentStyle.boardDrops) ? [...currentStyle.boardDrops] : [];
  let notebook = Array.isArray(currentStyle[PROJECT_NOTEBOOK_STYLE_KEY])
    ? [...currentStyle[PROJECT_NOTEBOOK_STYLE_KEY]]
    : [];
  for (const drop of boardDrops) {
    if (!isCloudProjectDrop(drop)) continue;
    const id = String(drop?.id ?? "");
    if (!id || notebook.some((item: any) => String(item?.id ?? "") === id)) continue;
    notebook.push(drop);
  }
  for (const project of projects) {
    const row = profileBoardDropFromProject(project, {
      id: userId,
      username: profile?.username,
      display_name: profile?.display_name,
    });
    notebook = [row, ...notebook.filter((item: any) => String(item?.id ?? "") !== row.id)];
  }
  const { data: updated, error } = await sb
    .from("profiles")
    .update({
      board_style: {
        ...currentStyle,
        [PROJECT_NOTEBOOK_STYLE_KEY]: notebook.slice(0, 120),
        boardDrops: boardDrops.filter((item: any) => !isCloudProjectDrop(item)).slice(0, 120),
      },
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated?.id) throw new Error("Project Drop save did not update a profile row.");
}

export function notebookProjectsOwnedByViewer(
  projects: BoardProject[],
  userId: string | null
) {
  if (!userId) return projects;
  return projects.filter((project) => {
    const authorId = String(project.authorId ?? "").trim();
    return !authorId || authorId === userId;
  });
}

export async function persistProjectListToAccount(projects: BoardProject[]): Promise<boolean> {
  if (!projects.length) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const userId = await getCurrentUserId();
      if (userId) {
        await persistProjectListToProfile(supabaseBrowser(), userId, projects);
        return true;
      }
    } catch {
      // Retry, then fall through to the cookie-based API write.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return persistLocalProjectsViaApi(projects);
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
