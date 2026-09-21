import type { BoardActivity } from "@/lib/board/activity";
import {
  looksLikePosterImageUrl,
  playableFeedMediaSrc,
  playablePosterSrc,
} from "@/lib/board/feedDropMedia";
import { persistableProjectRoomMediaUrl } from "@/lib/board/projectRoomDrop";
import {
  persistableImageUrl,
  type ProjectCoverMedia,
} from "@/lib/board/projectCover";
import {
  uploadProjectCover,
  type ProjectCoverUploadResult,
} from "@/lib/board/projectCoverUpload";
import type { BoardProject, ProjectRoomPost } from "@/lib/board/projects";

export type VideoPosterMedia = {
  url: string;
  bucket: string;
  storagePath: string;
};

const CAPTURE_TIMEOUT_MS = 8_000;
const posterCaptureInflight = new Map<string, Promise<File | null>>();

function posterCacheKey(src: string) {
  return src.split("?")[0] || src;
}

/** First-frame still from a playable (signed or blob) video URL. Never the 65MB tape upload. */
export async function captureVideoPosterFile(src: string): Promise<File | null> {
  const playable = playableFeedMediaSrc(src);
  if (!playable) return null;
  if (typeof document === "undefined") return null;

  const key = posterCacheKey(playable);
  const existing = posterCaptureInflight.get(key);
  if (existing) return existing;

  const work = new Promise<File | null>((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");
    if (!playable.startsWith("blob:") && !playable.startsWith("data:")) {
      video.crossOrigin = "anonymous";
    }
    video.style.position = "fixed";
    video.style.left = "-240px";
    video.style.top = "0";
    video.style.width = "160px";
    video.style.height = "90px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";

    let settled = false;
    const timeoutId = window.setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

    function finish(file: File | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(file);
    }

    function grab() {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          finish(null);
          return;
        }
        const maxEdge = 720;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish(null);
              return;
            }
            finish(new File([blob], "video-poster.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.82
        );
      } catch {
        finish(null);
      }
    }

    video.addEventListener("loadeddata", () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = duration > 0.4 ? 0.2 : 0;
      } catch {
        grab();
      }
    });
    video.addEventListener("seeked", grab);
    video.addEventListener("error", () => finish(null));
    document.body.appendChild(video);
    video.src = playable;
  }).finally(() => {
    posterCaptureInflight.delete(key);
  });

  posterCaptureInflight.set(key, work);
  return work;
}

export async function captureVideoPosterFromFile(file: File): Promise<File | null> {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const isVideo =
    file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  if (!isVideo) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await captureVideoPosterFile(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadVideoPosterStill(file: File): Promise<VideoPosterMedia | null> {
  const uploaded = await uploadProjectCover(file);
  return videoPosterFromUpload(uploaded);
}

export function videoPosterFromUpload(
  uploaded: ProjectCoverUploadResult | null | undefined
): VideoPosterMedia | null {
  if (!uploaded?.bucket || !uploaded.storagePath) return null;
  const url = persistableImageUrl(uploaded.imageUrl) || "";
  return {
    url,
    bucket: uploaded.bucket,
    storagePath: uploaded.storagePath,
  };
}

export function posterCoverMedia(poster: VideoPosterMedia | null | undefined): ProjectCoverMedia | undefined {
  if (!poster) return undefined;
  return {
    kind: "image",
    src: poster.url,
    bucket: poster.bucket,
    storagePath: poster.storagePath,
  };
}

export function activityMetaWithPoster(
  meta: Record<string, any> | null | undefined,
  poster: VideoPosterMedia
): Record<string, any> {
  const prev = meta && typeof meta === "object" ? meta : {};
  const preview =
    prev.preview && typeof prev.preview === "object" ? prev.preview : {};
  return {
    ...prev,
    previewImage: poster.url || prev.previewImage || null,
    posterUrl: poster.url || prev.posterUrl || null,
    posterBucket: poster.bucket,
    posterStoragePath: poster.storagePath,
    preview: {
      ...preview,
      previewImage: poster.url || preview.previewImage || null,
      posterUrl: poster.url || preview.posterUrl || null,
      posterBucket: poster.bucket,
      posterStoragePath: poster.storagePath,
    },
  };
}

export function applyPosterToRoomPost(
  post: ProjectRoomPost,
  poster: VideoPosterMedia
): ProjectRoomPost {
  return {
    ...post,
    posterUrl: persistableProjectRoomMediaUrl(poster.url) || post.posterUrl,
    posterBucket: poster.bucket,
    posterStoragePath: poster.storagePath,
  };
}

export function applyPosterToProjects(
  projects: BoardProject[],
  dropId: string,
  poster: VideoPosterMedia
): BoardProject[] {
  const id = String(dropId || "").trim();
  if (!id) return projects;
  return projects.map((project) => {
    const posts = Array.isArray(project.roomPosts) ? project.roomPosts : [];
    let changed = false;
    const nextPosts = posts.map((post) => {
      if (post.dropId !== id && post.id !== id && `project_room_${post.dropId}` !== id) {
        return post;
      }
      changed = true;
      return applyPosterToRoomPost(post, poster);
    });
    if (!changed) return project;
    const cover =
      project.media?.kind === "video" || !project.media
        ? posterCoverMedia(poster)
        : project.media;
    return {
      ...project,
      media: cover ?? project.media,
      roomPosts: nextPosts,
      updatedAt: Date.now(),
    };
  });
}

export function playableVideoPosterSrc(url?: string | null): string {
  return playablePosterSrc(url);
}

export function posterLooksStored(url?: string | null): boolean {
  return looksLikePosterImageUrl(url);
}

export function activityWithPoster(
  item: BoardActivity,
  poster: VideoPosterMedia
): BoardActivity {
  return {
    ...item,
    image_url: persistableImageUrl(poster.url) || item.image_url,
    meta: activityMetaWithPoster(item.meta, poster),
  };
}

/** Store a small still (not the tape) onto the Drop, activity row, and room post. */
export async function persistGeneratedVideoPoster(opts: {
  dropId?: string | null;
  activityId?: string | null;
  projectId?: string | null;
  poster: VideoPosterMedia;
}): Promise<void> {
  const dropId = String(opts.dropId || "").trim();
  const activityId = String(opts.activityId || "").trim();
  const persistableUrl = persistableImageUrl(opts.poster.url);
  const posterFields = {
    previewImage: persistableUrl,
    posterUrl: persistableUrl,
    posterBucket: opts.poster.bucket,
    posterStoragePath: opts.poster.storagePath,
  };

  try {
    const { persistActivityEdit, patchLocalActivitiesMatchingDrop } = await import(
      "@/lib/board/activity"
    );
    if (activityId) {
      await persistActivityEdit(activityId, {
        image_url: persistableUrl,
        meta: posterFields,
      });
    }
    if (dropId && patchLocalActivitiesMatchingDrop) {
      patchLocalActivitiesMatchingDrop(dropId, (item) => activityWithPoster(item, opts.poster));
    }
  } catch {
    // Local still still shows even if activity persist fails.
  }

  try {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (auth?.user && dropId) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dropId);
      const orFilter = [
        `meta->>dropId.eq.${dropId}`,
        `meta->>originalDropId.eq.${dropId}`,
        ...(isUuid ? [`id.eq.${dropId}`] : []),
        ...(activityId ? [`id.eq.${activityId}`] : []),
      ].join(",");
      const { data: rows } = await sb
        .from("board_activity")
        .select("id, image_url, meta, user_id")
        .eq("user_id", auth.user.id)
        .or(orFilter);
      for (const row of rows || []) {
        const nextMeta = activityMetaWithPoster(
          row.meta && typeof row.meta === "object" ? row.meta : {},
          opts.poster
        );
        await sb
          .from("board_activity")
          .update({
            image_url: persistableUrl,
            meta: nextMeta,
          })
          .eq("id", row.id)
          .eq("user_id", auth.user.id);
      }
    }
  } catch {
    // Room/local still is enough if feed row persist is blocked.
  }

  if (!dropId && !opts.projectId) return;
  try {
    const { resolveBoardProjects, writeBoardProjects, persistProjectListToAccount } =
      await import("@/lib/board/projects");
    const next = applyPosterToProjects(resolveBoardProjects(), dropId || activityId, opts.poster);
    writeBoardProjects(next);
    const projectId = String(opts.projectId || "").trim();
    const owned = projectId ? next.filter((project) => project.id === projectId) : next.slice(0, 1);
    if (owned.length) {
      await persistProjectListToAccount(owned);
    }
  } catch {
    // Viewer-generated posters still render from the signed still.
  }
}
