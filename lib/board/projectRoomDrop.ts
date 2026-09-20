import type { BoardActivity } from "@/lib/board/activity";
import type { BoardDropSignal } from "@/lib/board/dropSignals";
import type { UniversalDrop } from "@/lib/board/drops/storage";
import { isProjectStudioVideoFile } from "@/lib/board/projectDropEdit";
import type {
  BoardProject,
  ProjectInvite,
  ProjectRoomPost,
} from "@/lib/board/projects";

export const PROJECT_ROOM_DROP_ORIGIN = "project_room";
export const PROJECT_ROOM_DROP_SIGNAL = "project_room_drop_created";
export const PROJECT_ROOM_DROP_CARD = "project_room_drop";

export type ProjectRoomDropMediaKind = "image" | "video";

export type ProjectRoomDropMedia = {
  kind: ProjectRoomDropMediaKind;
  src: string;
  bucket?: string;
  storagePath?: string;
};

export type ProjectRoomDropViewer = {
  id?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

export type ProjectRoomDropAuthor = {
  id: string;
  displayName: string;
  username?: string | null;
  avatar?: string | null;
  glow?: string | null;
  auraIntensity?: number | null;
};

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function persistableProjectRoomMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return null;
  return src;
}

export function normalizeIdentityToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function tokensMatch(left: unknown, right: unknown): boolean {
  const a = normalizeIdentityToken(left);
  const b = normalizeIdentityToken(right);
  return Boolean(a && b && a === b);
}

export function isProjectRoomHost(
  project: Pick<
    BoardProject,
    "authorId" | "authorName" | "authorUsername" | "contactName" | "contactEmail"
  >,
  viewer: ProjectRoomDropViewer
): boolean {
  const authorId = String(project.authorId ?? "").trim();
  const viewerId = String(viewer.id ?? "").trim();
  if (authorId && viewerId && authorId === viewerId) return true;
  if (!authorId) return true;
  if (tokensMatch(project.authorUsername, viewer.username)) return true;
  if (tokensMatch(project.contactEmail, viewer.email)) return true;
  if (tokensMatch(project.contactName, viewer.displayName)) return true;
  if (tokensMatch(project.authorName, viewer.displayName)) return true;
  return false;
}

export function matchingProjectInvite(
  project: Pick<BoardProject, "invites">,
  viewer: ProjectRoomDropViewer
): ProjectInvite | null {
  const invites = Array.isArray(project.invites) ? project.invites : [];
  return (
    invites.find((invite) => {
      return (
        tokensMatch(invite.handle, viewer.username) ||
        tokensMatch(invite.email, viewer.email) ||
        tokensMatch(invite.name, viewer.displayName)
      );
    }) ?? null
  );
}

/**
 * Hosts, joined/invited collaborators, and anyone currently viewing a room
 * they were invited into can post. Drop Console is not required.
 */
export function viewerCanPostToProjectRoom(
  project: Pick<
    BoardProject,
    | "id"
    | "authorId"
    | "authorName"
    | "authorUsername"
    | "contactName"
    | "contactEmail"
    | "invites"
  > | null
  | undefined,
  viewer: ProjectRoomDropViewer,
  opts?: { viewing?: boolean }
): boolean {
  if (!project?.id) return false;
  if (isProjectRoomHost(project, viewer)) return true;
  if (matchingProjectInvite(project, viewer)) return true;
  if (opts?.viewing) return true;
  return false;
}

export function projectRoomMediaKindForFile(file: {
  type?: string;
  name?: string;
}): ProjectRoomDropMediaKind | null {
  if (isProjectStudioVideoFile(file)) return "video";
  const type = String(file.type || "");
  const name = String(file.name || "");
  if (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(name)
  ) {
    return "image";
  }
  return null;
}

export function projectRoomDropLabel(
  kind: ProjectRoomDropMediaKind,
  fileName?: string
): "video" | "photo" | "art" {
  if (kind === "video") return "video";
  if (fileName && /board-art/i.test(fileName)) return "art";
  return "photo";
}

export function projectRoomDropTitle(
  projectTitle: string,
  kind: ProjectRoomDropMediaKind,
  fileName?: string
): string {
  const title = String(projectTitle || "Project").trim() || "Project";
  const label = projectRoomDropLabel(kind, fileName);
  if (label === "video") return `${title} — Audition tape`;
  if (label === "art") return `${title} — Art Drop`;
  return `${title} — Photo Drop`;
}

export function projectRoomDropBody(
  projectTitle: string,
  authorName: string,
  kind: ProjectRoomDropMediaKind,
  fileName?: string
): string {
  const title = String(projectTitle || "this project").trim() || "this project";
  const author = String(authorName || "Someone").trim() || "Someone";
  const label = projectRoomDropLabel(kind, fileName);
  if (label === "video") {
    return `${author} posted an audition tape in ${title}.`;
  }
  if (label === "art") {
    return `${author} posted art in ${title}.`;
  }
  return `${author} posted a photo in ${title}.`;
}

export type BuiltProjectRoomDrop = {
  dropId: string;
  post: ProjectRoomPost;
  drop: UniversalDrop;
  activity: BoardActivity;
  signal: BoardDropSignal;
  coverMedia: BoardProject["media"] | undefined;
};

export function buildProjectRoomDrop(opts: {
  project: Pick<
    BoardProject,
    "id" | "title" | "projectType" | "status" | "media"
  >;
  media: ProjectRoomDropMedia;
  author: ProjectRoomDropAuthor;
  fileName?: string;
  createdAt?: number;
  dropId?: string;
  postId?: string;
}): BuiltProjectRoomDrop {
  const createdAt = opts.createdAt ?? Date.now();
  const dropId = opts.dropId || uid("project_room");
  const postId = opts.postId || uid("post");
  const mediaUrl = persistableProjectRoomMediaUrl(opts.media.src) || opts.media.src;
  const label = projectRoomDropLabel(opts.media.kind, opts.fileName);
  const title = projectRoomDropTitle(
    opts.project.title,
    opts.media.kind,
    opts.fileName
  );
  const body = projectRoomDropBody(
    opts.project.title,
    opts.author.displayName,
    opts.media.kind,
    opts.fileName
  );
  const createdIso = new Date(createdAt).toISOString();
  const dropType = label === "video" ? "video" : "media";
  const meta = {
    cardStyle: PROJECT_ROOM_DROP_CARD,
    origin: PROJECT_ROOM_DROP_ORIGIN,
    source: "work_board",
    projectId: opts.project.id,
    dropId,
    dropType,
    drop_flavor: dropType,
    mediaKind: opts.media.kind,
    media: opts.media,
    bucket: opts.media.bucket || null,
    storagePath: opts.media.storagePath || null,
    previewImage: opts.media.kind === "image" ? mediaUrl : null,
    authorId: opts.author.id,
    authorName: opts.author.displayName,
    authorUsername: opts.author.username || null,
    authorAvatar: opts.author.avatar || null,
    authorGlow: opts.author.glow || null,
    authorAuraIntensity: opts.author.auraIntensity ?? null,
    fileName: opts.fileName || null,
    signalSeed: {
      type: PROJECT_ROOM_DROP_SIGNAL,
      projectId: opts.project.id,
      dropId,
    },
  };

  const post: ProjectRoomPost = {
    id: postId,
    authorName: opts.author.displayName,
    authorId: opts.author.id,
    text: body,
    createdAt,
    mediaUrl,
    mediaKind: opts.media.kind,
    bucket: opts.media.bucket,
    storagePath: opts.media.storagePath,
    dropId,
    projectId: opts.project.id,
  };

  const drop: UniversalDrop = {
    id: dropId,
    type: opts.media.kind === "video" ? "video" : "link",
    title,
    createdAt,
    url: mediaUrl,
    description: body,
    mediaUrl,
    mediaKind: opts.media.kind,
    imageUrl: opts.media.kind === "image" ? mediaUrl : undefined,
    authorId: opts.author.id,
    authorName: opts.author.displayName,
    authorUsername: opts.author.username || undefined,
    authorAvatar: opts.author.avatar || undefined,
    authorGlow: opts.author.glow || undefined,
    authorAuraIntensity: opts.author.auraIntensity ?? undefined,
    projectId: opts.project.id,
    projectType: opts.project.projectType,
    projectStatus: opts.project.status,
    source: "work_board",
    origin: PROJECT_ROOM_DROP_ORIGIN,
    meta,
  };

  const activity: BoardActivity = {
    id: `project_room_${dropId}`,
    created_at: createdIso,
    user_id: opts.author.id,
    kind: "board_drop",
    title,
    body,
    href: persistableProjectRoomMediaUrl(mediaUrl),
    image_url:
      opts.media.kind === "image" ? persistableProjectRoomMediaUrl(mediaUrl) : null,
    meta,
  };

  const signal: BoardDropSignal = {
    type: PROJECT_ROOM_DROP_SIGNAL,
    dropId,
    projectId: opts.project.id,
    userId: opts.author.id,
    title,
    createdAt: createdIso,
    meta: {
      origin: PROJECT_ROOM_DROP_ORIGIN,
      mediaKind: opts.media.kind,
      source: "work_board",
    },
  };

  return {
    dropId,
    post,
    drop,
    activity,
    signal,
    coverMedia: opts.project.media
      ? undefined
      : {
          kind: opts.media.kind,
          src: mediaUrl,
          ...(opts.media.bucket ? { bucket: opts.media.bucket } : {}),
          ...(opts.media.storagePath
            ? { storagePath: opts.media.storagePath }
            : {}),
        },
  };
}

export function mergeRoomPosts(
  base: ProjectRoomPost[] | null | undefined,
  incoming: ProjectRoomPost[] | null | undefined
): ProjectRoomPost[] {
  const merged = new Map<string, ProjectRoomPost>();
  for (const post of [...(incoming ?? []), ...(base ?? [])]) {
    if (!post?.id) continue;
    const existing = merged.get(post.id);
    merged.set(post.id, existing ? { ...existing, ...post } : post);
  }
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function applyProjectRoomDropToProject(
  project: BoardProject,
  built: BuiltProjectRoomDrop
): BoardProject {
  return {
    ...project,
    media: built.coverMedia ?? project.media,
    roomPosts: mergeRoomPosts(project.roomPosts, [built.post]),
    updatedAt: Math.max(project.updatedAt, built.post.createdAt),
  };
}

export function isProjectRoomDropActivity(item: {
  kind?: unknown;
  meta?: Record<string, any> | null;
} | null | undefined): boolean {
  const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
  const origin = String(meta.origin ?? "").trim().toLowerCase();
  const cardStyle = String(meta.cardStyle ?? "").trim().toLowerCase();
  const signalType = String(meta.signalSeed?.type ?? "").trim();
  return (
    origin === PROJECT_ROOM_DROP_ORIGIN ||
    cardStyle === PROJECT_ROOM_DROP_CARD ||
    signalType === PROJECT_ROOM_DROP_SIGNAL
  );
}

export function projectRoomPostFromActivity(
  item: BoardActivity
): { projectId: string; post: ProjectRoomPost } | null {
  if (!isProjectRoomDropActivity(item)) return null;
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const projectId = String(meta.projectId ?? "").trim();
  if (!projectId) return null;
  const media =
    meta.media && typeof meta.media === "object" ? meta.media : {};
  const mediaUrl =
    persistableProjectRoomMediaUrl(media.src) ||
    persistableProjectRoomMediaUrl(item.href) ||
    persistableProjectRoomMediaUrl(meta.previewImage) ||
    undefined;
  const mediaKind: ProjectRoomDropMediaKind | undefined =
    media.kind === "video" || meta.mediaKind === "video"
      ? "video"
      : media.kind === "image" || meta.mediaKind === "image"
        ? "image"
        : undefined;
  const createdAt = Date.parse(item.created_at);
  return {
    projectId,
    post: {
      id: String(meta.dropId ? `post_${meta.dropId}` : item.id),
      authorName: String(meta.authorName || "Collaborator"),
      authorId: typeof meta.authorId === "string" ? meta.authorId : item.user_id || undefined,
      text: item.body,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      mediaUrl,
      mediaKind,
      bucket: typeof meta.bucket === "string" ? meta.bucket : media.bucket,
      storagePath:
        typeof meta.storagePath === "string" ? meta.storagePath : media.storagePath,
      dropId: typeof meta.dropId === "string" ? meta.dropId : undefined,
      projectId,
    },
  };
}

export function applyProjectRoomActivitiesToProjects(
  projects: BoardProject[],
  activities: BoardActivity[]
): BoardProject[] {
  if (!projects.length || !activities.length) return projects;
  const extras = new Map<string, ProjectRoomPost[]>();
  for (const item of activities) {
    const parsed = projectRoomPostFromActivity(item);
    if (!parsed) continue;
    const list = extras.get(parsed.projectId) ?? [];
    extras.set(parsed.projectId, [...list, parsed.post]);
  }
  if (!extras.size) return projects;
  return projects.map((project) => {
    const posts = extras.get(project.id);
    if (!posts?.length) return project;
    return {
      ...project,
      roomPosts: mergeRoomPosts(project.roomPosts, posts),
      updatedAt: Math.max(
        project.updatedAt,
        ...posts.map((post) => post.createdAt)
      ),
    };
  });
}
