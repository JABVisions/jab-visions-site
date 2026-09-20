import { persistableProjectCover } from "@/lib/board/projectCover";
import type { ProjectCoverUploadResult } from "@/lib/board/projectCoverUpload";
import type { BoardProject, ProjectStatus } from "@/lib/board/projects";

const PROJECT_STATUSES: ProjectStatus[] = [
  "casting",
  "staffing",
  "pre_production",
  "production",
  "post",
  "released",
];

/** Editor payload for creating or updating a Project Drop without touching room state. */
export type ProjectDropEditInput = {
  id: string;
  title: string;
  logline: string;
  projectType: string;
  status: ProjectStatus | string;
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
  media?: BoardProject["media"];
  createdAt: number;
};

export function isProjectDropStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.includes(String(value) as ProjectStatus);
}

/** Snapshot of notebook fields that the Project Drop editor can change. */
export function projectDropFromBoardProject(project: BoardProject): ProjectDropEditInput {
  return {
    id: project.id,
    title: project.title,
    logline: project.logline,
    projectType: project.projectType,
    status: isProjectDropStatus(project.status) ? project.status : "casting",
    location: project.location,
    startDate: project.startDate,
    endDate: project.endDate,
    unionStatus: project.unionStatus,
    compensationType: project.compensationType,
    rate: project.rate,
    rolesNeeded: project.rolesNeeded,
    contactName: project.contactName,
    contactEmail: project.contactEmail,
    notes: project.notes,
    goal: project.goal,
    milestone: project.milestone,
    media: project.media,
    createdAt: project.createdAt,
  };
}

/** Field patch for an existing project. Invites and room posts stay on the host record. */
export function boardProjectPatchFromDrop(
  drop: ProjectDropEditInput
): Partial<BoardProject> {
  return {
    title: drop.title,
    logline: drop.logline,
    projectType: drop.projectType,
    status: isProjectDropStatus(drop.status) ? drop.status : "casting",
    location: drop.location,
    startDate: drop.startDate,
    endDate: drop.endDate,
    unionStatus: drop.unionStatus,
    compensationType: drop.compensationType,
    rate: drop.rate,
    rolesNeeded: drop.rolesNeeded,
    contactName: drop.contactName,
    contactEmail: drop.contactEmail,
    notes: drop.notes,
    goal: drop.goal,
    milestone: drop.milestone,
    media: persistableProjectCover(drop.media) ?? drop.media,
  };
}

export function applyProjectDropUpdate(
  project: BoardProject,
  drop: ProjectDropEditInput
): BoardProject {
  return {
    ...project,
    ...boardProjectPatchFromDrop(drop),
    id: project.id,
    createdAt: project.createdAt,
    invites: project.invites,
    roomPosts: project.roomPosts,
    updatedAt: Date.now(),
  };
}

export function projectCoverFromUpload(
  uploaded: ProjectCoverUploadResult,
  kind: "image" | "video" = "image"
) {
  return {
    kind,
    src: uploaded.imageUrl,
    bucket: uploaded.bucket,
    storagePath: uploaded.storagePath,
  };
}

export function isProjectStudioVideoFile(file: { type?: string; name?: string }) {
  const type = String(file.type || "");
  const name = String(file.name || "");
  return type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name);
}

export function projectMediaFromStudioUpload(opts: {
  kind: "image" | "video";
  src: string;
  bucket?: string;
  storagePath?: string;
}): NonNullable<BoardProject["media"]> {
  return {
    kind: opts.kind,
    src: opts.src,
    ...(opts.bucket ? { bucket: opts.bucket } : {}),
    ...(opts.storagePath ? { storagePath: opts.storagePath } : {}),
  };
}
