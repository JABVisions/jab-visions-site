import type { BoardActivity } from "@/lib/board/activity";
import type { BoardDropSignal } from "@/lib/board/dropSignals";
import type { UniversalDrop } from "@/lib/board/drops/storage";
import { parseBoardStorageFromUrl, isPublicBoardStorageUrl } from "@/lib/board/musicPlayback";
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
  posterUrl?: string;
  posterBucket?: string;
  posterStoragePath?: string;
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

const inflightStudioSaves = new Map<string, Promise<void>>();
const finishedStudioSaves = new Set<string>();

/** Keep just-committed room media across stale notebook reloads. */
const COMMITTED_ROOM_POST_GUARD_MS = 24 * 60 * 60 * 1000;
const COMMITTED_ROOM_POSTS_SESSION_KEY = "jab_committed_room_posts_v1";
const committedRoomPostGuard = new Map<
  string,
  { posts: ProjectRoomPost[]; until: number }
>();

const removedRoomPostGuard = new Map<string, { keys: Set<string>; until: number }>();
let hydratedCommittedRoomPosts = false;

function persistCommittedRoomPostGuard() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const committed = Array.from(committedRoomPostGuard.entries()).map(([id, entry]) => ({
      id,
      posts: entry.posts,
      until: entry.until,
    }));
    const removed = Array.from(removedRoomPostGuard.entries()).map(([id, entry]) => ({
      id,
      keys: Array.from(entry.keys),
      until: entry.until,
    }));
    sessionStorage.setItem(
      COMMITTED_ROOM_POSTS_SESSION_KEY,
      JSON.stringify({ committed, removed })
    );
  } catch {
    // Private mode / quota — in-memory guard still applies.
  }
}

function hydrateCommittedRoomPostGuard() {
  if (hydratedCommittedRoomPosts) return;
  hydratedCommittedRoomPosts = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(COMMITTED_ROOM_POSTS_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      committed?: Array<{ id?: string; posts?: ProjectRoomPost[]; until?: number }>;
      removed?: Array<{ id?: string; keys?: string[]; until?: number }>;
    };
    const now = Date.now();
    for (const entry of parsed.committed ?? []) {
      const id = String(entry.id || "").trim();
      const posts = Array.isArray(entry.posts) ? entry.posts : [];
      const until = typeof entry.until === "number" ? entry.until : 0;
      if (!id || !posts.length || until <= now) continue;
      const existing = committedRoomPostGuard.get(id);
      committedRoomPostGuard.set(id, {
        posts: mergeRoomPosts(existing?.posts, posts),
        until: Math.max(existing?.until ?? 0, until),
      });
    }
    for (const entry of parsed.removed ?? []) {
      const id = String(entry.id || "").trim();
      const until = typeof entry.until === "number" ? entry.until : 0;
      if (!id || until <= now) continue;
      const existing = removedRoomPostGuard.get(id) ?? {
        keys: new Set<string>(),
        until: 0,
      };
      for (const key of entry.keys ?? []) {
        if (key) existing.keys.add(key);
      }
      existing.until = Math.max(existing.until, until);
      removedRoomPostGuard.set(id, existing);
    }
  } catch {
    // Ignore corrupt session snapshots.
  }
}

export function rememberCommittedRoomPosts(
  projectId: string,
  posts: ProjectRoomPost[] | null | undefined
) {
  const id = String(projectId || "").trim();
  if (!id) return;
  const keep = filterRemovedRoomPosts(
    id,
    (posts ?? []).filter(
      (post) => projectRoomPostHasMedia(post) || Boolean(String(post.dropId || "").trim())
    )
  );
  if (!keep.length) {
    committedRoomPostGuard.delete(id);
    persistCommittedRoomPostGuard();
    return;
  }
  const existing = committedRoomPostGuard.get(id);
  committedRoomPostGuard.set(id, {
    posts: mergeRoomPosts(existing?.posts, keep),
    until: Date.now() + COMMITTED_ROOM_POST_GUARD_MS,
  });
  persistCommittedRoomPostGuard();
}

export function forgetCommittedRoomPosts(projectId: string) {
  committedRoomPostGuard.delete(String(projectId || "").trim());
  removedRoomPostGuard.delete(String(projectId || "").trim());
  persistCommittedRoomPostGuard();
}

export function rememberRemovedRoomPost(
  projectId: string,
  post: {
    id?: string | null;
    dropId?: string | null;
    mediaUrl?: string | null;
    bucket?: string | null;
    storagePath?: string | null;
    text?: string | null;
  }
) {
  const id = String(projectId || "").trim();
  const key = roomPostIdentityKey(post);
  if (!id || !key) return;
  const existing = removedRoomPostGuard.get(id) ?? {
    keys: new Set<string>(),
    until: 0,
  };
  existing.keys.add(key);
  existing.until = Date.now() + COMMITTED_ROOM_POST_GUARD_MS;
  removedRoomPostGuard.set(id, existing);
  const guarded = committedRoomPostGuard.get(id);
  if (guarded) {
    const remaining = guarded.posts.filter((item) => roomPostIdentityKey(item) !== key);
    if (!remaining.length) committedRoomPostGuard.delete(id);
    else committedRoomPostGuard.set(id, { ...guarded, posts: remaining });
  }
  persistCommittedRoomPostGuard();
}

export function filterRemovedRoomPosts<T extends {
  id?: string | null;
  dropId?: string | null;
  mediaUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
  text?: string | null;
}>(
  projectId: string,
  posts: T[] | null | undefined
): T[] {
  const list = Array.isArray(posts) ? posts : [];
  const id = String(projectId || "").trim();
  const tomb = removedRoomPostGuard.get(id);
  if (!tomb) return list;
  if (Date.now() > tomb.until) {
    removedRoomPostGuard.delete(id);
    return list;
  }
  return list.filter((post) => {
    const key = roomPostIdentityKey(post);
    return !key || !tomb.keys.has(key);
  });
}

export function roomPostMatches(
  post: {
    id?: string | null;
    dropId?: string | null;
  },
  key: string
): boolean {
  const needle = String(key || "").trim();
  if (!needle) return false;
  return String(post.id || "").trim() === needle || String(post.dropId || "").trim() === needle;
}

export function removeProjectRoomPost(
  project: BoardProject,
  postKey: string
): { project: BoardProject; removed: ProjectRoomPost | null } {
  const needle = String(postKey || "").trim();
  const posts = Array.isArray(project.roomPosts) ? project.roomPosts : [];
  const removed = posts.find((post) => roomPostMatches(post, needle)) ?? null;
  if (!removed) return { project, removed: null };
  rememberRemovedRoomPost(project.id, removed);
  const remaining = filterRemovedRoomPosts(
    project.id,
    posts.filter((post) => !roomPostMatches(post, needle))
  );
  return {
    project: {
      ...project,
      roomPosts: remaining,
      updatedAt: Date.now(),
    },
    removed,
  };
}

export function applyCommittedRoomPostGuard(
  projects: BoardProject[] | null | undefined
): BoardProject[] {
  hydrateCommittedRoomPostGuard();
  const list = Array.isArray(projects) ? projects : [];
  const now = Date.now();
  for (const [id, entry] of committedRoomPostGuard) {
    if (now > entry.until) committedRoomPostGuard.delete(id);
  }
  for (const [id, entry] of removedRoomPostGuard) {
    if (now > entry.until) removedRoomPostGuard.delete(id);
  }
  if (!committedRoomPostGuard.size && !removedRoomPostGuard.size) return list;
  return list.map((project) => {
    const guarded = committedRoomPostGuard.get(project.id);
    const merged = guarded?.posts.length
      ? {
          ...project,
          roomPosts: mergeRoomPosts(project.roomPosts, guarded.posts),
        }
      : project;
    const roomPosts = filterRemovedRoomPosts(project.id, merged.roomPosts);
    if (roomPosts === merged.roomPosts) return merged;
    return { ...merged, roomPosts };
  });
}

/** Persist + activity must not block studio close after a verified room Drop. */
export const PROJECT_ROOM_CLOUD_SYNC_TIMEOUT_MS = 4_000;

export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const guarded = Promise.resolve(promise).then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const, value: fallback })
  );
  return Promise.race([
    guarded.then((result) => (result.ok ? result.value : fallback)),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), Math.max(0, ms));
    }),
  ]);
}

export function projectRoomStudioSaveKey(
  projectId: string,
  file: { name?: string; size?: number; lastModified?: number }
) {
  return `${projectId}:${String(file.name || "")}:${Number(file.size) || 0}:${Number(file.lastModified) || 0}`;
}

/** Returns false if this tape is already saving or already posted. */
export function claimProjectRoomStudioSave(key: string): boolean {
  if (!key || inflightStudioSaves.has(key) || finishedStudioSaves.has(key)) {
    return false;
  }
  inflightStudioSaves.set(key, Promise.resolve());
  return true;
}

export function releaseProjectRoomStudioSave(key: string, committed: boolean) {
  inflightStudioSaves.delete(key);
  if (committed) finishedStudioSaves.add(key);
}

/** One in-flight save per tape. Joiners await the same promise instead of posting again. */
export function runProjectRoomStudioSaveOnce(
  key: string,
  work: () => Promise<void>
): Promise<void> {
  if (!key) return work();
  if (finishedStudioSaves.has(key)) return Promise.resolve();
  const existing = inflightStudioSaves.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      await work();
      finishedStudioSaves.add(key);
    } finally {
      inflightStudioSaves.delete(key);
    }
  })();
  inflightStudioSaves.set(key, promise);
  return promise;
}

export function roomPostIdentityKey(post: {
  id?: string | null;
  dropId?: string | null;
  mediaUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
  text?: string | null;
}): string {
  const coords = projectRoomPostStorageCoords(post);
  if (coords?.storagePath) return `media:${coords.storagePath}`;
  const media = persistableProjectRoomMediaUrl(post.mediaUrl);
  if (media) return `media:${media.split("?")[0]}`;
  const dropId = String(post.dropId || "").trim();
  if (dropId) return `drop:${dropId}`;
  const text = String(post.text || "").trim().toLowerCase();
  if (text.startsWith("welcome to ")) return `welcome:${text}`;
  const id = String(post.id || "").trim();
  return id ? `id:${id}` : "";
}

export function persistableProjectRoomMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return null;
  return src;
}

function persistablePosterMediaUrl(value: unknown): string | undefined {
  const src = persistableProjectRoomMediaUrl(value);
  if (!src) return undefined;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) return undefined;
  if (isPublicBoardStorageUrl(src) && /\.(mp4|webm|mov|m4v)/i.test(src)) return undefined;
  return src;
}

export function projectRoomPostHasMedia(post: {
  mediaUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
}): boolean {
  return Boolean(
    persistableProjectRoomMediaUrl(post.mediaUrl) || projectRoomPostStorageCoords(post)
  );
}

export function preferredProjectRoomMediaSrc(opts: {
  signedUrl?: string | null;
  publicUrl?: string | null;
}): string {
  return String(opts.signedUrl || "").trim() || String(opts.publicUrl || "").trim();
}

export function projectRoomPostStorageCoords(post: {
  bucket?: string | null;
  storagePath?: string | null;
  mediaUrl?: string | null;
}): { bucket: string; storagePath: string } | null {
  const bucket = String(post.bucket || "").trim();
  let storagePath = String(post.storagePath || "").trim();
  if (storagePath && /^https?:\/\//i.test(storagePath)) {
    const parsedPath = parseBoardStorageFromUrl(storagePath);
    if (parsedPath) return parsedPath;
    storagePath = "";
  }
  if (bucket && storagePath) {
    return { bucket, storagePath: storagePath.split("?")[0].replace(/^\/+/, "") };
  }
  for (const url of [post.mediaUrl, post.storagePath]) {
    const parsed = url ? parseBoardStorageFromUrl(url) : null;
    if (parsed) return parsed;
  }
  return null;
}

export function projectRoomVideoPlaybackType(post: {
  mediaUrl?: string | null;
  storagePath?: string | null;
}): string {
  const src = String(post.storagePath || post.mediaUrl || "");
  if (/\.mov(\?|#|$)/i.test(src) || /\.qt(\?|#|$)/i.test(src)) return "video/quicktime";
  return "video/mp4";
}

export function projectRoomVideoLoadError(kind: "missing" | "unsigned"): string {
  if (kind === "missing") {
    return "This video didn't finish saving to Board storage. Try uploading it again.";
  }
  return "Couldn't load this video. Refresh and try again.";
}

export function projectRoomVideoSrcIsPlayable(url: string): boolean {
  const src = String(url || "").trim();
  if (!src) return false;
  if (src.startsWith("blob:") || src.startsWith("data:")) return true;
  if (isPublicBoardStorageUrl(src)) return false;
  return true;
}

export function isUnplayableProjectRoomVideoPost(post: {
  mediaKind?: string | null;
  mediaUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
}): boolean {
  if (!projectRoomPostIsVideo(post)) return false;
  if (projectRoomPostStorageCoords(post)) return false;
  const src = persistableProjectRoomMediaUrl(post.mediaUrl) || "";
  if (!src) return true;
  return !projectRoomVideoSrcIsPlayable(src);
}

export function projectHasVisibleRoomDrop(
  project: Pick<BoardProject, "roomPosts"> | null | undefined,
  match: {
    dropId?: string | null;
    storagePath?: string | null;
    mediaUrl?: string | null;
  }
): boolean {
  const posts = Array.isArray(project?.roomPosts) ? project!.roomPosts : [];
  const dropId = String(match.dropId || "").trim();
  const storagePath = String(match.storagePath || "").trim().split("?")[0];
  const mediaUrl = persistableProjectRoomMediaUrl(match.mediaUrl) || "";
  return posts.some((post) => {
    if (!projectRoomPostHasMedia(post)) return false;
    if (dropId && String(post.dropId || "").trim() === dropId) return true;
    const coords = projectRoomPostStorageCoords(post);
    if (storagePath && coords?.storagePath === storagePath) return true;
    const src = persistableProjectRoomMediaUrl(post.mediaUrl) || "";
    return Boolean(mediaUrl && src && src.split("?")[0] === mediaUrl.split("?")[0]);
  });
}

export function stripUnplayableProjectRoomVideos(
  posts: ProjectRoomPost[] | null | undefined,
  playable: ProjectRoomPost
): ProjectRoomPost[] {
  const authorId = String(playable.authorId || "").trim();
  return (posts ?? []).filter((post) => {
    if (!isUnplayableProjectRoomVideoPost(post)) return true;
    if (authorId && post.authorId && String(post.authorId) !== authorId) return true;
    return false;
  });
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
  const posterUrl =
    persistableProjectRoomMediaUrl(opts.media.posterUrl) ||
    (opts.media.kind === "image" ? persistableProjectRoomMediaUrl(mediaUrl) : null);
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
    previewImage: posterUrl,
    posterUrl: posterUrl,
    posterBucket: opts.media.posterBucket || null,
    posterStoragePath: opts.media.posterStoragePath || null,
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
    posterUrl: posterUrl || undefined,
    posterBucket: opts.media.posterBucket,
    posterStoragePath: opts.media.posterStoragePath,
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
    imageUrl:
      opts.media.kind === "image" ? mediaUrl : posterUrl || undefined,
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
    href: (() => {
      const persistable = persistableProjectRoomMediaUrl(mediaUrl);
      if (!persistable || isPublicBoardStorageUrl(persistable)) return null;
      return persistable;
    })(),
    image_url:
      opts.media.kind === "image"
        ? persistableProjectRoomMediaUrl(mediaUrl)
        : persistableProjectRoomMediaUrl(posterUrl),
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
      : posterUrl && opts.media.posterStoragePath
        ? {
            kind: "image" as const,
            src: posterUrl,
            ...(opts.media.posterBucket ? { bucket: opts.media.posterBucket } : {}),
            storagePath: opts.media.posterStoragePath,
          }
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

function preferredRoomPostMediaUrl(
  left?: string | null,
  right?: string | null
): string | undefined {
  const a = persistableProjectRoomMediaUrl(left) || "";
  const b = persistableProjectRoomMediaUrl(right) || "";
  if (a && projectRoomVideoSrcIsPlayable(a)) return a;
  if (b && projectRoomVideoSrcIsPlayable(b)) return b;
  return a || b || undefined;
}

export function mergeRoomPosts(
  base: ProjectRoomPost[] | null | undefined,
  incoming: ProjectRoomPost[] | null | undefined
): ProjectRoomPost[] {
  const merged = new Map<string, ProjectRoomPost>();
  for (const post of [...(incoming ?? []), ...(base ?? [])]) {
    if (!post) continue;
    const key = roomPostIdentityKey(post);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, post.id ? post : { ...post, id: key });
      continue;
    }
    merged.set(key, {
      ...post,
      ...existing,
      id: existing.id || post.id,
      dropId: existing.dropId || post.dropId,
      mediaUrl: preferredRoomPostMediaUrl(existing.mediaUrl, post.mediaUrl),
      mediaKind: existing.mediaKind || post.mediaKind,
      bucket: existing.bucket || post.bucket,
      storagePath: existing.storagePath || post.storagePath,
      posterUrl: existing.posterUrl || post.posterUrl,
      posterBucket: existing.posterBucket || post.posterBucket,
      posterStoragePath: existing.posterStoragePath || post.posterStoragePath,
      createdAt:
        existing.createdAt && post.createdAt
          ? Math.min(existing.createdAt, post.createdAt)
          : existing.createdAt || post.createdAt,
    });
  }
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function applyProjectRoomDropToProject(
  project: BoardProject,
  built: BuiltProjectRoomDrop
): BoardProject {
  const incoming = [built.post];
  const base =
    built.post.mediaKind === "video" && projectRoomVideoSrcIsPlayable(built.post.mediaUrl || "")
      ? stripUnplayableProjectRoomVideos(project.roomPosts, built.post)
      : project.roomPosts;
  return {
    ...project,
    media: built.coverMedia ?? project.media,
    roomPosts: mergeRoomPosts(base, incoming),
    updatedAt: Math.max(project.updatedAt, built.post.createdAt),
  };
}

/** Apply a room drop onto the open project list immediately (no React setState). */
export function commitProjectRoomDrop(
  projects: BoardProject[],
  project: BoardProject,
  built: BuiltProjectRoomDrop
): { projects: BoardProject[]; saved: BoardProject } {
  const list = Array.isArray(projects) ? projects : [];
  const index = list.findIndex((item) => item.id === project.id);
  const committed = applyProjectRoomDropToProject(
    index >= 0 ? list[index] : project,
    built
  );
  rememberCommittedRoomPosts(committed.id, committed.roomPosts);
  const next =
    index >= 0
      ? list.map((item, itemIndex) => (itemIndex === index ? committed : item))
      : [committed, ...list];
  return { projects: applyCommittedRoomPostGuard(next), saved: committed };
}

export function projectRoomPostIsVideo(post: {
  mediaKind?: string | null;
  mediaUrl?: string | null;
  storagePath?: string | null;
}): boolean {
  if (post.mediaKind === "video") return true;
  const src = String(post.mediaUrl || post.storagePath || "");
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src);
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

export function activityFromProjectRoomPost(
  post: ProjectRoomPost,
  project?: Pick<BoardProject, "id" | "title"> | null
): BoardActivity {
  const createdAt = Number.isFinite(post.createdAt) ? post.createdAt : Date.now();
  const dropId = String(post.dropId || post.id || "").trim();
  const mediaUrl = persistableProjectRoomMediaUrl(post.mediaUrl) || "";
  const coords = projectRoomPostStorageCoords(post);
  const kind: ProjectRoomDropMediaKind =
    post.mediaKind === "video" || projectRoomPostIsVideo(post) ? "video" : "image";
  const title = projectRoomDropTitle(
    project?.title || "Project",
    kind,
    coords?.storagePath
  );
  const body =
    post.text ||
    projectRoomDropBody(
      project?.title || "this project",
      post.authorName || "Someone",
      kind,
      coords?.storagePath
    );
  return {
    id: dropId ? `project_room_${dropId}` : `project_room_${post.id}`,
    created_at: new Date(createdAt).toISOString(),
    user_id: post.authorId || null,
    kind: "board_drop",
    title,
    body,
    href: (() => {
      const persistable = persistableProjectRoomMediaUrl(mediaUrl);
      if (!persistable || isPublicBoardStorageUrl(persistable)) return null;
      return persistable;
    })(),
    image_url: kind === "image" ? mediaUrl || null : persistableProjectRoomMediaUrl(post.posterUrl),
    meta: {
      cardStyle: PROJECT_ROOM_DROP_CARD,
      origin: PROJECT_ROOM_DROP_ORIGIN,
      source: "work_board",
      projectId: post.projectId || project?.id || null,
      dropId: dropId || post.id,
      dropType: kind === "video" ? "video" : "media",
      drop_flavor: kind === "video" ? "video" : "media",
      mediaKind: kind,
      mediaUrl: mediaUrl || null,
      bucket: coords?.bucket || post.bucket || null,
      storagePath: coords?.storagePath || post.storagePath || null,
      previewImage: persistableProjectRoomMediaUrl(post.posterUrl) || (kind === "image" ? mediaUrl : null),
      posterUrl: persistableProjectRoomMediaUrl(post.posterUrl),
      posterBucket: post.posterBucket || null,
      posterStoragePath: post.posterStoragePath || null,
      authorId: post.authorId || null,
      authorName: post.authorName || null,
      fileName: coords?.storagePath?.split("/").pop() || null,
      signalSeed: {
        type: PROJECT_ROOM_DROP_SIGNAL,
        projectId: post.projectId || project?.id || null,
        dropId: dropId || post.id,
      },
    },
  };
}

export function projectRoomDropDownloadKind(
  post: ProjectRoomPost
): "image" | "video" | "audio" | "file" | "none" {
  if (projectRoomPostIsVideo(post)) return "video";
  if (post.mediaKind === "image") return "image";
  const src = String(post.storagePath || post.mediaUrl || "");
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(src)) return "audio";
  if (projectRoomPostHasMedia(post)) return "file";
  return "none";
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
    persistableProjectRoomMediaUrl(meta.mediaUrl) ||
    undefined;
  const mediaKind: ProjectRoomDropMediaKind | undefined =
    media.kind === "video" || meta.mediaKind === "video"
      ? "video"
      : media.kind === "image" || meta.mediaKind === "image"
        ? "image"
        : undefined;
  const posterUrl =
    persistablePosterMediaUrl(meta.posterUrl) ||
    persistablePosterMediaUrl(media.posterUrl) ||
    persistablePosterMediaUrl(item.image_url) ||
    persistablePosterMediaUrl(meta.previewImage) ||
    undefined;
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
      posterUrl,
      posterBucket:
        typeof meta.posterBucket === "string"
          ? meta.posterBucket
          : typeof media.posterBucket === "string"
            ? media.posterBucket
            : undefined,
      posterStoragePath:
        typeof meta.posterStoragePath === "string"
          ? meta.posterStoragePath
          : typeof media.posterStoragePath === "string"
            ? media.posterStoragePath
            : undefined,
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
