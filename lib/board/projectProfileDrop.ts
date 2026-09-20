import {
  persistableImageUrl,
  persistableProjectCover,
  pickProjectHostName,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";

export const PROJECT_NOTEBOOK_STYLE_KEY = "projectNotebook";

export function isCloudProjectDrop(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const drop = item as Record<string, any>;
  const meta =
    drop.meta && typeof drop.meta === "object" && !Array.isArray(drop.meta)
      ? drop.meta
      : {};
  const id = String(drop.id ?? "");
  const type = String(drop.type ?? drop.dropType ?? "");
  const origin = String(drop.origin ?? meta.origin ?? "");
  const dropType = String(meta.dropType ?? drop.dropType ?? "");
  return (
    id.startsWith("project_drop_") ||
    origin === "project_notebook" ||
    /^project$/i.test(type) ||
    dropType === "project" ||
    dropType === "project_drop"
  );
}

export function projectDropsFromProfileStyle(style: unknown): any[] {
  const record =
    style && typeof style === "object" && !Array.isArray(style)
      ? (style as Record<string, any>)
      : {};
  const notebook = Array.isArray(record[PROJECT_NOTEBOOK_STYLE_KEY])
    ? record[PROJECT_NOTEBOOK_STYLE_KEY]
    : [];
  const drops = Array.isArray(record.boardDrops) ? record.boardDrops : [];
  const deleted = new Set(
    (Array.isArray(record.boardDropsDeleted) ? record.boardDropsDeleted : []).map(String)
  );
  const merged = new Map<string, any>();
  for (const drop of [...notebook, ...drops]) {
    if (!drop || typeof drop !== "object") continue;
    const id = String((drop as { id?: unknown }).id ?? "").trim();
    if (!id || deleted.has(id) || !isCloudProjectDrop(drop)) continue;
    if (!merged.has(id)) merged.set(id, drop);
  }
  return Array.from(merged.values());
}

export function mergeCollectionPreservingProjectDrops(
  collection: any[],
  remote: any[]
) {
  const next = Array.isArray(collection) ? collection.filter((drop) => !isCloudProjectDrop(drop)) : [];
  const seen = new Set(next.map((drop) => String(drop?.id ?? "")));
  const preserved = (Array.isArray(remote) ? remote : []).filter((drop) => {
    const id = String(drop?.id ?? "");
    return Boolean(id) && isCloudProjectDrop(drop) && !seen.has(id);
  });
  return [...preserved, ...next];
}

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
  roomPosts?: Array<{
    id?: string;
    authorName?: string;
    authorId?: string;
    text?: string;
    createdAt?: number;
    mediaUrl?: string;
    mediaKind?: "image" | "video";
    bucket?: string;
    storagePath?: string;
    dropId?: string;
    projectId?: string;
  }>;
};

function persistableNotebookRoomPosts(
  posts: ProjectProfileDropInput["roomPosts"]
) {
  if (!Array.isArray(posts) || !posts.length) return [];
  const compact = [];
  const seen = new Set<string>();
  for (const post of posts) {
    if (!post || typeof post !== "object") continue;
    const storagePath = String(post.storagePath || "").trim().split("?")[0];
    const mediaUrl = String(post.mediaUrl || "").trim();
    const dropId = String(post.dropId || "").trim();
    const id = String(post.id || "").trim();
    const key = storagePath || mediaUrl.split("?")[0] || dropId || id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    compact.push({
      id: id || undefined,
      authorName: post.authorName,
      authorId: post.authorId,
      text: post.text,
      createdAt: post.createdAt,
      mediaKind: post.mediaKind,
      bucket: post.bucket,
      storagePath: storagePath || undefined,
      dropId: dropId || undefined,
      projectId: post.projectId,
      mediaUrl: storagePath ? undefined : mediaUrl || undefined,
    });
    if (compact.length >= 80) break;
  }
  return compact;
}

export function mergeNotebookRoomPosts(
  base: ProjectProfileDropInput["roomPosts"],
  incoming: ProjectProfileDropInput["roomPosts"]
) {
  return persistableNotebookRoomPosts([...(incoming ?? []), ...(base ?? [])]);
}

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
  const roomPosts = persistableNotebookRoomPosts(project.roomPosts);

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
    roomPosts,
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
      roomPosts,
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
          roomPosts: persistableNotebookRoomPosts(project.roomPosts),
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
