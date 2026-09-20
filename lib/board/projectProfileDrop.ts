import {
  persistableImageUrl,
  persistableProjectCover,
  pickProjectHostName,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";

export type ProjectProfileDropInput = {
  id: string;
  title: string;
  logline?: string;
  projectType?: string;
  status?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  unionStatus?: string;
  compensationType?: string;
  rolesNeeded?: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  createdAt?: number;
  media?: ProjectCoverMedia;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
};

export function profileBoardDropFromProject(
  project: ProjectProfileDropInput,
  profile?: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
  }
) {
  const cover = persistableProjectCover(project.media);
  const coverUrl = persistableImageUrl(cover?.src);
  const dropId = `project_drop_${project.id}`;
  const hostName = pickProjectHostName(
    project.contactName,
    project.authorName,
    profile?.display_name,
    profile?.username
  );

  return {
    id: dropId,
    type: "Project",
    title: project.title,
    createdAt: project.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    description: project.logline || "",
    previewImage: coverUrl,
    imageUrl: coverUrl,
    mediaUrl: coverUrl,
    mediaKind: cover?.kind,
    bucket: cover?.bucket,
    storagePath: cover?.storagePath,
    media: cover,
    location: project.location || "",
    startDate: project.startDate || "",
    endDate: project.endDate || "",
    rolesNeeded: project.rolesNeeded || "",
    contactName: hostName || project.contactName || "",
    contactEmail: project.contactEmail || "",
    projectType: project.projectType || "Project",
    projectStatus: project.status || "casting",
    status: project.status || "casting",
    authorName: hostName || project.authorName || "",
    authorId: project.authorId || profile?.id || "",
    authorUsername: project.authorUsername || profile?.username || "",
    origin: "project_notebook",
    source: "work_board",
    meta: {
      cardStyle: "project_drop",
      dropType: "project",
      projectId: project.id,
      location: project.location || null,
      startDate: project.startDate || null,
      endDate: project.endDate || null,
      rolesNeeded: project.rolesNeeded || null,
      contactName: hostName || project.contactName || null,
      contactEmail: project.contactEmail || null,
      unionStatus: project.unionStatus || null,
      compensationType: project.compensationType || null,
      source: "work_board",
      media: cover,
      bucket: cover?.bucket || null,
      storagePath: cover?.storagePath || null,
    },
  };
}

export async function persistLocalProjectsViaApi(projects: ProjectProfileDropInput[]) {
  if (typeof fetch !== "function" || !projects.length) return false;
  try {
    const response = await fetch("/api/board/projects", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projects: projects.map((project) => ({
          id: project.id,
          title: project.title,
          logline: project.logline,
          projectType: project.projectType,
          status: project.status,
          location: project.location,
          startDate: project.startDate,
          endDate: project.endDate,
          unionStatus: project.unionStatus,
          compensationType: project.compensationType,
          rolesNeeded: project.rolesNeeded,
          contactName: project.contactName,
          contactEmail: project.contactEmail,
          createdAt: project.createdAt,
          media: persistableProjectCover(project.media),
          authorId: project.authorId,
          authorName: project.authorName,
          authorUsername: project.authorUsername,
        })),
      }),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return payload?.ok === true;
  } catch {
    return false;
  }
}
